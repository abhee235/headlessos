// EX4-E.5: Observatory WebSocket Hook — live trace events
// @see docs/phases/phase-ex4.md

import { useEffect, useRef, useState, useCallback } from 'react';
import { useObservatoryStore } from '../store/observatory-store';
import { isElectronProd, BACKEND_PORT, withToken } from '../lib/api';

// Dev: go through the Vite proxy (so the proxy injects the API token).
// Electron prod: connect directly and carry the token as a query param.
function observatoryWsUrl(): string {
  if (isElectronProd) {
    return withToken(`ws://localhost:${BACKEND_PORT}/ws/observatory`);
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/observatory`;
}

export type SocketStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Hook to connect to the Observatory WebSocket and dispatch live events
 * to the Zustand store. Handles auto-reconnect with exponential backoff.
 *
 * @param enabled — Whether the socket should be active (default: true)
 * @returns { status, reconnect }
 */
export function useObservatorySocket(enabled = true) {
  const { handleEvent, fetchStats } = useObservatoryStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const [status, setStatus] = useState<SocketStatus>('disconnected');

  const connect = useCallback(() => {
    if (!enabled) return;

    // Cleanup previous
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('connecting');
    const ws = new WebSocket(observatoryWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      retriesRef.current = 0;
    };

    ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data);
        handleEvent(event);
        // Refresh stats on trace completion
        if (event.type === 'trace:end') {
          fetchStats();
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus('disconnected');

      // Auto-reconnect with exponential backoff (max 30s)
      if (enabled) {
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30_000);
        retriesRef.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [enabled, handleEvent, fetchStats]);

  // Manual reconnect
  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
    };
  }, [enabled, connect]);

  return { status, reconnect };
}
