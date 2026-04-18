// EX2.7: UI Agent Orchestrator
// @see docs/phases/phase-ex2.md — EX2.7
//
// Top-level agent that orchestrates Planner → Reactive Executor → optional
// Post-Generation Reflector. Uses a stack-based loop (from Roo Code research)
// for the overall execution to prevent stack overflow on long sessions.

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ModelRouter } from '../llm/model-router.js';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { TemplateRegistry } from '../dynamic-ui/template-registry.js';
import { Planner, type PlannerHints } from './planner.js';
import { ReactiveExecutor, type AgentEvent } from './executor.js';
import { PostGenerationReflector, type ReflectionIssue } from './reflector.js';
import { ToolRegistry } from './tools/tool-registry.js';
import type { ToolContext } from './tools/types.js';
import { withTraceGen, setSpanAttributes } from '../observatory/context.js';
import type { SandboxManager } from './sandbox-manager.js';
import { sandboxExecTool } from './tools/sandbox-exec.js';

// ── Agent Meta ──

/**
 * Metadata about the agent generation session.
 * Returned with the final 'complete' event.
 */
export interface AgentMeta {
  /** Unique session ID */
  sessionId: string;
  /** Total wall-clock time (ms) */
  latencyMs: number;
  /** Total executor loop steps completed */
  stepsCompleted: number;
  /** How many reflection loops were executed (0 if skipped) */
  reflectionLoops: number;
  /** Optional warning if schema has known quality issues */
  warning?: string;
  /** Map of model roles to model names used */
  models: Record<string, string>;
}

// ── Agent Options ──

export interface UIAgentOptions {
  /** Max post-generation reflection retries (default: 2) */
  maxPostReflections?: number;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
  /** EX5-B.3: Enable sandbox mode for CLI discovery */
  sandboxMode?: boolean;
  /** EX5-B.3: CLI tool name to discover in sandbox (e.g. 'nginx', 'restic') */
  toolName?: string;
}

// ── Complete Event (extends AgentEvent) ──

export type UIAgentEvent =
  | AgentEvent
  | { type: 'complete'; view: DynamicView; meta: AgentMeta };

// ── Stack Item ──

interface StackItem {
  phase: 'plan' | 'execute' | 'reflect' | 're-execute';
  hints?: PlannerHints;
  view?: DynamicView;
  reflectionIssues?: ReflectionIssue[];
  attempt: number;
}

// ── UI Agent ──

export class UIAgent {
  private modelRouter: ModelRouter;
  private planner: Planner;
  private executor: ReactiveExecutor;
  private reflector: PostGenerationReflector;
  private ssh: ConnectionManager;
  private templateRegistry: TemplateRegistry;
  /** EX5-B.3: Optional sandbox manager for isolated CLI discovery */
  private sandboxManager?: SandboxManager;
  /** EX5-B.3: Tool registry for dynamic tool registration (sandbox_exec) */
  private toolRegistry?: ToolRegistry;

  constructor(deps: {
    modelRouter: ModelRouter;
    planner: Planner;
    executor: ReactiveExecutor;
    reflector: PostGenerationReflector;
    ssh: ConnectionManager;
    templateRegistry: TemplateRegistry;
    sandboxManager?: SandboxManager;
    toolRegistry?: ToolRegistry;
  }) {
    this.modelRouter = deps.modelRouter;
    this.planner = deps.planner;
    this.executor = deps.executor;
    this.reflector = deps.reflector;
    this.ssh = deps.ssh;
    this.templateRegistry = deps.templateRegistry;
    this.sandboxManager = deps.sandboxManager;
    this.toolRegistry = deps.toolRegistry;
  }

  /**
   * Generate a dynamic UI schema for the given user request.
   *
   * Uses a stack-based loop (from Roo Code) instead of recursion to
   * prevent stack overflow on long sessions with many reflection retries.
   *
   * Pipeline: Plan → Execute → optional Reflect → optional Re-execute → complete
   *
   * The entire session is wrapped in an Observatory trace (EX4-B.2).
   */
  async *generate(
    serverId: string,
    request: string,
    options: UIAgentOptions = {},
  ): AsyncGenerator<UIAgentEvent> {
    yield* withTraceGen<UIAgentEvent>(
      `UIAgent: ${request.slice(0, 50)}`,
      { trigger: 'ui-agent', serverId },
      () => this.generateCore(serverId, request, options),
    );
  }

