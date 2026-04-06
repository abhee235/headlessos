// M10.6: IPC Pub-Sub Event Bus — cross-component typed event system
// @see docs/PROGRESS.md

// ── Event Type Definitions ───────────────────────────────

export interface EventMap {
  // Server lifecycle
  'server:connected':     { serverId: string };
  'server:disconnected':  { serverId: string; reason?: string };
  'server:status-change': { serverId: string; status: string };

  // File system events
  'fs:file-created':   { serverId: string; path: string };
  'fs:file-deleted':   { serverId: string; path: string };
  'fs:file-renamed':   { serverId: string; oldPath: string; newPath: string };
  'fs:file-uploaded':  { serverId: string; path: string; files: string[] };
  'fs:directory-changed': { serverId: string; path: string };

  // Docker events
  'docker:container-started': { serverId: string; containerId: string; name: string };
  'docker:container-stopped': { serverId: string; containerId: string; name: string };
  'docker:container-removed': { serverId: string; containerId: string };
  'docker:image-removed':     { serverId: string; imageId: string };

  // Service events
  'service:started':  { serverId: string; name: string };
  'service:stopped':  { serverId: string; name: string };
  'service:restarted': { serverId: string; name: string };

  // Process events
  'process:killed': { serverId: string; pid: number; signal?: string };

  // UI events
  'window:opened':  { windowId: string; appId: string };
  'window:closed':  { windowId: string; appId: string };
  'window:focused': { windowId: string };
  'tab:switch':     { tabId: string };

  // Theme / Preferences
  'theme:changed':       { theme: 'light' | 'dark' };
  'preferences:updated': { key: string; value: unknown };

  // Notifications
  'notification:added':   { id: string; type: string; title: string };
  'notification:cleared': Record<string, never>;

  // Generic
  'app:refresh': { appId: string; serverId?: string };
}

export type EventName = keyof EventMap;

// ── Listener type ────────────────────────────────────────

type Listener<T> = (payload: T) => void;

// ── Event Bus Implementation ─────────────────────────────

class EventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private history: Array<{ event: string; payload: unknown; timestamp: number }> = [];
  private maxHistory = 100;

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<E extends EventName>(event: E, listener: Listener<EventMap[E]>): () => void {
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

  /**
   * Subscribe to an event for a single invocation.
   */
  once<E extends EventName>(event: E, listener: Listener<EventMap[E]>): () => void {
    const unsub = this.on(event, (payload) => {
      unsub();
      listener(payload);
    });
    return unsub;
  }

  /**
   * Emit an event to all listeners.
   */
  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    // Record in history
    this.history.push({ event, payload, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events.
   */
  off<E extends EventName>(event?: E): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for a specific event, or all events.
   */
  listenerCount(event?: EventName): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }

  /**
   * Get recent event history (for debugging).
   */
  getHistory(): Array<{ event: string; payload: unknown; timestamp: number }> {
    return [...this.history];
  }

  /**
   * Clear event history.
   */
  clearHistory(): void {
    this.history = [];
  }
}

// ── Singleton Instance ───────────────────────────────────

export const eventBus = new EventBus();

// ── React Hook ───────────────────────────────────────────

import { useEffect } from 'react';

/**
 * React hook to subscribe to an event bus event.
 * Automatically unsubscribes on unmount.
 *
 * @example
 * useEventBus('server:connected', ({ serverId }) => {
 *   console.log('Connected to', serverId);
 * });
 */
export function useEventBus<E extends EventName>(
  event: E,
  listener: Listener<EventMap[E]>,
): void {
  useEffect(() => {
    return eventBus.on(event, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}
