// EX9.3: Shared agent loop — typed events, native tool calls, one tool-execution path
// @see docs/phases/phase-ex9.md §8, docs/DECISIONS.md (ADR-024)
//
// turn: ask the model (tools offered natively) → for each tool call: repair the
// arguments, check guardrails, execute (approval cards stream out while a change
// action waits) → feed results back. A turn with text and no tool call is the
// answer. When turns run out, one last turn with tools off asks for a conclusion.

import type { ChatMessage, ChatWithToolsInput, ChatWithToolsResult } from '../../llm/provider.js';
import type { AgentTool, ToolContext } from '../tools/types.js';
import { toolsToOpenAIFunctions } from '../tools/tool-converter.js';
import { checkGuardrails } from '../guardrails.js';
import { withSpan, setSpanAttributes } from '../../observatory/context.js';
import type { ApprovalEvent } from '../actions/runner.js';
import type { ApprovalRequest } from '../actions/approvals.js';
import { malformedArgsMessage, parseToolArgs } from './tool-input.js';
import { LoopGuard, stopMessage, type FoldedCall, type LoopFinding } from './loop-guard.js';
import { estimateTokens, historyBudget, trimHistory } from './context.js';
import { markUntrusted } from '../actions/tools.js';

export type LoopEvent =
  | { type: 'turn'; turn: number }
  | { type: 'assistant_text'; turn: number; text: string }
  | { type: 'tool_call'; turn: number; callId: string; name: string; input: unknown; repaired: boolean }
  | { type: 'tool_result'; turn: number; callId: string; name: string; ok: boolean; output: string; metadata?: Record<string, unknown> }
  | { type: 'approval_required'; turn: number; request: ApprovalRequest }
  | { type: 'approval_resolved'; turn: number; approvalId: string; decision: 'allow' | 'deny'; by: 'owner' | 'stop' | 'timeout' }
  | { type: 'loop_warning'; turn: number; kind: 'warn' | 'stop'; rule: LoopFinding['rule']; message: string }
  | { type: 'final'; text: string; reason: 'answered' | 'max_turns' | 'aborted' | 'stuck'; turns: number; tokens: number }
  | { type: 'error'; message: string; turns: number; tokens: number };

export interface LoopOptions {
  /** one model turn with tools (provider.chatWithTools or ModelRouter.chat) */
  chat: (input: ChatWithToolsInput) => Promise<ChatWithToolsResult>;
  system: string;
  user: string;
  /** offered to the model natively */
  tools: AgentTool[];
  /** callable when named, but not offered (e.g. catalog actions outside this run's set) */
  extraTools?: AgentTool[];
  context: ToolContext;
  maxTurns: number;
  isAborted?: () => boolean;
  /** what to ask when turns run out (tools off) */
  wrapUp?: string;
  /** span name prefix in the Observatory */
  spanName?: string;
  /** EX9.4: the model's context window in tokens; history is trimmed to fit */
  contextWindow?: number;
}

/** EX9.4: turns before the end at which the model is told to wrap up */
const STEPS_LEFT_WARNING = 3;

const DEFAULT_WRAP_UP = 'You have used all your steps. Using only what you have gathered, give your best answer now. Do not call tools.';
const NUDGE = 'Call one of the tools, or give your final answer as plain text.';

