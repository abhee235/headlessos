// EX6-D.7: TracePersistence tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TraceStore } from '../../src/observatory/trace-store.js';
import { TracePersistence } from '../../src/observatory/trace-persistence.js';

let baseDir: string;
let store: TraceStore;
let persistence: TracePersistence;

beforeEach(async () => {
  baseDir = mkdtempSync(join(tmpdir(), 'trace-persist-'));
  store = new TraceStore();
  persistence = new TracePersistence('trace-persistence', {
    baseDir,
    sweepIntervalMs: 0, // disable timer; tests call sweep() manually
    maxTraces: 10_000,
    retentionDays: 30,
  });
  await persistence.init();
  persistence.attach(store);
});

afterEach(async () => {
  persistence.detach();
  await persistence.flush();
  await persistence.destroy().catch(() => undefined);
  rmSync(baseDir, { recursive: true, force: true });
});

describe('TracePersistence', () => {
  it('persists a trace to disk when it ends', async () => {
    const { trace } = store.startTrace('test-trace');
    store.endTrace(trace.traceId);

    await persistence.flush();

    const ids = await persistence.listTraceIds();
    expect(ids).toContain(trace.traceId);

    const loaded = await persistence.loadTrace(trace.traceId);
    expect(loaded).not.toBeNull();
    expect(loaded?.trace.traceId).toBe(trace.traceId);
    expect(loaded?.spans.length).toBeGreaterThan(0);
  });

  it('sweep deletes files older than retentionDays', async () => {
    // Create a fake trace file with old mtime
    const oldId = 'old-trace-id';
    const oldFile = join(baseDir, `${oldId}.json`);
    writeFileSync(oldFile, JSON.stringify({ schemaVersion: 1, trace: { traceId: oldId }, spans: [] }));
    // 40 days ago
    const old = (Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(oldFile, old, old);

    // Fresh trace
    const { trace: fresh } = store.startTrace('fresh');
    store.endTrace(fresh.traceId);
    await persistence.flush();

    const deleted = await persistence.sweep();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const ids = await persistence.listTraceIds();
    expect(ids).not.toContain(oldId);
    expect(ids).toContain(fresh.traceId);
  });

  it('sweep enforces maxTraces cap (oldest dropped)', async () => {
    const cappedPersistence = new TracePersistence('cap', {
      baseDir,
      sweepIntervalMs: 0,
      maxTraces: 2,
      retentionDays: 30,
    });
    await cappedPersistence.init();

    // Create 5 fake files with staggered mtimes
    for (let i = 0; i < 5; i++) {
      const id = `t-${i}`;
      const file = join(baseDir, `${id}.json`);
      writeFileSync(file, JSON.stringify({ schemaVersion: 1, trace: { traceId: id }, spans: [] }));
      const ts = (Date.now() - (5 - i) * 1000) / 1000;
      utimesSync(file, ts, ts);
    }

    const deleted = await cappedPersistence.sweep();
    expect(deleted).toBe(3);

    const remaining = await cappedPersistence.countTraces();
    expect(remaining).toBe(2);
  });

  it('detach stops persisting new ended traces', async () => {
    persistence.detach();

    const { trace } = store.startTrace('not-persisted');
    store.endTrace(trace.traceId);
    await persistence.flush();

    const ids = await persistence.listTraceIds();
    expect(ids).not.toContain(trace.traceId);
  });

  it('loadTrace returns null for missing or unparseable files', async () => {
    expect(await persistence.loadTrace('does-not-exist')).toBeNull();

    // Corrupt file
    const id = 'corrupt';
    writeFileSync(join(baseDir, `${id}.json`), 'not-json');
    expect(await persistence.loadTrace(id)).toBeNull();

    // Wrong schemaVersion
    const id2 = 'bad-schema';
    writeFileSync(join(baseDir, `${id2}.json`), JSON.stringify({ schemaVersion: 99, trace: {}, spans: [] }));
    expect(await persistence.loadTrace(id2)).toBeNull();
  });

  it('rejects path-traversal traceIds', async () => {
    await expect(persistence.loadTrace('../etc/passwd')).rejects.toThrow();
  });
});
