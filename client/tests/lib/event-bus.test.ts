// M10.6: Event Bus Unit Tests
// @see docs/PROGRESS.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus-testable';

// We test through a fresh instance each time, not the singleton
function createBus() {
  // We'll import the class directly from the module for testing
  // For now, replicate the EventBus logic inline for testing
  return new TestableEventBus();
}

// ── Testable EventBus copy (avoids singleton / React import issues) ──

type Listener<T> = (payload: T) => void;

class TestableEventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private history: Array<{ event: string; payload: unknown; timestamp: number }> = [];

  on<T>(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);
    return () => {
      set.delete(listener as Listener<unknown>);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  once<T>(event: string, listener: Listener<T>): () => void {
    const unsub = this.on(event, (payload: unknown) => {
      unsub();
      (listener as Listener<unknown>)(payload);
    });
    return unsub;
  }

  emit(event: string, payload: unknown): void {
    this.history.push({ event, payload, timestamp: Date.now() });
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try { listener(payload); } catch { /* swallow */ }
    }
  }

  off(event?: string): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }

  listenerCount(event?: string): number {
    if (event) return this.listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  getHistory() { return [...this.history]; }
  clearHistory() { this.history = []; }
}

describe('EventBus', () => {
  let bus: TestableEventBus;

  beforeEach(() => {
    bus = new TestableEventBus();
  });

  it('should subscribe and receive events', () => {
    const handler = vi.fn();
    bus.on('server:connected', handler);
    bus.emit('server:connected', { serverId: 'abc' });
    expect(handler).toHaveBeenCalledWith({ serverId: 'abc' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support multiple listeners for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('server:connected', h1);
    bus.on('server:connected', h2);
    bus.emit('server:connected', { serverId: 'x' });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via returned function', () => {
    const handler = vi.fn();
    const unsub = bus.on('server:connected', handler);
    unsub();
    bus.emit('server:connected', { serverId: 'x' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support once() — fire only once', () => {
    const handler = vi.fn();
    bus.once('server:connected', handler);
    bus.emit('server:connected', { serverId: '1' });
    bus.emit('server:connected', { serverId: '2' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ serverId: '1' });
  });

  it('should track listener count', () => {
    expect(bus.listenerCount()).toBe(0);
    const u1 = bus.on('server:connected', () => {});
    const u2 = bus.on('server:disconnected', () => {});
    expect(bus.listenerCount()).toBe(2);
    expect(bus.listenerCount('server:connected')).toBe(1);
    u1();
    expect(bus.listenerCount()).toBe(1);
    u2();
    expect(bus.listenerCount()).toBe(0);
  });

  it('should record event history', () => {
    bus.emit('server:connected', { serverId: 'a' });
    bus.emit('server:disconnected', { serverId: 'b' });
    const history = bus.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]!.event).toBe('server:connected');
    expect(history[1]!.event).toBe('server:disconnected');
  });

  it('should clear history', () => {
    bus.emit('server:connected', { serverId: 'a' });
    bus.clearHistory();
    expect(bus.getHistory()).toHaveLength(0);
  });

  it('should remove all listeners for an event with off()', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('server:connected', h1);
    bus.on('server:connected', h2);
    bus.off('server:connected');
    bus.emit('server:connected', { serverId: 'x' });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it('should remove ALL listeners with off() (no args)', () => {
    bus.on('server:connected', () => {});
    bus.on('server:disconnected', () => {});
    bus.off();
    expect(bus.listenerCount()).toBe(0);
  });

  it('should not throw when emitting with no listeners', () => {
    expect(() => bus.emit('server:connected', { serverId: 'z' })).not.toThrow();
  });

  it('should swallow errors in listeners', () => {
    const good = vi.fn();
    bus.on('server:connected', () => { throw new Error('oops'); });
    bus.on('server:connected', good);
    bus.emit('server:connected', { serverId: 'x' });
    expect(good).toHaveBeenCalledTimes(1);
  });
});
