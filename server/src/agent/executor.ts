// EX2.5: Reactive Executor
// @see docs/phases/phase-ex2.md — EX2.5
//
// A reactive tool-calling loop where the LLM decides which tools to call
// dynamically based on observed results. Uses native OpenAI function calling.
// Inspired by Roo Code (stack-based loop, consecutive mistake detection,
// tool repetition detection) and Aider (Zod validation as "linter").

import { DynamicViewSchema, type DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ModelRouter } from '../llm/model-router.js';
import type { ToolRegistry } from './tools/tool-registry.js';
import { toolsToOpenAIFunctions } from './tools/tool-converter.js';
import type { ToolContext, AgentTool } from './tools/types.js';
import { checkGuardrails } from './guardrails.js';
import { ToolRepetitionDetector } from './safety/tool-repetition-detector.js';
import type { PlannerHints } from './planner.js';
import type { ChatMessage } from '../llm/provider.js';

// ── Agent Event Types ──

export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'generation_complete'; view: DynamicView }
  | { type: 'reflection'; feedback: string; action: 'approve' | 'fix' }
  | { type: 'safety_warning'; warning: 'consecutive_mistakes' | 'tool_repetition'; tool?: string; message?: string }
  | { type: 'error'; message: string };

// ── Executor Config ──

export interface ExecutorConfig {
  /** Maximum loop iterations (default: 20) */
  maxSteps: number;
  /** Consecutive turns without tool calls before abort (default: 3, from Roo Code) */
  maxConsecutiveMistakes: number;
  /** Same tool call N times before warning (default: 5, from Roo Code) */
  maxToolRepetitions: number;
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxSteps: 20,
  maxConsecutiveMistakes: 3,
  maxToolRepetitions: 5,
};

// ── Reactive Executor ──

export class ReactiveExecutor {
  private modelRouter: ModelRouter;
  private toolRegistry: ToolRegistry;
  private config: ExecutorConfig;