export async function* runAgentLoop(opts: LoopOptions): AsyncGenerator<LoopEvent> {
  const span = opts.spanName ?? 'AgentLoop';
  const offered = toolsToOpenAIFunctions(opts.tools);
  const byName = new Map<string, AgentTool>();
  for (const t of [...(opts.extraTools ?? []), ...opts.tools]) byName.set(t.name, t);
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.user },
  ];
  let tokens = 0;
  // EX9.4: loop guard and history budget
  const guard = new LoopGuard();
  const budget = historyBudget(opts.contextWindow, Math.ceil(JSON.stringify(offered).length / 4));
  let stuck = false;
  const call = async (input: ChatWithToolsInput, label: string) => {
    const res = await withSpan(label, 'LLM', async () => {
      const r = await opts.chat(input);
      setSpanAttributes({
        model: r.model,
        tokenUsage: { inputTokens: r.tokensUsed.input, outputTokens: r.tokensUsed.output, totalTokens: r.tokensUsed.input + r.tokensUsed.output },
        output: r.message.tool_calls ?? r.message.content,
      });
      return r;
    });
    tokens += res.tokensUsed.input + res.tokensUsed.output;
    return res;
  };

  let lastTurn = 0;
  for (let turn = 1; turn <= opts.maxTurns && !stuck; turn++) {
    lastTurn = turn;
    if (opts.isAborted?.()) {
      yield { type: 'final', text: 'Stopped by the owner.', reason: 'aborted', turns: turn - 1, tokens };
      return;
    }
    yield { type: 'turn', turn };
    if (opts.maxTurns > STEPS_LEFT_WARNING + 1 && turn === opts.maxTurns - STEPS_LEFT_WARNING + 1) {
      messages.push({ role: 'user', content: `${STEPS_LEFT_WARNING} turns left. Start wrapping up: gather only what you still need, then answer.` });
    }
    const trimmed = trimHistory(messages, budget);
    if (trimmed !== messages) messages.splice(0, messages.length, ...trimmed);
    let res: ChatWithToolsResult;
    try {
      res = await call({ messages: [...messages], tools: offered, tool_choice: 'auto' }, `${span}.think[${turn}]`);
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err), turns: turn, tokens };
      return;
    }
    messages.push(res.message);
    const text = res.message.content?.trim() ?? '';
    if (text) yield { type: 'assistant_text', turn, text };
    const findings: LoopFinding[] = [];
    const narration = text ? guard.foldNarration(text) : null;
    if (narration) findings.push(narration);

    const calls = res.message.tool_calls ?? [];
    if (calls.length === 0) {
      if (text) {
        yield { type: 'final', text, reason: 'answered', turns: turn, tokens };
        return;
      }
      messages.push({ role: 'user', content: NUDGE });
      continue;
    }

    const folded: FoldedCall[] = [];
    for (const tc of calls) {
      if (opts.isAborted?.()) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Not run: the owner stopped the run.' });
        continue;
      }
      const parsed = parseToolArgs(tc.function.arguments);
      // EX9.4: an identical repeat of a call already warned about is not run
      if (guard.blocked(tc.function.name, parsed.input)) {
        const finding = guard.refused(tc.function.name, parsed.input);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: finding.kind === 'stop' ? `Not run. ${finding.message}` : finding.message });
        findings.push(finding);
        continue;
      }
      yield { type: 'tool_call', turn, callId: tc.id, name: tc.function.name, input: parsed.input, repaired: parsed.via === 'repaired' };
      const outcome = yield* streamEvents(turn, (emit) =>
        executeToolCall(tc.function.name, tc.function.arguments, byName, { ...opts.context, onApproval: emit }),
      );
      // EX9.5: server output reaches the model marked as data
      const isAction = byName.get(tc.function.name)?.securityTier === 'action' && !!outcome.metadata?.command;
      messages.push({ role: 'tool', tool_call_id: tc.id, content: isAction ? markUntrusted(tc.function.name, outcome.output) : outcome.output });
      yield {
        type: 'tool_result', turn, callId: tc.id, name: tc.function.name, ok: outcome.ok, output: outcome.output,
        ...(outcome.metadata ? { metadata: outcome.metadata } : {}),
      };
      folded.push({ name: tc.function.name, input: outcome.input, ok: outcome.ok, output: outcome.output, mutating: !!byName.get(tc.function.name)?.mutating });
    }

    findings.push(...guard.fold(folded));
    for (const f of findings) yield { type: 'loop_warning', turn, kind: f.kind, rule: f.rule, message: f.message };
    if (findings.some((f) => f.kind === 'stop')) {
      stuck = true;
    } else if (findings.length) {
      messages.push({ role: 'user', content: findings.map((f) => f.message).join('\n') });
    }
  }

  // Out of turns, or stuck: one more turn, tools off
  if (opts.isAborted?.()) {
    yield { type: 'final', text: 'Stopped by the owner.', reason: 'aborted', turns: lastTurn, tokens };
    return;
  }
  messages.push({ role: 'user', content: stuck ? stopMessage() : opts.wrapUp ?? DEFAULT_WRAP_UP });
  const finalMessages = trimHistory(messages, budget);
  try {
    const res = await call({ messages: [...finalMessages], tools: offered, tool_choice: 'none' }, `${span}.finalAnswer`);
    const text = res.message.content?.trim() || 'No conclusion was reached in the steps available.';
    yield { type: 'final', text, reason: stuck ? 'stuck' : 'max_turns', turns: lastTurn, tokens };
  } catch (err) {
    yield { type: 'error', message: err instanceof Error ? err.message : String(err), turns: lastTurn, tokens };
  }
}

