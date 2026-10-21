// EX9.2: Approval gate — nothing changes a server until the owner allows it
// @see docs/phases/phase-ex9.md §7, docs/DECISIONS.md (ADR-024)
//
// Two shapes of approval:
//  - parked (agent runs): the run awaits a promise; its resolver is stored BEFORE
//    the approval_required event goes out, so a fast answer is never lost.
//    Stop (cancelRun) and the 10-minute timeout resolve it as deny.
//  - staged (generated view buttons): preview records exactly what would run;
//    take() hands back a one-time ticket for that recorded command. The client's
//    params are never read again.
// Each approval settles once. There is no "always allow".

import { randomUUID } from 'node:crypto';
import type { ActionAudit } from './audit.js';

export type ApprovalDecision = 'allow' | 'deny';
export type ApprovalBy = 'owner' | 'stop' | 'timeout';

export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  source: 'agent' | 'view';
  serverId: string;
  serverName: string;
  host: string;
  loginUser: string;
  actionId: string;
  title: string;
  command: string;
  reason: string;
  requestedAt: string;
  expiresAt: string;
}

export type ApprovalInput = Omit<ApprovalRequest, 'approvalId' | 'requestedAt' | 'expiresAt' | 'source'>;

export interface ApprovalOutcome {
  approvalId: string;
  decision: ApprovalDecision;
  by: ApprovalBy;
}

/** What a staged view action will run, recorded at preview time. */
export interface StagedRun {
  serverId: string;
  actionId: string;
  params: Record<string, unknown>;
  command: string;
}

/** One-time permission to run a staged action; only take() makes them. */
export interface ApprovalTicket extends StagedRun {
  approvalId: string;
  runId: string;
  reason: string;
}

export const APPROVAL_TIMEOUT_MS = 10 * 60_000;

interface Parked {
  request: ApprovalRequest;
  resolve: (outcome: ApprovalOutcome) => void;
  timer: NodeJS.Timeout;
}

interface Staged {
  request: ApprovalRequest;
  run: StagedRun;
  timer: NodeJS.Timeout;
}

export class ApprovalGate {
  private readonly parked = new Map<string, Parked>();
  private readonly staged = new Map<string, Staged>();
  private readonly issued = new WeakSet<ApprovalTicket>();
  private readonly audit?: ActionAudit;
  private readonly timeoutMs: number;
  private readonly newId: () => string;

  constructor(opts: { audit?: ActionAudit; timeoutMs?: number; newId?: () => string } = {}) {
    this.audit = opts.audit;
    this.timeoutMs = opts.timeoutMs ?? APPROVAL_TIMEOUT_MS;
    this.newId = opts.newId ?? randomUUID;
  }

  /** Park an agent run until the owner answers. `notify` sends the card to the UI. */
  request(input: ApprovalInput, notify: (request: ApprovalRequest) => void): Promise<ApprovalOutcome> {
    const request = this.makeRequest(input, 'agent');
    const outcome = new Promise<ApprovalOutcome>((resolve) => {
      const timer = setTimeout(() => this.settleParked(request.approvalId, 'deny', 'timeout'), this.timeoutMs);
      timer.unref?.();
      this.parked.set(request.approvalId, { request, resolve, timer });
    });
    this.logAsked(request);
    try {
      notify(request);
    } catch {
      // a broken listener must not leave the run hanging: the timeout still applies
    }
    return outcome;
  }

  /** Record what a view button would run, and wait for the owner (take / resolve deny). */
  stage(input: ApprovalInput, run: StagedRun): ApprovalRequest {
    const request = this.makeRequest(input, 'view');
    const timer = setTimeout(() => {
      if (this.staged.delete(request.approvalId)) this.logAnswered(request, 'deny', 'timeout');
    }, this.timeoutMs);
    timer.unref?.();
    this.staged.set(request.approvalId, { request, run, timer });
    this.logAsked(request);
    return request;
  }

