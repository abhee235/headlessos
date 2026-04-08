// EX2.12: useUIAgent — React hook for UI Agent WebSocket communication
// @see docs/phases/phase-ex2.md — EX2.12
//
// Manages WebSocket connection to /ws/ui-agent/:serverId.
// Provides generate(), abort(), and writeBack() actions.
// Dispatches events to the Zustand agent-store.

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAgentStore, type AgentSessionStatus } from '../store/agent-store';
import type { AgentEventType, AgentMetaType } from '../components/Agent/AgentPanel';

// ── Types ──

export interface WriteBackData {
  writeBack: Record<string, unknown>;
  values: Record<string, string | number | boolean>;
}

export interface UseUIAgentReturn {
  /** Start a new agent generation session. Returns requestId. */
  generate: (prompt: string) => string;
  /** Abort an active session */
  abort: (requestId: string) => void;
  /** Send a write-back request for a session */
  writeBack: (requestId: string, data: WriteBackData) => void;
  /** Connection status */
  connected: boolean;
}

// ── Server message types ──

interface ServerMessage {
  type: string;
  requestId: string;
  // Event-specific fields
  message?: string;
  tool?: string;
  success?: boolean;
  outputPreview?: string;
  latencyMs?: number;
  reason?: string;
  view?: unknown;
  feedback?: string;
  action?: 'approve' | 'fix';
  warning?: string;
  retryInMs?: number;
  attempt?: number;
  originalTokens?: number;
  compactedTokens?: number;
  meta?: AgentMetaType;
  error?: string;
}

// ── Hook ──

export function useUIAgent(serverId: string | null): UseUIAgentReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverIdRef = useRef(serverId);
  serverIdRef.current = serverId;

  // Use refs for store actions so connect() doesn't depend on them
  const storeRef = useRef(useAgentStore.getState());
  storeRef.current = useAgentStore.getState();

  // ── WebSocket URL builder ──
  const getWsUrl = useCallback((sId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = '3001'; // Backend port
    return `${protocol}//${host}:${port}/ws/ui-agent/${sId}`;
  }, []);

  // ── Parse server messages into AgentEventType ──

  function parseServerMessage(msg: ServerMessage): AgentEventType | null {
    switch (msg.type) {
      case 'thinking':
        return { type: 'thinking', message: msg.message ?? '' };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool: msg.tool ?? '',
          success: msg.success ?? false,
          outputPreview: msg.outputPreview ?? '',
          latencyMs: msg.latencyMs ?? 0,
        };
      case 'tool_blocked':
        return {
          type: 'tool_blocked',
          tool: msg.tool ?? '',
          reason: msg.reason ?? '',
        };
      case 'partial_view':
        return { type: 'partial_view', view: msg.view };
      case 'generation_complete':
        return { type: 'generation_complete', view: msg.view };
      case 'reflection':
        return {
          type: 'reflection',
          feedback: msg.feedback ?? '',
          action: (msg.action as 'approve' | 'fix') ?? 'approve',
        };
      case 'safety_warning':
        return {
          type: 'safety_warning',
          warning: (msg.warning as 'consecutive_mistakes' | 'tool_repetition') ?? 'consecutive_mistakes',
          tool: msg.tool,
          message: msg.message,
        };
      case 'rate_limited':
        return {
          type: 'rate_limited',
          retryInMs: msg.retryInMs ?? 1000,
          attempt: msg.attempt ?? 1,
        };
      case 'context_compacted':
        return {
          type: 'context_compacted',
          originalTokens: msg.originalTokens ?? 0,
          compactedTokens: msg.compactedTokens ?? 0,
        };
      case 'error':
        return { type: 'error', message: msg.message ?? msg.error ?? 'Unknown error' };
      default:
        return null;
    }
  }

  // ── Connect to WebSocket ──

  const connect = useCallback((sId: string) => {
    // Don't reconnect if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWsUrl(sId);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Guard: only set connected if this WS is still the active one
      if (wsRef.current === ws) {
        setConnected(true);
      }
    };

    ws.onmessage = (event) => {
      // Guard: ignore messages from stale WS
      if (wsRef.current !== ws) return;

      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      if (!msg.type || !msg.requestId) return;

      const store = storeRef.current;

      // Handle terminal events
      if (msg.type === 'complete') {
        if (msg.view && msg.meta) {
          store.completeSession(msg.requestId, msg.view, msg.meta as AgentMetaType);
        }
        // Also add as timeline event
        const evt: AgentEventType = {
          type: 'complete',
          view: msg.view,
          meta: msg.meta as AgentMetaType,
        };
        store.addEvent(msg.requestId, evt);
        return;
      }

      if (msg.type === 'aborted') {
        store.abortSession(msg.requestId);
        return;
      }

      if (msg.type === 'write_back_result') {
        // Dispatch as a special event (no standard AgentEventType for this)
        // Store will receive it via addEvent with a generic type
        store.addEvent(msg.requestId, {
          type: 'thinking',
          message: msg.success
            ? 'Write-back completed successfully'
            : `Write-back failed: ${msg.error ?? 'unknown'}`,
        } as AgentEventType);
        return;
      }

      // Handle partial_view — update the live partial view in the store
      if (msg.type === 'partial_view' && msg.view) {
        store.updatePartialView(msg.requestId, msg.view as Record<string, unknown>);
      }

      if (msg.type === 'error') {
        store.errorSession(msg.requestId, msg.message ?? msg.error ?? 'Unknown error');
      }

      // Parse into AgentEventType and dispatch
      const agentEvent = parseServerMessage(msg);
      if (agentEvent) {
        store.addEvent(msg.requestId, agentEvent);
      }
    };

    ws.onclose = () => {
      // Guard: only handle close if this WS is still the active one
      // This prevents stale close handlers from React StrictMode double-effects
      if (wsRef.current !== ws) return;

      setConnected(false);
      wsRef.current = null;

      // Attempt reconnect after 3s if serverId still active
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (serverIdRef.current) {
          connect(serverIdRef.current);
        }
      }, 3000);
    };

    ws.onerror = () => {
      // Error will trigger close event
    };
  }, [getWsUrl]);

  // ── Connect/disconnect on serverId change ──

  useEffect(() => {
    if (!serverId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    connect(serverId);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [serverId, connect]);

  // ── Actions ──

  const generate = useCallback((prompt: string): string => {
    const requestId = crypto.randomUUID();

    if (!serverIdRef.current) {
      throw new Error('No server selected');
    }

    const store = storeRef.current;
    store.addSession(requestId, serverIdRef.current, prompt);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'generate',
        requestId,
        prompt,
      }));
    } else {
      store.errorSession(requestId, 'WebSocket not connected');
    }

    return requestId;
  }, []);

  const abort = useCallback((requestId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'abort',
        requestId,
      }));
    }
    storeRef.current.abortSession(requestId);
  }, []);

  const writeBack = useCallback((requestId: string, data: WriteBackData) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'write_back',
        requestId,
        writeBack: data.writeBack,
        values: data.values,
      }));
    }
  }, []);

  return {
    generate,
    abort,
    writeBack,
    connected,
  };
}
