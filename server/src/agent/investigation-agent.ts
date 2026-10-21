// M11.5: ReAct Investigation Agent
// @see docs/DECISIONS.md (ADR-013, ADR-014, ADR-024), docs/phases/phase-ex9.md
//
// Investigates server issues by iteratively:
// 1. Thinking about what to check next
// 2. Calling a catalog action as a native tool (EX9.1 — never a model-written command)
// 3. Observing the output
// 4. Deciding whether to continue or give an answer
//
// EX9.3: runs on the shared agent loop (agent/loop/run-loop.ts) with native tool
// calls, so it works with OpenAI and local Ollama models alike. Each tool call is
// one recorded step; maxSteps counts model turns.

import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { LLMProvider } from '../llm/provider.js';
import { EventEmitter } from 'events';
import { withTrace, setSpanAttributes } from '../observatory/context.js';
import { runAsAgent } from '../services/policy/agent-scope.js';
import { ActionRunner, type ActionSsh, type RunnerDeps } from './actions/runner.js';
import { actionBudget, actionTool, selectActions } from './actions/tools.js';
import { getDefaultCatalog } from './actions/catalog/index.js';
import type { ApprovalGate } from './actions/approvals.js';
import type { ActionRunResult } from './actions/types.js';
import type { ToolContext } from './tools/types.js';
import { runAgentLoop } from './loop/run-loop.js';

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
  /** model turns (each turn may call several actions) */
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

const CHANGE_RULES = `
## Changes (this run may change the server)
- Tools whose description says "Changes the server" pause the run and show the owner the exact command, the server, the login user and your reason. Nothing happens until the owner allows it.
- Investigate first. Propose a change only when the evidence shows it will fix the problem, and give a specific "reason" (e.g. "nginx is inactive since 09:12; restarting it should bring the site back").
- One change at a time. After it runs, check the result with a read action.
- If the owner declines, that is final for this run: do not retry it or work around it. Explain what you would have done.`;

function buildSystemPrompt(allowChange: boolean, maxSteps: number): string {
  return `You are an expert Linux system administrator AI agent. You investigate server issues by calling diagnostic tools and analyzing their output.

## How you work
1. Think about what you know and what you need to find out next.
2. Call one or more tools. Each tool is a server action with typed parameters; the server builds and runs the command. You cannot write shell commands.
3. Read the outputs, then decide: call more tools, or answer.
You have up to ${maxSteps} turns.

## Rules
- ${allowChange ? 'Read tools never change anything; tools that change the server need the owner\'s approval (see below).' : 'Every tool is read-only; you cannot change the server.'}
- Keep each call focused (one unit, one container, one path).
- If a tool returns an error, read it: it says what was wrong. Fix the parameters or use another tool.
- When you have enough evidence, answer in plain text with a clear diagnosis and actionable recommendations. Cite actual values from the outputs.${allowChange ? CHANGE_RULES : ''}`;
}

export class InvestigationAgent {
  private abortedSessions = new Set<string>();
  public events = new EventEmitter();

  private readonly runner: ActionRunner;
  private readonly approvals?: ApprovalGate;

