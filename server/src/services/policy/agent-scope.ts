// EX9.1: Agent scope — lets CommandPolicy tell an agent's command from a classic app's
// @see docs/phases/phase-ex9.md §5, docs/DECISIONS.md (ADR-024)
//
// Agent runs execute inside an AsyncLocalStorage scope. Inside it, the policy only
// lets through the one command (or SFTP session) the action runner has just built
// and granted. Code outside an agent run never sees a scope, so classic apps keep
// ADR-023 behaviour.

import { AsyncLocalStorage } from 'node:async_hooks';

export type AgentKind = 'ui-agent' | 'investigation' | 'view-action';

export type ActionGrant =
  | { kind: 'exec'; actionId: string; command: string }
  | { kind: 'sftp'; actionId: string; path: string };

export interface AgentScope {
  runId: string;
  agent: AgentKind;
  grant?: ActionGrant;
}

const storage = new AsyncLocalStorage<AgentScope>();

/** The active agent scope, or undefined outside an agent run. */
export function currentAgentScope(): AgentScope | undefined {
  return storage.getStore();
}

/** Run `fn` (and everything it awaits) as an agent run. */
export function runAsAgent<T>(scope: Omit<AgentScope, 'grant'>, fn: () => T): T {
  return storage.run({ runId: scope.runId, agent: scope.agent }, fn);
}

/**
 * Async-generator version of runAsAgent. A generator body runs in the context of
 * whoever calls next(), so every resumption re-enters the scope (as withTraceGen does).
 */
export async function* runGenAsAgent<T>(
  scope: Omit<AgentScope, 'grant'>,
  fn: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  const store: AgentScope = { runId: scope.runId, agent: scope.agent };
  const gen = storage.run(store, fn);
  let sendValue: unknown;
  try {
    while (true) {
      const { value, done } = await storage.run(store, () => gen.next(sendValue as never));
      if (done) return;
      sendValue = yield value;
    }
  } finally {
    // Consumer stopped early (break / return / throw): let the inner generator clean up in scope
    await storage.run(store, () => gen.return(undefined as never));
  }
}

/**
 * Grant exactly one action command (or one SFTP acquisition) inside the current
 * agent scope. Outside a scope the grant is still recorded, so the runner behaves
 * the same in tests and in view-button runs.
 */
export function withGrant<T>(grant: ActionGrant, fn: () => T): T {
  const outer = storage.getStore();
  return storage.run(
    { runId: outer?.runId ?? 'no-run', agent: outer?.agent ?? 'view-action', grant },
    fn,
  );
}

/** Run server-side plumbing (e.g. the EX5 sandbox lifecycle) that is not an agent choice. */
export function outsideAgentScope<T>(fn: () => T): T {
  return storage.exit(fn);
}
