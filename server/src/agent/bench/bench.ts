// EX9.4: Agent benchmark — benign questions per model, against canned server output
// @see docs/phases/phase-ex9.md §9
//
// Runs the investigation agent (read-only) on `fake-server` through FakeSSHProxy,
// so no real server is touched, and reports per question whether the model picked
// an expected action, answered, and how many steps, tokens and malformed calls it
// took. The CLI is server/scripts/agent-bench.ts; it never runs in CI.

import type { LLMProvider } from '../../llm/provider.js';
import type { ConnectionManager } from '../../ssh/connection-manager.js';
import { FakeSSHProxy, createFakeServerOutputs } from '../../llm/providers/fake-ssh-proxy.js';
import { InvestigationAgent, type AgentStep } from '../investigation-agent.js';

export interface BenchQuestion {
  id: string;
  question: string;
  /** any of these actions counts as a good pick */
  expect: string[];
}

export const BENCH_QUESTIONS: BenchQuestion[] = [
  { id: 'disk', question: 'How much disk space is left?', expect: ['disk_usage'] },
  { id: 'nginx', question: 'Is nginx running?', expect: ['service_status', 'service_list', 'process_find', 'sysv_services'] },
  { id: 'memory', question: 'What is using the most memory?', expect: ['process_list', 'memory_usage'] },
  { id: 'ports', question: 'Which ports are open on this server?', expect: ['listening_ports'] },
  { id: 'containers', question: 'Show me the Docker containers on this server.', expect: ['docker_containers'] },
  { id: 'os', question: 'Which OS and kernel is this server running?', expect: ['os_release', 'kernel_info'] },
  { id: 'uptime', question: 'How long has the server been up?', expect: ['uptime'] },
  { id: 'failed', question: 'Are any services failing?', expect: ['service_failed', 'service_list'] },
  { id: 'dns', question: 'Which DNS servers does this machine use?', expect: ['dns_config'] },
  { id: 'errors', question: 'Show me the latest errors in the system log.', expect: ['system_logs', 'kernel_messages'] },
  { id: 'container-cpu', question: 'Which container uses the most CPU?', expect: ['docker_stats'] },
  { id: 'who', question: 'Who is logged in right now?', expect: ['logged_in_users'] },
];

export interface BenchRow {
  id: string;
  question: string;
  actions: string[];
  picked: boolean;
  answered: boolean;
  status: string;
  steps: number;
  tokens: number;
  latencyMs: number;
  /** tool calls whose JSON needed repair */
  repaired: number;
  /** tool calls that could not be repaired */
  malformed: number;
  unknownTools: number;
  paramErrors: number;
  /** actions that ran but failed (e.g. no canned output for that command) */
  failedActions: number;
  answer: string;
}

export interface BenchSummary {
  provider: string;
  model: string;
  contextWindow?: number;
  rows: BenchRow[];
  pickedRate: number;
  answeredRate: number;
  avgSteps: number;
  avgTokens: number;
  avgLatencyMs: number;
  repaired: number;
  malformed: number;
  unknownTools: number;
  paramErrors: number;
}

/** A stand-in for the real ConnectionManager: the bench only ever talks to fake-server. */
function offlineManager(): ConnectionManager {
  const refuse = async () => { throw new Error('the benchmark only uses fake-server'); };
  return { exec: refuse, getSftp: refuse, getState: () => ({ status: 'disconnected' }) } as unknown as ConnectionManager;
}

export async function runBench(
  provider: LLMProvider,
  opts: { questions?: BenchQuestion[]; maxSteps?: number; onRow?: (row: BenchRow) => void } = {},
): Promise<BenchSummary> {
  const ssh = new FakeSSHProxy(offlineManager(), createFakeServerOutputs());
  const agent = new InvestigationAgent(ssh as unknown as ConnectionManager, provider);
  const rows: BenchRow[] = [];

  for (const [i, q] of (opts.questions ?? BENCH_QUESTIONS).entries()) {
    const sessionId = `bench-${i}-${Date.now().toString(36)}`;
    let repaired = 0;
    const onEvent = (e: Record<string, unknown>) => { if (e.kind === 'thought' && e.repaired) repaired++; };
    agent.events.on(`step:${sessionId}`, onEvent);
    const started = Date.now();
    const result = await agent.investigate('fake-server', q.question, { sessionId, maxSteps: opts.maxSteps ?? 6 });
    agent.events.off(`step:${sessionId}`, onEvent);

    const toolSteps = result.steps.filter((s): s is AgentStep & { action: string } => !!s.action);
    const outputs = toolSteps.map((s) => s.output ?? '');
    const row: BenchRow = {
      id: q.id,
      question: q.question,
      actions: toolSteps.map((s) => s.action),
      picked: toolSteps.some((s) => q.expect.includes(s.action)),
      answered: result.status === 'completed' && result.answer.trim().length > 0,
      status: result.status,
      steps: toolSteps.length,
      tokens: result.totalTokens,
      latencyMs: Date.now() - started,
      repaired,
      malformed: outputs.filter((o) => o.includes('was called with arguments that are not valid JSON')).length,
      unknownTools: outputs.filter((o) => o.startsWith('No such tool')).length,
      paramErrors: outputs.filter((o) => o.startsWith('error: ')).length,
      failedActions: toolSteps.filter((s) => s.observation).length,
      answer: result.answer,
    };
    rows.push(row);
    opts.onRow?.(row);
  }

  const n = rows.length || 1;
  const sum = (f: (r: BenchRow) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  return {
    provider: provider.name,
    model: provider.model,
    ...(provider.contextWindow ? { contextWindow: provider.contextWindow } : {}),
    rows,
    pickedRate: sum((r) => (r.picked ? 1 : 0)) / n,
    answeredRate: sum((r) => (r.answered ? 1 : 0)) / n,
    avgSteps: sum((r) => r.steps) / n,
    avgTokens: sum((r) => r.tokens) / n,
    avgLatencyMs: sum((r) => r.latencyMs) / n,
    repaired: sum((r) => r.repaired),
    malformed: sum((r) => r.malformed),
    unknownTools: sum((r) => r.unknownTools),
    paramErrors: sum((r) => r.paramErrors),
  };
}

/** A plain-text table for the terminal. */
export function formatBench(s: BenchSummary): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    `${s.provider} · ${s.model}${s.contextWindow ? ` · ${s.contextWindow} tokens` : ''}`,
    '',
    `${'question'.padEnd(14)} ${'picked'.padEnd(7)} ${'answer'.padEnd(7)} ${'steps'.padStart(5)} ${'tokens'.padStart(7)} ${'secs'.padStart(5)}  actions`,
    ...s.rows.map((r) =>
      `${r.id.padEnd(14)} ${(r.picked ? 'yes' : 'NO').padEnd(7)} ${(r.answered ? 'yes' : r.status).padEnd(7)} ${String(r.steps).padStart(5)} ${String(r.tokens).padStart(7)} ${(r.latencyMs / 1000).toFixed(1).padStart(5)}  ${r.actions.join(', ') || '—'}`),
    '',
    `picked ${pct(s.pickedRate)} · answered ${pct(s.answeredRate)} · avg ${s.avgSteps.toFixed(1)} steps, ${Math.round(s.avgTokens)} tokens, ${(s.avgLatencyMs / 1000).toFixed(1)} s`,
    `tool-call JSON repaired ${s.repaired} · malformed ${s.malformed} · unknown tools ${s.unknownTools} · parameter errors ${s.paramErrors}`,
  ];
  return lines.join('\n');
}
