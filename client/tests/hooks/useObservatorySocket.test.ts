// EX4: useObservatorySocket hook tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Store mock ---
const mockHandleEvent = vi.fn();
const mockFetchStats = vi.fn();

vi.mock('../../src/store/observatory-store', () => ({
  useObservatoryStore: () => ({
    handleEvent: mockHandleEvent,
    fetchStats: mockFetchStats,
  }),
}));

// --- WebSocket mock ---
type WSHandler = ((evt?: unknown) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: WSHandler = null;
  onclose: WSHandler = null;
  onmessage: WSHandler = null;
  onerror: WSHandler = null;
  readyState = 0;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }

  // Simulate server sending a message
  _receiveMessage(data: unknown) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) } as unknown);
  }

  // Simulate connection opened
  _open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  // Simulate connection error then close
  _error() {
    if (this.onerror) this.onerror();
    this.close();
  }
}

// Patch global WebSocket
const OriginalWebSocket = globalThis.WebSocket;

import { useObservatorySocket } from '../../src/hooks/useObservatorySocket';

describe('useObservatorySocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    mockHandleEvent.mockClear();
    mockFetchStats.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('connects on mount and sets status to connected', () => {
    const { result } = renderHook(() => useObservatorySocket(true));
    expect(result.current.status).toBe('connecting');

    // Simulate server accepting connection
    act(() => {
      MockWebSocket.instances[0]._open();
    });
    expect(result.current.status).toBe('connected');
  });

  it('does not connect when disabled', () => {
    const { result } = renderHook(() => useObservatorySocket(false));
    expect(result.current.status).toBe('disconnected');
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('dispatches events on message', () => {
    renderHook(() => useObservatorySocket(true));
    const ws = MockWebSocket.instances[0];
    act(() => ws._open());

    const event = { type: 'span:start', traceId: 't1', spanId: 's1' };
    act(() => ws._receiveMessage(event));

    expect(mockHandleEvent).toHaveBeenCalledWith(event);
    expect(mockFetchStats).not.toHaveBeenCalled(); // Not trace:end
  });

  it('fetches stats on trace:end event', () => {
    renderHook(() => useObservatorySocket(true));
    const ws = MockWebSocket.instances[0];
    act(() => ws._open());

    const event = { type: 'trace:end', traceId: 't1' };
    act(() => ws._receiveMessage(event));

    expect(mockHandleEvent).toHaveBeenCalledWith(event);
    expect(mockFetchStats).toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    renderHook(() => useObservatorySocket(true));
    const ws = MockWebSocket.instances[0];
    act(() => ws._open());

    // Send raw string that is not valid JSON
    act(() => {
      if (ws.onmessage) ws.onmessage({ data: 'not-json' } as unknown);
    });

    expect(mockHandleEvent).not.toHaveBeenCalled();
  });

  it('auto-reconnects with exponential backoff on close', () => {
    renderHook(() => useObservatorySocket(true));
    const ws1 = MockWebSocket.instances[0];
    act(() => ws1._open());

    // Server disconnects
    act(() => ws1.close());
    expect(MockWebSocket.instances).toHaveLength(1); // Not reconnected yet

    // Advance by first backoff (1s)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2); // Reconnect attempt
  });

  it('caps backoff at 30 seconds', () => {
    renderHook(() => useObservatorySocket(true));

    // Simulate multiple connection failures WITHOUT opening (so retries accumulate)
    // Each close() without open() = retries keep incrementing
    for (let i = 0; i < 8; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      // Close without opening — retries keep growing
      act(() => ws.close());
      // Advance past max backoff to trigger next reconnect
      act(() => vi.advanceTimersByTime(31_000));
    }

    // After 8 failures, retries=8, backoff = min(1000 * 2^8, 30000) = 30000
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => ws.close());

    const countBefore = MockWebSocket.instances.length;

    // 29s should NOT trigger reconnect (backoff = 30s)
    act(() => vi.advanceTimersByTime(29_000));
    expect(MockWebSocket.instances.length).toBe(countBefore);

    // 1 more second (total 30s) SHOULD trigger it
    act(() => vi.advanceTimersByTime(1_000));
    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
  });

  it('resets retries on successful connection', () => {
    renderHook(() => useObservatorySocket(true));
    const ws1 = MockWebSocket.instances[0];

    // Fail once
    act(() => ws1._open());
    act(() => ws1.close());
    act(() => vi.advanceTimersByTime(1000));

    // Second connection opens successfully 
    const ws2 = MockWebSocket.instances[1];
    act(() => ws2._open());

    // Close again — backoff should be 1s (reset), not 2s
    act(() => ws2.close());
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(3); // Reconnected after 1s
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useObservatorySocket(true));
    const ws = MockWebSocket.instances[0];
    act(() => ws._open());

    unmount();
    expect(ws.readyState).toBe(3); // CLOSED
  });

  it('reconnect() resets retry count', () => {
    const { result } = renderHook(() => useObservatorySocket(true));
    act(() => MockWebSocket.instances[0]._open());

    act(() => result.current.reconnect());

    // Should have created a new WebSocket
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
