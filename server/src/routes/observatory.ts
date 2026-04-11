// EX4-C.1 + C.2: Observatory REST Routes + WebSocket Live Events
// @see docs/phases/phase-ex4.md
//
// GET  /api/observatory/traces        — paginated, filterable trace list
// GET  /api/observatory/traces/:traceId — single trace with span tree
// GET  /api/observatory/spans/:spanId  — single span detail (with input/output)
// GET  /api/observatory/stats          — global observatory stats
// POST /api/observatory/clear          — clear all traces
// WS   /ws/observatory                — live trace/span events

import type { FastifyInstance } from 'fastify';
import { TraceListQuerySchema } from 'headlessos-shared/schemas/observatory';
import type { TraceStore } from '../observatory/trace-store.js';
import type { SpanTreeNode, Span, ObservatoryEvent } from 'headlessos-shared/schemas/observatory';

export interface ObservatoryRouteOpts {
  traceStore: TraceStore;
}

export async function observatoryRoutes(
  fastify: FastifyInstance,
  opts: ObservatoryRouteOpts,
): Promise<void> {
  const { traceStore } = opts;

  // ── GET /api/observatory/traces — Paginated trace list ──
  fastify.get('/api/observatory/traces', async (req) => {
    const query = TraceListQuerySchema.parse(req.query);
    const result = traceStore.listTraces({
      limit: query.limit,
      offset: query.offset,
      trigger: query.trigger,
      status: query.status,
      serverId: query.serverId,
    });
    return result;
  });

  // ── GET /api/observatory/traces/:traceId — Trace with span tree ──
  fastify.get<{ Params: { traceId: string } }>(
    '/api/observatory/traces/:traceId',
    async (req, reply) => {
      const { traceId } = req.params;
      const trace = traceStore.getTrace(traceId);
      if (!trace) {
        return reply.code(404).send({ error: 'Trace not found' });
      }

      const spanTree = traceStore.getSpanTree(traceId);
      if (!spanTree) {
        return reply.code(404).send({ error: 'Span tree not found' });
      }

      // Lazy serialization: strip input/output from span tree
      const strippedTree = stripSpanTreeContent(spanTree);

      return { trace, spanTree: strippedTree };
    },
  );

  // ── GET /api/observatory/spans/:spanId — Single span detail ──
  fastify.get<{ Params: { spanId: string } }>(
    '/api/observatory/spans/:spanId',
    async (req, reply) => {
      const { spanId } = req.params;
      const span = traceStore.getSpan(spanId);
      if (!span) {
        return reply.code(404).send({ error: 'Span not found' });
      }

      // Full detail including input/output
      return { span };
    },
  );

  // ── GET /api/observatory/stats — Global stats ──
  fastify.get('/api/observatory/stats', async () => {
    return traceStore.getStats();
  });

  // ── POST /api/observatory/clear — Clear all traces ──
  fastify.post('/api/observatory/clear', async () => {
    traceStore.clear();
    return { success: true };
  });

  // ── WS /ws/observatory — Live trace/span events ──
  // Fire-and-forget broadcast: if no clients are connected, events are silently dropped.
  // Events include summary data only (no input/output).

  const clients = new Set<import('ws').WebSocket>();

  fastify.get('/ws/observatory', { websocket: true }, (socket) => {
    clients.add(socket);

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  // Subscribe to TraceStore events and broadcast
  const onEvent = (event: ObservatoryEvent) => {
    if (clients.size === 0) return;

    // Strip input/output from span events (summary only)
    const stripped = stripEventContent(event);
    const message = JSON.stringify(stripped);

    for (const client of clients) {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    }
  };

  traceStore.on('event', onEvent);

  // Cleanup on server close
  fastify.addHook('onClose', () => {
    traceStore.removeListener('event', onEvent);
    for (const client of clients) {
      client.close();
    }
    clients.clear();
  });
}

// ── Helpers ──

/**
 * Recursively strip input/output from span tree nodes.
 * List/tree endpoints don't return span content — only the detail endpoint does.
 */
function stripSpanTreeContent(node: SpanTreeNode): SpanTreeNode {
  const strippedSpan: Span = {
    ...node.span,
    input: null,
    output: null,
  };
  return {
    span: strippedSpan,
    children: node.children.map(stripSpanTreeContent),
  };
}

/**
 * Strip input/output from span events before broadcasting.
 * Clients fetch full span detail on-demand.
 */
function stripEventContent(event: ObservatoryEvent): ObservatoryEvent {
  if (event.type === 'span:start' || event.type === 'span:end') {
    return {
      ...event,
      span: { ...event.span, input: null, output: null },
    };
  }
  return event;
}
