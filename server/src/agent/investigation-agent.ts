// M11.5: ReAct Investigation Agent
// @see docs/DECISIONS.md (ADR-013, ADR-014)
//
// A read-only AI agent that investigates server issues by iteratively:
// 1. Thinking about what to check next
// 2. Running a catalog action (EX9.1 — never a model-written command)
// 3. Observing the output
// 4. Deciding whether to continue or give an answer

import { z } from 'zod';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { LLMProvider } from '../llm/provider.js';
import { EventEmitter } from 'events';
import { withTrace, withSpan, setSpanAttributes } from '../observatory/context.js';
import { runAsAgent } from '../services/policy/agent-scope.js';
import { ActionRunner, actionSignature, type ActionSsh, type ApprovalEvent, type RunnerDeps } from './actions/runner.js';
import { formatForModel, selectActions } from './actions/tools.js';
import { getDefaultCatalog } from './actions/catalog/index.js';
import type { ApprovalGate } from './actions/approvals.js';
import type { ActionDef, ActionRunResult } from './actions/types.js';

// ── Agent Step Schema (for structured LLM output) ───────

// EX9.1: the model names an action and its parameters; the server builds the command.
// Strict structured output cannot hold an open-ended object, so params travel as JSON text.
const AgentThoughtSchema = z.object({
  thought: z.string().describe('Your reasoning about what to investigate next'),
  action: z.string().nullable().describe('The action id to run, e.g. "disk_usage" (null when answering)'),
  params: z.string().nullable().describe('The action parameters as a JSON object, e.g. {"unit":"nginx"}; "{}" when it takes none'),
  answer: z.string().nullable().describe('Your final answer/diagnosis (only set this when you are confident you have the answer, null otherwise)'),
  decision: z.enum(['run_action', 'answer']).describe('"run_action" to run the action, "answer" to provide your final response'),
});

type AgentThought = z.infer<typeof AgentThoughtSchema>;

// ── Agent Step (public) ─────────────────────────────────

export interface AgentStep {
  stepNumber: number;
  thought: string;
  /** EX9.1: catalog action the step ran */
  action?: string;
  /** the command the server built for that action (shown to the owner) */
  command?: string;
  /** EX9.2: the owner's decision, for a change action */
  approval?: ActionRunResult['approval'];
  output?: string;
  observation?: string;
  decision: 'continue' | 'answer' | 'error';
}

export interface AgentResult {
  sessionId: string;
  question: string;
  steps: AgentStep[];
  answer: string;
  totalSteps: number;
  totalTokens: number;
  totalLatencyMs: number;
  status: 'completed' | 'aborted' | 'error' | 'max_steps_reached';
}

export interface AgentOptions {
  maxSteps?: number;
  /** EX9.2: false offers change actions too; each waits for the owner's approval */
  readOnly?: boolean;
  /** EX8.24: chosen by the client so it can open /ws/agent/:id/:sessionId before the run */
  sessionId?: string;
}

/** Client-chosen session ids are used only when they look like an id */
function pickSessionId(requested?: string): string {
  return requested && /^[A-Za-z0-9-]{8,64}$/.test(requested) ? requested : crypto.randomUUID();
}

// ── ReAct Agent ─────────────────────────────────────────

const DEFAULT_MAX_STEPS = 10;
/** EX9.1: actions listed in the prompt per question (ADR-024 §6) */
const OFFERED_ACTIONS = 40;

const CHANGE_RULES = `
## Changes (this run may change the server)
- Actions marked [changes the server] pause the run and show the owner the exact command, the server, the login user and your reason. Nothing happens until the owner allows it.
- Investigate first. Propose a change only when the evidence shows it will fix the problem, and give a specific "reason" in its params (e.g. "nginx is inactive since 09:12; restarting it should bring the site back").
- One change at a time. After it runs, check the result with a read action.
- If the owner declines, that is final for this run: do not retry it or work around it. Explain what you would have done.`;

function buildSystemPrompt(reads: ActionDef[], changes: ActionDef[]): string {
  const actions = [...reads, ...changes];
  const line = (a: ActionDef) =>
    `- ${actionSignature(a)} — ${a.description}${a.risk === 'change' ? ' [changes the server]' : ''}`;
  return `You are an expert Linux system administrator AI agent. You investigate server issues by running diagnostic actions and analyzing the output.

## How You Work (ReAct Loop)
1. **Think**: Analyze what you know and what you need to find out next
2. **Act**: Choose one action and its parameters
3. **Observe**: Review the action's output
4. Repeat until you have enough information to give a confident answer

## Actions
You cannot write shell commands. You pick an action by id and give its parameters as a JSON object; the server builds and runs the command. Available actions (id(parameters) — what it does):
${actions.map(line).join('\n')}

## Rules
- ${changes.length ? 'Read actions never change anything; actions marked [changes the server] need the owner\'s approval (see below)' : 'Every action is read-only; you cannot change the server'}
- One action per step: set decision to "run_action", action to its id and params to a JSON object ("{}" when it takes none)
- After each output, explain what you learned (observation)
- When you have enough evidence, provide a clear diagnosis and actionable recommendations
- Maximum steps: you'll be told the limit. Use your steps wisely.
- If an action fails, read the error: it says what was wrong with the parameters. Fix them or try another action
- Be specific in your diagnosis — cite actual values from the outputs${changes.length ? CHANGE_RULES : ''}`;
}

