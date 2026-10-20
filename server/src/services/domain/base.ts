// M7: Domain Service Base — shared helpers for all domain services
// @see docs/DECISIONS.md (ADR-015)
//
// Domain services live in services/domain/ and act as the bridge between thin
// HTTP routes and the SSH/parsing infrastructure. They own:
//   - command building (with validators)
//   - exec orchestration (parallel, retry via CommandOrchestrator)
//   - parser invocation + Zod validation
//
// Routes should ONLY do: param parsing → call service → map ServiceResult to HTTP.

import { BaseService } from '../base-service.js';
import type { ConnectionManager, ExecResult } from '../../ssh/connection-manager.js';
import type { CommandOrchestrator } from '../../orchestrator/orchestrator.js';
import type { ParsingPipeline } from '../../parsers/pipeline.js';

/**
 * Standardized result returned by every domain service method.
 *
 * Routes pattern-match on `ok` and forward `error` + `statusCode` to the HTTP
 * response. Keeps route handlers ~3 lines each.
 */
export interface ServiceResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  error: string,
  statusCode = 500,
): ServiceResult<T> {
  return { ok: false, error, statusCode };
}

/**
 * Base class for all domain services.
 * Subclasses pull `ssh`, `orchestrator`, `pipeline` in `_init()`.
 */
export abstract class DomainService extends BaseService {
  protected ssh!: ConnectionManager;
  protected orchestrator!: CommandOrchestrator;
  protected pipeline!: ParsingPipeline;

  protected async _init(): Promise<void> {
    this.ssh = this.services.get<ConnectionManager>('ssh');
    this.orchestrator = this.services.get<CommandOrchestrator>('orchestrator');
    this.pipeline = this.services.get<ParsingPipeline>('parser');
  }

  /** Throws ServiceError with statusCode 400 if not connected. */
  protected requireConnected(serverId: string): void {
    const state = this.ssh.getState(serverId);
    if (state.status !== 'connected') {
      throw new ServiceError(`Server "${serverId}" is not connected`, 400);
    }
  }

  /** Runs a command, swallows errors, returns stdout (empty string on failure). */
  protected async safeExec(
    serverId: string,
    command: string,
    timeout = 10_000,
  ): Promise<string> {
    try {
      const r = await this.ssh.exec(serverId, command, timeout);
      return r.stdout;
    } catch {
      return '';
    }
  }

  /**
   * EX8.9: Runs a command and returns the full ExecResult, never throwing.
   * A timeout or channel error becomes exit code -1 with the message in
   * stderr, so one failed probe degrades a page instead of failing it.
   */
  protected async execSafe(
    serverId: string,
    command: string,
    timeout = 10_000,
  ): Promise<ExecResult> {
    try {
      return await this.ssh.exec(serverId, command, timeout);
    } catch (err) {
      return { stdout: '', stderr: (err as Error)?.message ?? 'exec failed', exitCode: -1, durationMs: 0 };
    }
  }

  /** Runs a command and returns the full ExecResult. Bubbles errors. */
  protected async exec(
    serverId: string,
    command: string,
    timeout = 10_000,
  ): Promise<ExecResult> {
    return this.ssh.exec(serverId, command, timeout);
  }

  /**
   * Run a write/state-change command and convert exit code to ServiceResult.
   * On non-zero exit, uses stderr as the error message.
   */
  protected async execAction(
    serverId: string,
    command: string,
    successMessage: string,
    timeout = 15_000,
  ): Promise<ServiceResult<{ message: string }>> {
    const r = await this.ssh.exec(serverId, command, timeout);
    if (r.exitCode !== 0) {
      return fail(r.stderr.trim() || `Command failed (exit ${r.exitCode})`, 400);
    }
    return ok({ message: successMessage });
  }
}

/**
 * Thrown by services to signal an HTTP-mappable error (status code + message).
 * Routes catch this and produce the matching HTTP response.
 */
export class ServiceError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Helper for routes: convert a ServiceResult to a Fastify reply.
 * Returns the response body that the route should `return`.
 */
export function sendResult<T>(
  reply: { code: (n: number) => unknown },
  result: ServiceResult<T>,
): { success: true; data: T } | { success: false; error: string } {
  if (!result.ok) {
    reply.code(result.statusCode ?? 500);
    return { success: false, error: result.error ?? 'Unknown error' };
  }
  return { success: true, data: result.data as T };
}

/** Catch ServiceError + unexpected errors uniformly. */
export async function tryRoute<T>(
  reply: { code: (n: number) => unknown },
  fn: () => Promise<ServiceResult<T>>,
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const result = await fn();
    return sendResult(reply, result);
  } catch (err) {
    if (err instanceof ServiceError) {
      reply.code(err.statusCode);
      return { success: false, error: err.message };
    }
    reply.code(500);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
    };
  }
}
