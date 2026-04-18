// EX6-D.7: Trace Persistence + Retention
// @see docs/phases/phase-ex6.md
//
// Persists ended traces to disk under ~/.headlessos/observatory/traces/
// so they survive server restarts. Listens to TraceStore 'event' for
// 'trace:end', enqueues a write, and runs a periodic retention sweep that
// keeps at most TRACE_RETENTION_MAX traces and drops anything older than
// TRACE_RETENTION_DAYS.
//
// One file per trace: <traceId>.json containing { trace, spans }.
// Atomic writes via .tmp-then-rename.

import { readFile, writeFile, mkdir, readdir, unlink, rename, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { BaseService } from '../services/base-service.js';
import type { TraceStore } from './trace-store.js';
import type { ObservatoryEvent, Span, Trace } from 'headlessos-shared/schemas/observatory';

const DEFAULT_BASE_DIR = join(homedir(), '.headlessos', 'observatory', 'traces');

export interface TracePersistenceOptions {
  /** Override storage directory (tests). */
  baseDir?: string;
  /** Max traces kept on disk. Default: 10_000. */
  maxTraces?: number;
  /** Trace retention in days. Default: 30. */
  retentionDays?: number;
  /** Sweep interval in ms. Default: 6h. Set to 0 to disable. */
  sweepIntervalMs?: number;
}

interface PersistedTraceFile {
  schemaVersion: 1;
  trace: Trace;
  spans: Span[];
}

export class TracePersistence extends BaseService {
  private readonly baseDir: string;
  private readonly maxTraces: number;
  private readonly retentionDays: number;
  private readonly sweepIntervalMs: number;

  private store: TraceStore | null = null;
  private boundHandler: ((evt: ObservatoryEvent) => void) | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private inflight = new Set<Promise<void>>();

  constructor(name: string, opts: TracePersistenceOptions = {}) {
    super(name);
    this.baseDir = opts.baseDir ?? DEFAULT_BASE_DIR;
    this.maxTraces = opts.maxTraces ?? 10_000;
    this.retentionDays = opts.retentionDays ?? 30;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 6 * 60 * 60 * 1000;
  }

  protected async _construct(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  /**
   * Wire up the persistence to a TraceStore. Idempotent.
   * Safe to call before or after the store has any traces.
   */
  attach(store: TraceStore): void {
    if (this.store === store) return;
    this.detach();
    this.store = store;
    this.boundHandler = (evt: ObservatoryEvent): void => {
      if (evt.type !== 'trace:end') return;
      const p = this.persistTrace(evt.trace.traceId).catch((err) => {
        console.warn('[TracePersistence] failed to persist trace:', err);
      });
      this.inflight.add(p);
      void p.finally(() => this.inflight.delete(p));
    };
    store.on('event', this.boundHandler);

    if (this.sweepIntervalMs > 0 && !this.sweepTimer) {
      this.sweepTimer = setInterval(() => {
        void this.sweep().catch((err) => {
          console.warn('[TracePersistence] sweep failed:', err);
        });
      }, this.sweepIntervalMs);
      this.sweepTimer.unref?.();
    }
  }

  detach(): void {
    if (this.store && this.boundHandler) {
      this.store.off('event', this.boundHandler);
    }
    this.store = null;
    this.boundHandler = null;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Wait for all currently-pending writes to settle. Test helper. */
  async flush(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  protected async _destroy(): Promise<void> {
    this.detach();
  }

  // ── Disk I/O ─────────────────────────────────────────

  private filePath(traceId: string): string {
    if (traceId.includes('/') || traceId.includes('\\') || traceId.includes('..')) {
      throw new Error(`Invalid traceId: ${traceId}`);
    }
    return join(this.baseDir, `${traceId}.json`);
  }

  /**
   * Snapshot the trace + its spans from the in-memory store and write to
   * disk atomically. No-op if the store is detached or trace is missing.
   */
  async persistTrace(traceId: string): Promise<void> {
    if (!this.store) return;
    const trace = this.store.getTrace(traceId);
    if (!trace) return;
    const spans = this.store.getTraceSpans(traceId);

    const payload: PersistedTraceFile = {
      schemaVersion: 1,
      trace,
      spans,
    };

    const target = this.filePath(traceId);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, JSON.stringify(payload), { encoding: 'utf-8', mode: 0o600 });
    await rename(tmp, target);
  }

  /**
   * Load a single persisted trace by ID. Returns null if missing or
   * unparseable.
   */
  async loadTrace(traceId: string): Promise<PersistedTraceFile | null> {
    const file = this.filePath(traceId);
    if (!existsSync(file)) return null;
    try {
      const raw = await readFile(file, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedTraceFile;
      if (parsed.schemaVersion !== 1 || !parsed.trace || !Array.isArray(parsed.spans)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * List persisted trace IDs, newest first by mtime. Cheap directory scan.
   */
  async listTraceIds(): Promise<string[]> {
    if (!existsSync(this.baseDir)) return [];
    const files = await readdir(this.baseDir);
    const entries: Array<{ id: string; mtime: number }> = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -'.json'.length);
      try {
        const s = await stat(join(this.baseDir, f));
        entries.push({ id, mtime: s.mtimeMs });
      } catch {
        // ignore
      }
    }
    entries.sort((a, b) => b.mtime - a.mtime);
    return entries.map((e) => e.id);
  }

  /**
   * Retention sweep:
   *   1. Drop any file older than retentionDays.
   *   2. If still over maxTraces, drop oldest until under cap.
   * Returns count of files deleted.
   */
  async sweep(): Promise<number> {
    if (!existsSync(this.baseDir)) return 0;
    const files = await readdir(this.baseDir);
    const entries: Array<{ path: string; mtime: number }> = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const full = join(this.baseDir, f);
      try {
        const s = await stat(full);
        entries.push({ path: full, mtime: s.mtimeMs });
      } catch {
        // ignore
      }
    }

    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    // 1. Age-based eviction
    const survivors: typeof entries = [];
    for (const e of entries) {
      if (e.mtime < cutoff) {
        try {
          await unlink(e.path);
          deleted++;
        } catch {
          // ignore
        }
      } else {
        survivors.push(e);
      }
    }

    // 2. Cap-based eviction (oldest first)
    if (survivors.length > this.maxTraces) {
      survivors.sort((a, b) => a.mtime - b.mtime);
      const toDrop = survivors.length - this.maxTraces;
      for (let i = 0; i < toDrop; i++) {
        try {
          await unlink(survivors[i]!.path);
          deleted++;
        } catch {
          // ignore
        }
      }
    }

    return deleted;
  }

  /**
   * Test helper: count files on disk.
   */
  async countTraces(): Promise<number> {
    if (!existsSync(this.baseDir)) return 0;
    const files = await readdir(this.baseDir);
    return files.filter((f) => f.endsWith('.json')).length;
  }
}
