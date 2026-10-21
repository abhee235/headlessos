// EX9.2: Generated view buttons run catalog actions; changes go through an approval
// @see docs/phases/phase-ex9.md §7, docs/DECISIONS.md (ADR-024)
//
//   POST /api/servers/:id/actions/preview  { actionId, params, label? }
//        read   → { risk: 'read', command }
//        change → stages an approval and returns the card: { risk: 'change', approval }
//   POST /api/servers/:id/actions/run      { actionId, params }  (read actions)
//                                          { approvalId }        (an approved change — runs
//                                            exactly the command recorded at preview)
//   POST /api/servers/:id/actions/approvals/:approvalId/deny

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import type { ActionRunner } from '../agent/actions/runner.js';
import type { ApprovalGate } from '../agent/actions/approvals.js';
import { runAsAgent } from '../services/policy/agent-scope.js';
import { sanitizeErrorMessage } from '../security/validators.js';

export interface ActionRouteDeps {
  connectionManager: Pick<ConnectionManager, 'getState'>;
  runner: ActionRunner;
  approvals: ApprovalGate;
}

const ParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({});
const PreviewBody = z.object({
  actionId: z.string().min(1).max(64),
  params: ParamsSchema,
  /** the button's label; becomes the reason on the approval card */
  label: z.string().max(80).optional(),
}).strict();
const RunBody = z.union([
  z.object({ actionId: z.string().min(1).max(64), params: ParamsSchema }).strict(),
  z.object({ approvalId: z.string().min(1).max(64) }).strict(),
]);

/** Results the client shows in a toast; stdout is capped by the action already. */
function publicResult(r: Awaited<ReturnType<ActionRunner['run']>>) {
  return {
    success: r.ok,
    actionId: r.actionId,
    command: r.command,
    exitCode: r.exitCode,
    output: r.stdout || r.stderr,
    ...(r.ok ? {} : { error: r.error ? sanitizeErrorMessage(r.error) : 'failed' }),
  };
}

export async function actionRoutes(fastify: FastifyInstance, opts: ActionRouteDeps): Promise<void> {
  const { connectionManager, runner, approvals } = opts;

  const connected = (serverId: string) => connectionManager.getState(serverId).status === 'connected';

  fastify.post<{ Params: { id: string } }>('/api/servers/:id/actions/preview', async (req, reply) => {
    const body = PreviewBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid preview request' });
    const { actionId, params, label } = body.data;
    const def = runner.catalog.get(actionId);
    // A button's reason is its label: the model wrote the view, the owner clicked it
    const withReason = def?.risk === 'change'
      ? { ...params, reason: label ? `Button “${label}” in a generated view` : 'Button in a generated view' }
      : params;
    const preview = runner.preview(actionId, withReason);
    if (!preview.ok) return reply.status(400).send({ success: false, error: preview.error });

    if (preview.def.risk === 'read') {
      return { success: true, risk: 'read', actionId, title: preview.def.title, command: preview.command };
    }
    const server = runner.identify(req.params.id);
    const approval = approvals.stage(
      {
        runId: `view-${req.params.id}`, serverId: req.params.id, serverName: server.name, host: server.host,
        loginUser: server.username, actionId, title: preview.def.title, command: preview.command,
        reason: String(preview.params.reason),
      },
      { serverId: req.params.id, actionId, params: preview.params, command: preview.command },
    );
    return { success: true, risk: 'change', actionId, title: preview.def.title, command: preview.command, approval };
  });

  fastify.post<{ Params: { id: string } }>('/api/servers/:id/actions/run', async (req, reply) => {
    const body = RunBody.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ success: false, error: 'Invalid run request' });
    const serverId = req.params.id;
    if (!connected(serverId)) return reply.status(400).send({ success: false, error: `Server "${serverId}" is not connected` });

    if ('approvalId' in body.data) {
      const taken = approvals.take(body.data.approvalId, serverId);
      if (!taken) return reply.status(404).send({ success: false, error: 'That approval has expired or was already used. Click the button again.' });
      return publicResult(await runner.runApproved(taken.ticket));
    }

    const def = runner.catalog.get(body.data.actionId);
    if (def?.risk === 'change') {
      return reply.status(409).send({ success: false, error: 'This action changes the server: preview it and approve it first.' });
    }
    const { actionId, params } = body.data;
    const result = await runAsAgent({ runId: `view-${serverId}`, agent: 'view-action' }, () =>
      runner.run(serverId, actionId, params),
    );
    return publicResult(result);
  });

  fastify.post<{ Params: { id: string; approvalId: string } }>(
    '/api/servers/:id/actions/approvals/:approvalId/deny',
    async (req, reply) => {
      const outcome = approvals.resolve(req.params.approvalId, 'deny', req.params.id);
      if (!outcome) return reply.status(404).send({ success: false, error: 'No such pending approval' });
      return { success: true, ...outcome };
    },
  );
}