/** EX9.4: rough token count of a message list (chars / 4), for budgets and tests */
export { estimateTokens };

// ── One tool call ───────────────────────────────────────

export interface ToolOutcome {
  ok: boolean;
  output: string;
  input: unknown;
  repaired: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * The one path every agent tool call takes: find the tool (or say which ones are
 * close), repair the arguments, check guardrails, execute. Never throws.
 */
export async function executeToolCall(
  name: string,
  rawArgs: unknown,
  tools: Map<string, AgentTool>,
  context: ToolContext,
): Promise<ToolOutcome> {
  const tool = tools.get(name) ?? [...tools.values()].find((t) => t.name.toLowerCase() === name.toLowerCase());
  const parsed = parseToolArgs(rawArgs);
  const repaired = parsed.via === 'repaired';
  if (!tool) {
    return { ok: false, input: parsed.input, repaired, output: `No such tool: ${name}. Closest: ${closestNames(name, [...tools.keys()]).join(', ')}` };
  }
  if (parsed.via === 'raw') {
    return { ok: false, input: {}, repaired, output: malformedArgsMessage(tool.name, parsed.raw ?? '', schemaKeys(tool)) };
  }
  const guard = checkGuardrails(tool, parsed.input);
  if (!guard.allowed) {
    return { ok: false, input: parsed.input, repaired, output: `Blocked by guardrails: ${guard.reason ?? 'not allowed'}` };
  }
  const label = tool.securityTier === 'action' ? `action:${tool.name}` : `tool:${tool.name}`;
  try {
    const result = await withSpan(label, 'TOOL', () => tool.execute(parsed.input, context), { input: parsed.input });
    const output = result.output || (result.error ? `error: ${result.error}` : '(no output)');
    return { ok: result.success, input: parsed.input, repaired, output, ...(result.metadata ? { metadata: result.metadata } : {}) };
  } catch (err) {
    return { ok: false, input: parsed.input, repaired, output: `${tool.name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Run `start`, yielding the approval events it emits while it runs; return its result. */
async function* streamEvents(
  turn: number,
  start: (emit: (e: ApprovalEvent) => void) => Promise<ToolOutcome>,
): AsyncGenerator<LoopEvent, ToolOutcome> {
  const queue: LoopEvent[] = [];
  let notify: (() => void) | undefined;
  let finished = false;
  let outcome: ToolOutcome | undefined;
  const emit = (e: ApprovalEvent) => {
    queue.push(e.type === 'approval_required'
      ? { type: 'approval_required', turn, request: e.request }
      : { type: 'approval_resolved', turn, approvalId: e.approvalId, decision: e.decision, by: e.by });
    notify?.();
  };
  void start(emit)
    .then((r) => { outcome = r; }, (err: unknown) => {
      outcome = { ok: false, input: {}, repaired: false, output: `failed: ${err instanceof Error ? err.message : String(err)}` };
    })
    .finally(() => { finished = true; notify?.(); });
  for (;;) {
    if (queue.length) { yield queue.shift()!; continue; }
    if (finished) break;
    await new Promise<void>((resolve) => { notify = resolve; });
    notify = undefined;
  }
  return outcome!;
}

function schemaKeys(tool: AgentTool): string[] {
  const shape = (tool.parameters as { shape?: Record<string, unknown> }).shape;
  return shape ? Object.keys(shape) : [];
}

function closestNames(name: string, names: string[], n = 3): string[] {
  const want = name.toLowerCase();
  const words = new Set(want.split(/[^a-z0-9]+/).filter(Boolean));
  return names
    .map((candidate) => ({
      candidate,
      score: distance(want, candidate) - candidate.split('_').filter((w) => words.has(w)).length * 3,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.candidate);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}