export class InvestigationAgent {
  private abortedSessions = new Set<string>();
  public events = new EventEmitter();

  private readonly runner: ActionRunner;
  private readonly approvals?: ApprovalGate;

  constructor(
    ssh: ConnectionManager | ActionSsh,
    private llmProvider: LLMProvider | null,
    deps: Omit<RunnerDeps, 'ssh'> = {},
  ) {
    this.runner = new ActionRunner({ ssh, ...deps });
    this.approvals = deps.approvals;
  }

  setLLMProvider(provider: LLMProvider | null): void {
    this.llmProvider = provider;
  }

  abort(sessionId: string): void {
    this.abortedSessions.add(sessionId);
    // EX9.2: Stop answers every approval the run is waiting on with deny
    this.approvals?.cancelRun(sessionId);
  }

  async investigate(
    serverId: string,
    question: string,
    options: AgentOptions = {},
  ): Promise<AgentResult> {
    if (!this.llmProvider) {
      return {
        sessionId: pickSessionId(options.sessionId),
        question,
        steps: [],
        answer: 'LLM provider is not configured. Please set up an API key in Settings > AI/LLM.',
        totalSteps: 0,
        totalTokens: 0,
        totalLatencyMs: 0,
        status: 'error',
      };
    }

    // EX9.1: an agent scope — CommandPolicy refuses anything the action runner did not build
    const sessionId = pickSessionId(options.sessionId);
    return runAsAgent({ runId: sessionId, agent: 'investigation' }, () =>
      withTrace(`Investigation: ${question.slice(0, 50)}`, {
        trigger: 'investigation-agent',
        serverId,
      }, () => this.investigateCore(serverId, question, options, sessionId)),
    );
  }