  /**
   * Core generation logic extracted for Observatory tracing.
   * Runs inside a withTraceGen context so all child calls inherit the trace.
   */
  private async *generateCore(
    serverId: string,
    request: string,
    options: UIAgentOptions = {},
  ): AsyncGenerator<UIAgentEvent> {
    const sessionId = crypto.randomUUID();
    const maxPostReflections = options.maxPostReflections ?? 2;
    const signal = options.signal;
    const startTime = Date.now();
    let totalSteps = 0;

    // Record the user's request as input on the root AGENT span
    setSpanAttributes({ input: request });

    const context: ToolContext = {
      serverId,
      ssh: this.ssh,
      templateRegistry: this.templateRegistry,
      previousOutputs: new Map(),
    };

    // ── EX5-B.3: SANDBOX SETUP (when sandboxMode=true) ──
    let sandboxId: string | undefined;
    const useSandbox = options.sandboxMode && this.sandboxManager;

    if (useSandbox) {
      const toolName = options.toolName ?? this.extractToolName(request);
      try {
        yield { type: 'thinking', message: `Creating sandbox container for "${toolName}"...` };
        const sandbox = await this.sandboxManager!.create(serverId, toolName);
        sandboxId = sandbox.id;

        // Install tool in sandbox
        yield { type: 'thinking', message: `Installing ${toolName} in sandbox...` };
        try {
          await this.sandboxManager!.install(sandboxId, [toolName]);
        } catch {
          // Tool may already be in the base image or not installable — continue
          yield { type: 'thinking', message: `Note: ${toolName} may not need installation, continuing discovery...` };
        }

        // Wire sandbox into context
        context.sandboxManager = this.sandboxManager;
        context.activeSandboxId = sandboxId;

        // Register sandbox_exec tool for this session
        if (this.toolRegistry && !this.toolRegistry.has('sandbox_exec')) {
          this.toolRegistry.register(sandboxExecTool);
        }

        yield { type: 'thinking', message: 'Sandbox ready — discovering CLI structure...' };
      } catch (err) {
        yield {
          type: 'thinking',
          message: `Sandbox creation failed: ${err instanceof Error ? err.message : 'unknown'}. Falling back to direct execution.`,
        };
        sandboxId = undefined; // Clear so we don't try to destroy
      }
    }

    try {
    // ── STACK-BASED LOOP (from Roo Code) ──
    const stack: StackItem[] = [{ phase: 'plan', attempt: 0 }];

    while (stack.length > 0) {
      // Check abort signal
      if (signal?.aborted) {
        yield { type: 'error', message: 'Generation aborted by user' };
        return;
      }

      const item = stack.pop()!;

      switch (item.phase) {
        // ── PLAN ──
        case 'plan': {
          yield { type: 'thinking', message: 'Understanding your request...' };

          try {
            const hints = await this.planner.plan(request);
            yield {
              type: 'thinking',
              message: `Plan: expecting ${hints.expectedWidgets.join(', ')} (${hints.estimatedComplexity})`,
            };
            stack.push({ phase: 'execute', hints, attempt: 0 });
          } catch (err) {
            yield { type: 'error', message: `Planning failed: ${err instanceof Error ? err.message : String(err)}` };
            return;
          }
          break;
        }

        // ── EXECUTE (reactive tool-calling loop) ──
        case 'execute': {
          const hints = item.hints!;
          let generatedView: DynamicView | undefined;

          try {
            for await (const event of this.executor.execute(hints, context)) {
              if (signal?.aborted) {
                yield { type: 'error', message: 'Generation aborted by user' };
                return;
              }

              yield event;
              totalSteps++;

              if (event.type === 'generation_complete') {
                generatedView = event.view;
              }
            }
          } catch (err) {
            yield { type: 'error', message: `Execution failed: ${err instanceof Error ? err.message : String(err)}` };
            return;
          }

          if (!generatedView) {
            yield { type: 'error', message: 'Executor did not produce a schema' };
            break; // Stack empty → done
          }

          // Decide: skip reflection or run it?
          if (this.reflector.shouldSkip(hints)) {
            yield {
              type: 'complete',
              view: generatedView,
              meta: this.buildMeta(sessionId, startTime, totalSteps, 0),
            };
          } else {
            stack.push({
              phase: 'reflect',
              hints,
              view: generatedView,
              attempt: 0,
            });
          }
          break;
        }

        // ── REFLECT (post-generation quality check) ──
        case 'reflect': {
          const hints = item.hints!;
          const view = item.view!;

          let reflection;
          try {
            reflection = await this.reflector.reflect(
              request,
              hints,
              context.previousOutputs,
              view,
            );
          } catch (err) {
            // Reflection failure should not block — use best attempt
            yield {
              type: 'complete',
              view,
              meta: this.buildMeta(sessionId, startTime, totalSteps, item.attempt, 'Reflection failed — using best attempt'),
            };
            break;
          }

          yield {
            type: 'reflection',
            feedback: reflection.summary,
            action: reflection.approved ? 'approve' : 'fix',
          };

          if (reflection.approved) {
            yield {
              type: 'complete',
              view,
              meta: this.buildMeta(sessionId, startTime, totalSteps, item.attempt + 1),
            };
          } else if (item.attempt < maxPostReflections - 1) {
            // Re-execute with fix instructions
            stack.push({
              phase: 're-execute',
              hints,
              reflectionIssues: reflection.issues,
              attempt: item.attempt + 1,
            });
          } else {
            // Max reflections reached — send best attempt with warning
            yield {
              type: 'complete',
              view,
              meta: this.buildMeta(
                sessionId,
                startTime,
                totalSteps,
                item.attempt + 1,
                'Schema may have quality issues — reflection could not fully resolve them',
              ),
            };
          }
          break;
        }

        // ── RE-EXECUTE (with reflection fix instructions) ──
        case 're-execute': {
          const issues = item.reflectionIssues ?? [];
          yield {
            type: 'thinking',
            message: `Fixing: ${issues[0]?.description ?? 'quality issues'}`,
          };

          let generatedView: DynamicView | undefined;

          try {
            for await (const event of this.executor.executeWithFixes(
              item.hints!,
              issues,
              context,
            )) {
              if (signal?.aborted) {
                yield { type: 'error', message: 'Generation aborted by user' };
                return;
              }

              yield event;
              totalSteps++;

              if (event.type === 'generation_complete') {
                generatedView = event.view;
              }
            }
          } catch (err) {
            yield { type: 'error', message: `Re-execution failed: ${err instanceof Error ? err.message : String(err)}` };
            return;
          }

          if (generatedView) {
            stack.push({
              phase: 'reflect',
              hints: item.hints,
              view: generatedView,
              attempt: item.attempt,
            });
          } else {
            yield { type: 'error', message: 'Re-execution failed to produce a schema' };
          }
          break;
        }
      }
    }
    } finally {
      // ── EX5-B.3: SANDBOX CLEANUP ──
      if (sandboxId && this.sandboxManager) {
        try {
          await this.sandboxManager.destroySandbox(sandboxId);
          yield { type: 'thinking', message: 'Sandbox destroyed ✓' };
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }

  // ── Helpers ──

  /**
   * Extract CLI tool name from a user request.
   * e.g., "build UI for nginx" → "nginx"
   *       "create a form for restic backup" → "restic"
   */
  private extractToolName(request: string): string {
    // Try common patterns
    const patterns = [
      /\bfor\s+(\w[\w.-]*)/i,        // "for nginx", "for restic"
      /\b(?:of|about)\s+(\w[\w.-]*)/i, // "about htop", "of docker"
      /\bui\s+(\w[\w.-]*)/i,           // "ui nginx"
    ];
    for (const pattern of patterns) {
      const match = request.match(pattern);
      if (match?.[1]) {
        const name = match[1].toLowerCase();
        // Skip common stop words
        if (!['the', 'a', 'an', 'this', 'that', 'my'].includes(name)) {
          return name;
        }
      }
    }
    // Fallback: last word that looks like a tool name
    const words = request.split(/\s+/).filter(w => /^[a-z][\w.-]*$/i.test(w));
    return words[words.length - 1]?.toLowerCase() ?? 'tool';
  }

  private buildMeta(
    sessionId: string,
    startTime: number,
    stepsCompleted: number,
    reflectionLoops: number,
    warning?: string,
  ): AgentMeta {
    const meta: AgentMeta = {
      sessionId,
      latencyMs: Date.now() - startTime,
      stepsCompleted,
      reflectionLoops,
      models: this.modelRouter.getModelMap(),
    };
    if (warning) {
      meta.warning = warning;
    }

    // EX4-B.2: Record agent session metadata on the trace root span
    setSpanAttributes({
      output: { stepsCompleted, reflectionLoops, warning },
      attributes: { sessionId, models: meta.models },
    });

    return meta;
  }
}