  constructor(
    private readonly ssh: ConnectionManager | ActionSsh,
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
    const provider = this.llmProvider!;
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const allowChange = options.readOnly === false;
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    const emit = (e: Record<string, unknown>) => this.events.emit(`step:${sessionId}`, e);
    // EX8.24: every recorded step goes out on the progress socket as it happens
    const record = (s: AgentStep) => {
      steps.push(s);
      emit({ kind: 'step', step: s.stepNumber, data: s });
    };
    setSpanAttributes({ input: question });

    const result = (status: AgentResult['status'], answer: string, totalTokens: number): AgentResult => {
      this.abortedSessions.delete(sessionId);
      setSpanAttributes({
        output: { answer: answer.slice(0, 500), totalSteps: steps.length, status },
        attributes: { sessionId, totalTokens },
      });
      return {
        sessionId, question, steps, answer, totalSteps: steps.length, totalTokens,
        totalLatencyMs: Date.now() - startTime, status,
      };
    };

    if (!provider.chatWithTools) {
      return result('error', `The model ${provider.model} cannot call tools, so it cannot investigate. Choose another model in Settings → AI.`, 0);
    }

    // EX9.3: the tool list is sized to the model (ADR-055): offered natively, fixed for the run
    const catalog = getDefaultCatalog();
    const offeredReads = selectActions(question, { max: actionBudget(provider) });
    const offeredIds = new Set(offeredReads.map((a) => a.id));
    const changes = allowChange ? catalog.list({ risk: 'change' }) : [];
    const tools = [...offeredReads, ...changes].map(actionTool);
    const extraTools = catalog.list({ risk: 'read' }).filter((a) => !offeredIds.has(a.id)).map(actionTool);

    const context: ToolContext = {
      serverId,
      ssh: this.ssh as ToolContext['ssh'],
      templateRegistry: undefined as unknown as ToolContext['templateRegistry'],
      previousOutputs: new Map(),
      actions: this.runner,
      runId: sessionId,
      allowChange,
    };

    let stepNo = 0;
    let turnText = '';
    let status: AgentResult['status'] = 'completed';
    let answer = '';
    let tokens = 0;
    const stepOf = new Map<string, number>(); // tool call id → step number

    for await (const ev of runAgentLoop({
      chat: (input) => provider.chatWithTools!(input),
      system: buildSystemPrompt(allowChange, maxSteps),
      user: `Investigate this server issue:\n\n${question}`,
      tools,
      extraTools,
      context,
      maxTurns: maxSteps,
      isAborted: () => this.abortedSessions.has(sessionId),
      spanName: 'InvestigationAgent',
    })) {
      switch (ev.type) {
        case 'turn':
          turnText = '';
          break;
        case 'assistant_text':
          turnText = ev.text;
          break;
        case 'tool_call': {
          stepNo++;
          stepOf.set(ev.callId, stepNo);
          const def = catalog.get(ev.name);
          const preview = def ? this.runner.preview(ev.name, ev.input) : null;
          emit({
            kind: 'thought', step: stepNo, thought: turnText || def?.title || ev.name, decision: 'run_action', action: ev.name,
            ...(preview?.ok ? { command: preview.command } : {}),
          });
          break;
        }
        case 'approval_required':
          emit({ kind: 'approval', step: stepNo, request: ev.request });
          break;
        case 'approval_resolved':
          emit({ kind: 'approval_resolved', step: stepNo, approvalId: ev.approvalId, decision: ev.decision, by: ev.by });
          break;
        case 'tool_result': {
          const meta = ev.metadata ?? {};
          const def = catalog.get(ev.name);
          record({
            stepNumber: stepOf.get(ev.callId) ?? stepNo,
            thought: turnText || def?.title || ev.name,
            action: ev.name,
            ...(typeof meta.command === 'string' && meta.command ? { command: meta.command } : {}),
            ...(meta.approval ? { approval: meta.approval as AgentStep['approval'] } : {}),
            output: ev.output,
            ...(ev.ok ? {} : { observation: 'The action did not succeed' }),
            decision: 'continue',
          });
          break;
        }
        case 'final':
          tokens = ev.tokens;
          if (ev.reason === 'aborted') {
            status = 'aborted';
            answer = 'Investigation aborted by user.';
          } else {
            status = ev.reason === 'max_turns' ? 'max_steps_reached' : 'completed';
            answer = ev.text;
            const headline = ev.text.split('\n').find((l) => l.trim())?.trim().slice(0, 120) ?? 'Answer';
            emit({ kind: 'thought', step: stepNo + 1, thought: headline, decision: 'answer' });
            record({ stepNumber: stepNo + 1, thought: headline, decision: 'answer' });
          }
          break;
        case 'error':
          tokens = ev.tokens;
          status = 'error';
          answer = `LLM error: ${ev.message}`;
          record({ stepNumber: stepNo + 1, thought: 'LLM call failed', decision: 'error' });
          break;
      }
    }

    return result(status, answer, tokens);
  }
}
