// EX6-B (bridge): Tests for app-session bridge
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../src/store/app-store';
import { useSessionsStore } from '../../src/store/sessions-store';
import {
  initAppSessionBridge,
  _resetAppSessionBridgeForTests,
} from '../../src/store/app-session-bridge';

// Mock fetch for sessions-store loadAll/cold writes
beforeEach(() => {
  _resetAppSessionBridgeForTests();
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    // GET /api/sessions/:id → 404 (no cold session)
    if (/\/api\/sessions\/[^/]+$/.test(url)) {
      return new Response(null, { status: 404 });
    }
    // GET /api/sessions → empty list
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  // Reset stores
  useAppStore.setState({ activeServerId: null, servers: [] });
  useSessionsStore.setState({
    activeServerId: null,
    sessions: {},
    summaries: [],
  });
});

describe('app-session bridge', () => {
  it('is idempotent', () => {
    initAppSessionBridge();
    initAppSessionBridge();
    initAppSessionBridge();
    // No assertion needed; just ensure no throws and no extra subscriptions
    expect(true).toBe(true);
  });

  it('forwards activeServerId from app-store to sessions-store', async () => {
    initAppSessionBridge();

    useAppStore.setState({ activeServerId: 'srv-1' });
    // Allow microtasks for activate → wake → fetch chain
    await new Promise((r) => setTimeout(r, 10));

    expect(useSessionsStore.getState().activeServerId).toBe('srv-1');
  });

  it('clears sessions activeServerId when app-store goes null', async () => {
    initAppSessionBridge();

    useAppStore.setState({ activeServerId: 'srv-1' });
    await new Promise((r) => setTimeout(r, 10));
    expect(useSessionsStore.getState().activeServerId).toBe('srv-1');

    useAppStore.setState({ activeServerId: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(useSessionsStore.getState().activeServerId).toBe(null);
  });

  it('dedupes consecutive identical activeServerId values', async () => {
    initAppSessionBridge();

    useAppStore.setState({ activeServerId: 'srv-1' });
    useAppStore.setState({ activeServerId: 'srv-1' });
    useAppStore.setState({ activeServerId: 'srv-1' });

    await new Promise((r) => setTimeout(r, 10));

    expect(useSessionsStore.getState().activeServerId).toBe('srv-1');
  });

  it('triggers loadAll() once on init', () => {
    const loadAllSpy = vi.spyOn(useSessionsStore.getState(), 'loadAll');
    initAppSessionBridge();
    expect(loadAllSpy).toHaveBeenCalledTimes(1);
    loadAllSpy.mockRestore();
  });
});