  private async investigateCore(
    serverId: string,
    question: string,
    options: AgentOptions,
    sessionId: string,
  ): Promise<AgentResult> {
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const changes = options.readOnly === false ? getDefaultCatalog().list({ risk: 'change' }) : [];
    const systemPrompt = buildSystemPrompt(selectActions(question, { max: OFFERED_ACTIONS }), changes);
    // EX9.2: approval cards go out on the progress socket, tagged with the step
    const approvalEvents = (step: number) => (e: ApprovalEvent) => {
      if (e.type === 'approval_required') {
        this.events.emit(`step:${sessionId}`, { kind: 'approval', step, request: e.request });
      } else {
        this.events.emit(`step:${sessionId}`, { kind: 'approval_resolved', step, approvalId: e.approvalId, decision: e.decision, by: e.by });
      }
    };
    const steps: AgentStep[] = [];
    // EX8.24: every recorded step goes out on the progress socket as it happens
    const record = (s: AgentStep) => {
      steps.push(s);
      this.events.emit(`step:${sessionId}`, { kind: 'step', step: s.stepNumber, data: s });
    };
    let totalTokens = 0;
    const startTime = Date.now();
    let finalAnswer = '';
    let status: AgentResult['status'] = 'completed';

    // Record the user's question as input on the root AGENT span
    setSpanAttributes({ input: question });

    // Build conversation history for the LLM
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: `Investigate this server issue:\n\n${question}\n\nYou have up to ${maxSteps} steps. Use diagnostic actions to gather evidence, then provide your diagnosis.`,
      },
    ];

    for (let step = 1; step <= maxSteps; step++) {
      // Check abort
      if (this.abortedSessions.has(sessionId)) {
        status = 'aborted';
        finalAnswer = 'Investigation aborted by user.';
        break;
      }

      // Ask LLM for next action — wrapped in Observatory LLM span (EX4-B.2)
      let thought: AgentThought;
      try {
        const userPrompt = conversationHistory
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + `\n\nStep ${step}/${maxSteps}. Respond with your next thought and the action to run, or your final answer.`;

        const parseResult = await withSpan(`InvestigationAgent.think[${step}]`, 'LLM', async () => {
          const result = await this.llmProvider!.parseText({
            rawOutput: '',
            command: 'agent-investigate',
            schema: AgentThoughtSchema,
            systemPrompt,
            userPrompt,
          });
          setSpanAttributes({
            model: result.model,
            tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
            input: userPrompt.slice(0, 500),
            output: { decision: result.data.decision, thought: result.data.thought.slice(0, 200) },
          });
          return result;
        });

        thought = parseResult.data;
        totalTokens += parseResult.tokensUsed.input + parseResult.tokensUsed.output;
      } catch (err) {
        record({
          stepNumber: step,
          thought: 'LLM call failed',
          decision: 'error',
        });
        status = 'error';
        finalAnswer = `LLM error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        break;
      }

      // EX9.1: build the command now, so the owner sees what will run before it runs
      const actionId = thought.decision === 'run_action' && thought.action ? thought.action.trim() : null;
      const parsedParams = actionId ? parseParams(thought.params) : null;
      const preview = actionId && parsedParams?.ok ? this.runner.preview(actionId, parsedParams.value) : null;

      // Emit the thought (and the command about to run) before acting on it
      this.events.emit(`step:${sessionId}`, {
        kind: 'thought', step, thought: thought.thought, decision: thought.decision,
        ...(actionId ? { action: actionId } : {}),
        ...(preview?.ok ? { command: preview.command } : {}),
      });

      // If agent decided to answer
      if (thought.decision === 'answer' && thought.answer) {
        record({
          stepNumber: step,
          thought: thought.thought,
          decision: 'answer',
        });
        finalAnswer = thought.answer;
        break;
      }

      // Agent wants to run an action
      if (actionId && parsedParams) {
        const result = parsedParams.ok
          ? await withSpan(`action:${actionId}`, 'TOOL', () =>
            this.runner.run(serverId, actionId, parsedParams.value, {
              runId: sessionId, onApproval: approvalEvents(step), allowChange: options.readOnly === false,
            }),
          { input: { action: actionId, params: parsedParams.value } })
          : null;
        const observation = result ? formatForModel(result) : `error: ${parsedParams.ok ? '' : parsedParams.error}`;

        record({
          stepNumber: step,
          thought: thought.thought,
          action: actionId,
          command: result?.command || `${actionId} ${thought.params ?? ''}`.trim(),
          ...(result?.approval ? { approval: result.approval } : {}),
          output: observation,
          ...(result?.ok ? {} : { observation: 'The action did not succeed' }),
          decision: 'continue',
        });

        conversationHistory.push(
          { role: 'assistant', content: `Thought: ${thought.thought}\nAction: ${actionId} ${thought.params ?? '{}'}` },
          { role: 'user', content: `Observation:\n${observation}\n\nAnalyze this output and decide your next step.` },
        );
      } else if (thought.decision === 'run_action') {
        conversationHistory.push(
          { role: 'assistant', content: `Thought: ${thought.thought}` },
          { role: 'user', content: 'Observation: no action was named. Set "action" to an action id from the list, or answer.' },
        );
      }

      // If we've reached max steps (moved inside to count tokens, but also handled after loop)
      if (step === maxSteps && !finalAnswer) {
        status = 'max_steps_reached';
      }
    }

    // After loop: if no answer yet, ask for a final summary
    if (!finalAnswer && status !== 'aborted') {
      if (status !== 'max_steps_reached' && status !== 'error') {
        status = 'max_steps_reached';
      }
      try {
        conversationHistory.push({
          role: 'user',
          content: 'You have reached the maximum number of steps. Please provide your best diagnosis based on what you have gathered so far.',
        });

        const finalPrompt = conversationHistory
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + '\n\nYou have reached the maximum number of steps. Provide your best diagnosis now based on what you have gathered.';

        const finalResult = await withSpan('InvestigationAgent.finalAnswer', 'LLM', async () => {
          const result = await this.llmProvider!.parseText({
            rawOutput: '',
            command: 'agent-final-answer',
            schema: AgentThoughtSchema,
            systemPrompt,
            userPrompt: finalPrompt,
          });
          setSpanAttributes({
            model: result.model,
            tokenUsage: { inputTokens: result.tokensUsed.input, outputTokens: result.tokensUsed.output, totalTokens: result.tokensUsed.input + result.tokensUsed.output },
            input: finalPrompt.slice(0, 500),
            output: result.data.answer ?? result.data.thought,
          });
          return result;
        });
        finalAnswer = finalResult.data.answer ?? finalResult.data.thought;
        totalTokens += finalResult.tokensUsed.input + finalResult.tokensUsed.output;
      } catch {
        finalAnswer = 'Investigation reached maximum steps without a conclusive answer. Review the steps above for partial findings.';
      }
    }

    this.abortedSessions.delete(sessionId);

    // EX4-B.2: Record investigation result on the trace root span
    setSpanAttributes({
      output: { answer: finalAnswer.slice(0, 500), totalSteps: steps.length, status },
      attributes: { sessionId, totalTokens },
    });

    return {
      sessionId,
      question,
      steps,
      answer: finalAnswer,
      totalSteps: steps.length,
      totalTokens,
      totalLatencyMs: Date.now() - startTime,
      status,
    };
  }
}

/** Action params arrive as JSON text; an empty or null value means "no params". */
function parseParams(raw: string | null): { ok: true; value: unknown } | { ok: false; error: string } {
  const text = (raw ?? '').trim();
  if (!text) return { ok: true, value: {} };
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: `params must be a JSON object like {"unit":"nginx"}, you sent ${text.slice(0, 60)}` };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: `params is not valid JSON; send an object like {"unit":"nginx"}, you sent ${text.slice(0, 60)}` };
  }
}