  constructor(
    modelRouter: ModelRouter,
    toolRegistry: ToolRegistry,
    config: Partial<ExecutorConfig> = {},
  ) {
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Reactive execution loop with native function calling.
   *
   * The LLM sees all tool definitions and calls them dynamically.
   * When it has enough data, it calls `generate_schema` to produce the final output.
   *
   * Inline self-correction: Zod validation failures, SSH errors, and tool blocks
   * are sent back as tool results — the LLM sees them and self-corrects.
   */
  async *execute(
    hints: PlannerHints,
    context: ToolContext,
  ): AsyncGenerator<AgentEvent> {
    yield* this.executeInternal(hints, context);
  }

  /**
   * Re-execute with fix instructions from the post-generation reflector.
   * Injects reflection issues into the system prompt so the LLM can fix them.
   */
  async *executeWithFixes(
    hints: PlannerHints,
    reflectionIssues: ReflectionIssue[],
    context: ToolContext,
  ): AsyncGenerator<AgentEvent> {
    yield* this.executeInternal(hints, context, reflectionIssues);
  }

  // ── Internal Loop ──

  private async *executeInternal(
    hints: PlannerHints,
    context: ToolContext,
    reflectionIssues?: ReflectionIssue[],
  ): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getAll();
    const openAITools = toolsToOpenAIFunctions(tools);

    const toolRepetitionDetector = new ToolRepetitionDetector(this.config.maxToolRepetitions);

    // Build initial messages
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: this.buildExecutorSystemPrompt(hints, reflectionIssues),
      },
      {
        role: 'user',
        content: this.buildInitialUserMessage(hints),
      },
    ];

    let stepCount = 0;
    let consecutiveMistakes = 0;

    // ── REACTIVE LOOP ──
    while (stepCount < this.config.maxSteps) {
      stepCount++;

      yield { type: 'thinking', message: `Step ${stepCount}...` };

      // Call LLM with native function calling
      const response = await this.modelRouter.chat({
        messages,
        tools: openAITools,
        tool_choice: 'auto',
      });

      const assistantMessage = response.message;

      // Append assistant message to history
      messages.push(assistantMessage);

      // ── Case 1: LLM called tools ──
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        consecutiveMistakes = 0; // Reset — LLM is doing something

        let didToolFailInCurrentTurn = false;
        let schemaCallResult: { toolCallId: string; schema: unknown } | null = null;

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: unknown;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            const errorResult = JSON.stringify({
              success: false,
              error: 'Invalid JSON in tool arguments',
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `${toolName}: invalid JSON arguments` };
            didToolFailInCurrentTurn = true;
            continue;
          }

          const tool = this.toolRegistry.get(toolName);
          if (!tool) {
            const errorResult = JSON.stringify({
              success: false,
              error: `Unknown tool: ${toolName}. Available tools: ${this.toolRegistry.getNames().join(', ')}`,
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `Unknown tool: ${toolName}` };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Tool repetition detection (from Roo Code)
          const repetitionKey = JSON.stringify({ name: toolName, args: toolArgs });
          if (toolRepetitionDetector.isRepeating(repetitionKey)) {
            const warningResult = JSON.stringify({
              success: false,
              error: `You have called ${toolName} with the same arguments ${this.config.maxToolRepetitions} times. Please try a different approach.`,
            });
            messages.push({ role: 'tool', content: warningResult, tool_call_id: toolCall.id });
            yield { type: 'safety_warning', warning: 'tool_repetition', tool: toolName };
            continue;
          }

          // Guardrail check
          const guard = checkGuardrails(tool, toolArgs);
          if (!guard.allowed) {
            const denialResult = JSON.stringify({
              success: false,
              error: `Tool blocked by guardrails: ${guard.reason}`,
            });
            messages.push({ role: 'tool', content: denialResult, tool_call_id: toolCall.id });
            yield { type: 'tool_blocked', tool: toolName, reason: guard.reason ?? 'Blocked' };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Execute tool
          const startTime = Date.now();
          try {
            const result = await tool.execute(toolArgs, context);
            const latencyMs = Date.now() - startTime;

            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            });
            yield {
              type: 'tool_result',
              tool: toolName,
              success: result.success,
              outputPreview: result.output.substring(0, 200),
              latencyMs,
            };

            if (!result.success) {
              didToolFailInCurrentTurn = true;
            }

            // Cache output for grep_output tool
            if (result.success && result.output) {
              context.previousOutputs.set(
                `${toolName}:${JSON.stringify(toolArgs)}`,
                result.output,
              );
            }

            // Track generate_schema calls
            if (toolName === 'generate_schema' && result.success && result.metadata?.schema) {
              schemaCallResult = { toolCallId: toolCall.id, schema: result.metadata.schema };
            }
          } catch (err) {
            const latencyMs = Date.now() - startTime;
            const errorResult = JSON.stringify({
              success: false,
              error: `Tool execution failed: ${(err as Error).message}`,
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield {
              type: 'tool_result',
              tool: toolName,
              success: false,
              outputPreview: (err as Error).message.substring(0, 200),
              latencyMs,
            };
            didToolFailInCurrentTurn = true;
          }
        }

        // Handle generate_schema result (inline Zod validation — "linter" from Aider)
        if (schemaCallResult && !didToolFailInCurrentTurn) {
          const zodResult = DynamicViewSchema.safeParse(schemaCallResult.schema);
          if (zodResult.success) {
            yield { type: 'generation_complete', view: zodResult.data };
            return; // Exit loop — we have a valid schema
          } else {
            // Zod error becomes a tool result → LLM self-corrects
            const zodErrorResult = JSON.stringify({
              success: false,
              error: `Schema validation failed. Fix these issues:\n${zodResult.error.message}`,
              zodErrors: zodResult.error.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
              })),
            });
            // Add correction context — the LLM will see this and fix
            messages.push({
              role: 'tool',
              content: zodErrorResult,
              tool_call_id: schemaCallResult.toolCallId,
            });
            yield {
              type: 'reflection',
              feedback: 'Zod validation failed, self-correcting...',
              action: 'fix',
            };
            // Loop continues — LLM will try to fix inline
          }
        }

      // ── Case 2: LLM responded with text only (no tool calls) ──
      } else {
        consecutiveMistakes++;

        // Consecutive mistake detection (from Roo Code)
        if (consecutiveMistakes >= this.config.maxConsecutiveMistakes) {
          yield {
            type: 'safety_warning',
            warning: 'consecutive_mistakes',
            message: `Agent has not called any tools for ${consecutiveMistakes} consecutive turns. Aborting.`,
          };
          yield {
            type: 'error',
            message: 'Agent stopped making progress. Please try rephrasing your request.',
          };
          return;
        }

        // Nudge the LLM to use tools
        messages.push({
          role: 'user',
          content: 'Please use the available tools to gather information and then call generate_schema to produce the final UI. Do not just respond with text.',
        });
      }
    }

    // Max steps reached
    yield {
      type: 'error',
      message: `Agent reached maximum step limit (${this.config.maxSteps}). Returning best available result.`,
    };
  }

  // ── Prompt Builders ──

  private buildExecutorSystemPrompt(
    hints: PlannerHints,
    reflectionIssues?: ReflectionIssue[],
  ): string {
    let prompt = `You are HeadlessOS's UI Generation Agent (Executor).
Your job is to gather data from a Linux server via tools and produce a DynamicViewSchema.

## User's Intent
${hints.intent}

## Expected Output
A DynamicViewSchema JSON object with these widgets: ${hints.expectedWidgets.join(', ')}
Interactivity: ${hints.interactivityLevel}
${hints.templateHint ? `Template hint: Use "${hints.templateHint}" as a starting point.` : ''}

## Data Sources Needed
${hints.dataSourceHints.map((h) => `- ${h}`).join('\n')}

## Workflow
1. Call get_server_context() to understand the server
2. Use exec_command() and sftp_read() to gather information
3. Optionally search_templates() for a matching template
4. When you have enough data, call generate_schema() with a complete DynamicViewSchema
5. If generate_schema() fails Zod validation, you'll see the errors — fix and retry

## Rules
- Gather all needed data BEFORE calling generate_schema()
- Use specific commands over broad ones
- If a command fails, try a fallback (e.g., nginx -T failed → try cat /etc/nginx/nginx.conf)
- If you need to read actual file content for editing, use sftp_read()
${hints.securityRequirements.needsWrite ? '- This request may need write-back capability. Include writeBack config in form widgets.' : ''}
${hints.securityRequirements.sensitiveData ? '- This involves sensitive data. Mask passwords in the UI.' : ''}`;

    if (reflectionIssues && reflectionIssues.length > 0) {
      prompt += `\n\n## Fix Instructions (from Post-Generation Reflector)
The previous generated schema had quality issues. Please address:
${reflectionIssues.map((issue, i) => `${i + 1}. [${issue.severity}] ${issue.description}${issue.fix ? ` → Fix: ${issue.fix}` : ''}${issue.didYouMean ? ` (did you mean: ${issue.didYouMean})` : ''}`).join('\n')}`;
    }

    return prompt;
  }

  private buildInitialUserMessage(hints: PlannerHints): string {
    return `Generate a ${hints.estimatedComplexity} ${hints.interactivityLevel} UI: ${hints.intent}`;
  }
}

// ── Reflection Issue type (shared with reflector) ──

export interface ReflectionIssue {
  severity: 'critical' | 'minor' | 'suggestion';
  widget?: string;
  description: string;
  fix: string;
  actualData?: string;
  didYouMean?: string;
}
