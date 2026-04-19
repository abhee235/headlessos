// EX6-A.4: Session Store — persistent per-server desktop state
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-021)
//
// Authoritative cold-tier persistence for SessionState. One JSON file per
// server at ~/.headlessos/sessions/{serverId}.json. Atomic writes via
// .tmp-then-rename. Corrupted files are logged + dropped (never block boot).

import { readFile, writeFile, mkdir, chmod, readdir, unlink, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { BaseService } from '../services/base-service.js';
import {
  SessionStateSchema,
  trimAgentHistory,
  type SessionState,
  type SessionSummary,
} from 'headlessos-shared/schemas/session';

const DEFAULT_CONFIG_DIR = join(homedir(), '.headlessos');
const SESSIONS_SUBDIR = 'sessions';

export class SessionStore extends BaseService {
  private readonly configDir: string;
  private readonly sessionsDir: string;

  constructor(name: string, configDir?: string) {
    super(name);
    this.configDir = configDir ?? DEFAULT_CONFIG_DIR;
    this.sessionsDir = join(this.configDir, SESSIONS_SUBDIR);
  }

  protected async _construct(): Promise<void> {
    await this.ensureSessionsDir();
  }

  private sessionFilePath(serverId: string): string {
    // serverId is a UUID from ConfigStore — already filesystem-safe.
    // Defense-in-depth: reject path-traversal attempts.
    if (serverId.includes('/') || serverId.includes('\\') || serverId.includes('..')) {
      throw new Error(`Invalid serverId: ${serverId}`);
    }
    return join(this.sessionsDir, `${serverId}.json`);
  }

  // ── CRUD ──────────────────────────────────────────────

  async getSession(serverId: string): Promise<SessionState | null> {
    const file = this.sessionFilePath(serverId);
    if (!existsSync(file)) return null;

    try {
      const raw = await readFile(file, 'utf-8');
      const parsed = JSON.parse(raw);
      return SessionStateSchema.parse(parsed);
    } catch (err) {
      // Corrupted file — log and drop. Never block app load.
      console.warn(
        `[SessionStore] Corrupted session file for ${serverId}, deleting:`,
        err instanceof Error ? err.message : err,
      );
      try {
        await unlink(file);
      } catch {
        // best-effort
      }
      return null;
    }
  }

  async saveSession(state: SessionState): Promise<void> {
    // Enforce agent-history cap defensively (schema also enforces .max)
    const safe: SessionState = {
      ...state,
      agentHistory: trimAgentHistory(state.agentHistory),
    };
    // Validate before write — never persist garbage
    const validated = SessionStateSchema.parse(safe);

    const file = this.sessionFilePath(validated.serverId);
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(validated, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    // Atomic replace
    await rename(tmp, file);
  }

  async listSessions(): Promise<SessionSummary[]> {
    if (!existsSync(this.sessionsDir)) return [];

    const entries = await readdir(this.sessionsDir);
    const summaries: SessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const serverId = entry.slice(0, -'.json'.length);
      const state = await this.getSession(serverId);
      if (!state) continue;

      summaries.push({
        serverId: state.serverId,
        lifecycle: state.lifecycle,
        lastActiveAt: state.lastActiveAt,
        hibernatedAt: state.hibernatedAt,
        windowCount: state.windows.length,
        hasOverrides: Object.keys(state.preferenceOverrides).length > 0,
        lockOnHibernate: state.lockOnHibernate ?? false,
      });
    }

    // Most-recently-active first
    summaries.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
    return summaries;
  }

  async deleteSession(serverId: string): Promise<void> {
    const file = this.sessionFilePath(serverId);
    if (!existsSync(file)) return;
    await unlink(file);
  }

  /**
   * Mark a session as hibernated and persist. Called by the
   * /hibernate route after the client has flushed its current state.
   */
  async markHibernated(serverId: string): Promise<void> {
    const state = await this.getSession(serverId);
    if (!state) return;
    if (state.lifecycle === 'hibernated') return;
    await this.saveSession({
      ...state,
      lifecycle: 'hibernated',
      hibernatedAt: new Date().toISOString(),
    });
  }

  // ── Internal ──────────────────────────────────────────

  private async ensureSessionsDir(): Promise<void> {
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    }
    if (!existsSync(this.sessionsDir)) {
      await mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
    }
    try {
      await chmod(this.sessionsDir, 0o700);
    } catch {
      // Non-fatal on some filesystems
    }
  }
}