  /**
   * The owner allowed a staged view action: hand back a one-time ticket for the
   * command recorded at preview time. Null if unknown, expired, used, or for
   * another server.
   */
  take(approvalId: string, serverId: string): { request: ApprovalRequest; ticket: ApprovalTicket } | null {
    const entry = this.staged.get(approvalId);
    if (!entry || entry.request.serverId !== serverId) return null;
    this.staged.delete(approvalId);
    clearTimeout(entry.timer);
    this.logAnswered(entry.request, 'allow', 'owner');
    const ticket: ApprovalTicket = { ...entry.run, approvalId, runId: entry.request.runId, reason: entry.request.reason };
    this.issued.add(ticket);
    return { request: entry.request, ticket };
  }

  /** True once per ticket that take() issued. */
  redeem(ticket: ApprovalTicket): boolean {
    if (!this.issued.has(ticket)) return false;
    this.issued.delete(ticket);
    return true;
  }

  /**
   * The owner's answer. Parked approvals accept allow or deny; a staged one only
   * accepts deny here (allow goes through take()).
   */
  resolve(approvalId: string, decision: ApprovalDecision, serverId?: string): ApprovalOutcome | null {
    const parked = this.parked.get(approvalId);
    if (parked && (!serverId || parked.request.serverId === serverId)) {
      return this.settleParked(approvalId, decision, 'owner');
    }
    const staged = this.staged.get(approvalId);
    if (staged && decision === 'deny' && (!serverId || staged.request.serverId === serverId)) {
      this.staged.delete(approvalId);
      clearTimeout(staged.timer);
      this.logAnswered(staged.request, 'deny', 'owner');
      return { approvalId, decision: 'deny', by: 'owner' };
    }
    return null;
  }

  /** Stop: every approval the run is waiting on resolves as deny. */
  cancelRun(runId: string): number {
    let n = 0;
    for (const [id, entry] of [...this.parked]) {
      if (entry.request.runId === runId && this.settleParked(id, 'deny', 'stop')) n++;
    }
    return n;
  }

  /** Approvals still waiting (optionally for one run). */
  pending(runId?: string): ApprovalRequest[] {
    return [...this.parked.values(), ...this.staged.values()]
      .map((e) => e.request)
      .filter((r) => !runId || r.runId === runId);
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.parked.get(approvalId)?.request ?? this.staged.get(approvalId)?.request;
  }

  /** Clear timers (shutdown, tests). Pending agent approvals resolve as deny. */
  dispose(): void {
    for (const id of [...this.parked.keys()]) this.settleParked(id, 'deny', 'stop');
    for (const entry of this.staged.values()) clearTimeout(entry.timer);
    this.staged.clear();
  }

  // ── internals ──

  private makeRequest(input: ApprovalInput, source: ApprovalRequest['source']): ApprovalRequest {
    const now = Date.now();
    return {
      ...input,
      approvalId: this.newId(),
      source,
      requestedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.timeoutMs).toISOString(),
    };
  }

  private settleParked(approvalId: string, decision: ApprovalDecision, by: ApprovalBy): ApprovalOutcome | null {
    const entry = this.parked.get(approvalId);
    if (!entry) return null;
    this.parked.delete(approvalId);
    clearTimeout(entry.timer);
    this.logAnswered(entry.request, decision, by);
    const outcome = { approvalId, decision, by };
    entry.resolve(outcome);
    return outcome;
  }

  private logAsked(r: ApprovalRequest): void {
    void this.audit?.log({
      event: 'asked', runId: r.runId, approvalId: r.approvalId, serverId: r.serverId, loginUser: r.loginUser,
      actionId: r.actionId, risk: 'change', command: r.command, reason: r.reason,
    });
  }

  private logAnswered(r: ApprovalRequest, decision: ApprovalDecision, by: ApprovalBy): void {
    void this.audit?.log({
      event: 'answered', runId: r.runId, approvalId: r.approvalId, serverId: r.serverId, loginUser: r.loginUser,
      actionId: r.actionId, risk: 'change', command: r.command, decision, by,
    });
  }
}
