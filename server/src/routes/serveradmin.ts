// M8 / M12.5: Server Admin Routes — thin HTTP wrappers around admin domain services
// @see docs/phases/phase-12.md, docs/phases/phase-8.md
//
// Each handler: validate request body/params with Zod → delegate to service → map
// ServiceResult to HTTP response. All command building, parsing, and validation
// live in services/domain/admin/.

import type { FastifyInstance } from 'fastify';
import type {
  NetworkAdminService,
  FirewallAdminService,
  SecurityAdminService,
  WebServerAdminService,
  PackagesAdminService,
  CronAdminService,
  LogsAdminService,
  StorageAdminService,
} from '../services/domain/admin/index.js';
import {
  SetHostnameSchema,
  SetDnsSchema,
  AddFirewallRuleSchema,
  AddAdvancedFirewallRuleSchema,
  AllowDenyAppSchema,
  ToggleFirewallSchema,
  PackageActionSchema,
  AddCronJobSchema,
  EditCronJobSchema,
  CreateUserSchema,
  SetPasswordSchema,
  AddToGroupSchema,
  KillSessionSchema,
} from '../parsers/schemas/serveradmin.js';
import type { ServiceResult } from '../services/domain/base.js';
import { ServiceError } from '../services/domain/base.js';

interface ServerAdminRouteOpts {
  network: NetworkAdminService;
  firewall: FirewallAdminService;
  security: SecurityAdminService;
  webServer: WebServerAdminService;
  packages: PackagesAdminService;
  cron: CronAdminService;
  logs: LogsAdminService;
  storage: StorageAdminService;
}

export async function serverAdminRoutes(
  fastify: FastifyInstance,
  opts: ServerAdminRouteOpts,
): Promise<void> {
  const { network, firewall, security, webServer, packages, cron, logs, storage } =
    opts;

  // ── Helper: send a ServiceResult as a Fastify reply ──
  // Includes optional `message` and `data` in success body to match legacy API.
  // Awaits the service call so ServiceError throws (e.g. requireConnected) get
  // mapped to their statusCode instead of bubbling as generic 500s.
  async function send<T>(
    reply: { code: (n: number) => unknown },
    promise: Promise<ServiceResult<T>>,
  ): Promise<
    { success: true; data?: T; message?: string }
    | { success: false; error: string; data?: T }
  > {
    let r: ServiceResult<T>;
    try {
      r = await promise;
    } catch (err) {
      if (err instanceof ServiceError) {
        reply.code(err.statusCode);
        return { success: false, error: err.message };
      }
      reply.code(500);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Internal error',
      };
    }
    if (!r.ok) {
      reply.code(r.statusCode ?? 500);
      const out: { success: false; error: string; data?: T } = {
        success: false,
        error: r.error ?? 'Unknown error',
      };
      if (r.data !== undefined) out.data = r.data;
      return out;
    }
    // Action results have shape { message: string }; preserve at top level
    if (
      r.data &&
      typeof r.data === 'object' &&
      'message' in (r.data as Record<string, unknown>) &&
      Object.keys(r.data as Record<string, unknown>).length === 1
    ) {
      const msg = (r.data as unknown as { message: string }).message;
      return { success: true, message: msg };
    }
    return { success: true, data: r.data };
  }

  // Validate request body via Zod, send 400 on failure. Returns parsed body.
  function parseBody<T>(
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
    req: { body: unknown },
    reply: { code: (n: number) => unknown },
  ): T | null {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      reply.code(400);
      return null;
    }
    return r.data!;
  }

  // ═══════════════════════════════════════════════════════════════
  // NETWORK
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/network',
    async (req, reply) => send(reply, network.getNetworkInfo(req.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/network/hostname',
    async (req, reply) => {
      const body = parseBody(SetHostnameSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, network.setHostname(req.params.id, body.hostname));
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/network/dns',
    async (req, reply) => {
      const body = parseBody(SetDnsSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(
        reply,
        network.setDns(req.params.id, body.nameservers, body.searchDomains),
      );
    },
  );

  fastify.post<{ Params: { id: string; name: string } }>(
    '/api/servers/:id/admin/network/interface/:name/up',
    async (req, reply) =>
      send(reply, network.interfaceUp(req.params.id, req.params.name)),
  );

  fastify.post<{ Params: { id: string; name: string } }>(
    '/api/servers/:id/admin/network/interface/:name/down',
    async (req, reply) =>
      send(reply, network.interfaceDown(req.params.id, req.params.name)),
  );

  // ═══════════════════════════════════════════════════════════════
  // FIREWALL
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/firewall',
    async (req, reply) => send(reply, firewall.getStatus(req.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall',
    async (req, reply) => {
      const body = parseBody(AddFirewallRuleSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, firewall.addRule(req.params.id, body));
    },
  );

  fastify.delete<{ Params: { id: string; ruleNumber: string } }>(
    '/api/servers/:id/admin/firewall/:ruleNumber',
    async (req, reply) => {
      const num = parseInt(req.params.ruleNumber, 10);
      return send(reply, firewall.deleteRule(req.params.id, num));
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/toggle',
    async (req, reply) => {
      const body = parseBody(ToggleFirewallSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, firewall.toggle(req.params.id, body.enable));
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/advanced',
    async (req, reply) => {
      const body = parseBody(AddAdvancedFirewallRuleSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, firewall.addAdvancedRule(req.params.id, body));
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/firewall/apps',
    async (req, reply) => send(reply, firewall.listApps(req.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/app',
    async (req, reply) => {
      const body = parseBody(AllowDenyAppSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(
        reply,
        firewall.allowDenyApp(req.params.id, body.action, body.app),
      );
    },
  );

  // ═══════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/security',
    async (req, reply) => send(reply, security.getSecurityInfo(req.params.id)),
  );

  // fail2ban
  fastify.get<{ Params: { id: string; jail: string } }>(
    '/api/servers/:id/admin/fail2ban/jails/:jail',
    async (req, reply) =>
      send(reply, security.getJailDetail(req.params.id, req.params.jail)),
  );

  fastify.post<{ Params: { id: string }; Body: { jail: string; ip: string } }>(
    '/api/servers/:id/admin/fail2ban/ban',
    async (req, reply) => {
      const { jail, ip } = req.body || {};
      return send(reply, security.banIp(req.params.id, jail, ip));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { jail: string; ip: string } }>(
    '/api/servers/:id/admin/fail2ban/unban',
    async (req, reply) => {
      const { jail, ip } = req.body || {};
      return send(reply, security.unbanIp(req.params.id, jail, ip));
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/fail2ban/reload',
    async (req, reply) =>
      send(reply, security.reloadFail2ban(req.params.id)),
  );

  // user management
  fastify.post<{
    Params: { id: string };
    Body: { username: string; shell?: string; createHome?: boolean };
  }>('/api/servers/:id/admin/users', async (req, reply) => {
    const body = parseBody(CreateUserSchema, req, reply);
    if (!body) return { success: false, error: 'Invalid request body' };
    return send(
      reply,
      security.createUser(req.params.id, body.username, {
        shell: body.shell,
        createHome: body.createHome,
      }),
    );
  });

  fastify.delete<{ Params: { id: string; username: string } }>(
    '/api/servers/:id/admin/users/:username',
    async (req, reply) =>
      send(reply, security.deleteUser(req.params.id, req.params.username)),
  );

  fastify.post<{
    Params: { id: string; username: string };
    Body: { password: string };
  }>('/api/servers/:id/admin/users/:username/password', async (req, reply) => {
    const body = parseBody(SetPasswordSchema, req, reply);
    if (!body) return { success: false, error: 'Password is required' };
    return send(
      reply,
      security.setPassword(
        req.params.id,
        req.params.username,
        body.password,
      ),
    );
  });

  fastify.post<{
    Params: { id: string; username: string };
    Body: { group: string };
  }>('/api/servers/:id/admin/users/:username/groups', async (req, reply) => {
    const body = parseBody(AddToGroupSchema, req, reply);
    if (!body) return { success: false, error: 'Group name is required' };
    return send(
      reply,
      security.addToGroup(req.params.id, req.params.username, body.group),
    );
  });

  fastify.post<{ Params: { id: string }; Body: { tty: string } }>(
    '/api/servers/:id/admin/sessions/kill',
    async (req, reply) => {
      const body = parseBody(KillSessionSchema, req, reply);
      if (!body) return { success: false, error: 'TTY is required' };
      return send(reply, security.killSession(req.params.id, body.tty));
    },
  );

  // ═══════════════════════════════════════════════════════════════
  // WEB SERVER
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/webserver',
    async (req, reply) => send(reply, webServer.getWebServerInfo(req.params.id)),
  );

  fastify.post<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/enable',
    async (req, reply) =>
      send(reply, webServer.enableSite(req.params.id, req.params.site)),
  );

  fastify.post<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/disable',
    async (req, reply) =>
      send(reply, webServer.disableSite(req.params.id, req.params.site)),
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/reload',
    async (req, reply) => send(reply, webServer.reloadNginx(req.params.id)),
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/restart',
    async (req, reply) => send(reply, webServer.restartNginx(req.params.id)),
  );

  fastify.get<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/config',
    async (req, reply) =>
      send(reply, webServer.readSiteConfig(req.params.id, req.params.site)),
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/test',
    async (req, reply) => send(reply, webServer.testNginxConfig(req.params.id)),
  );

  // ═══════════════════════════════════════════════════════════════
  // PACKAGES
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages',
    async (req, reply) => send(reply, packages.getPackageInfo(req.params.id)),
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages/update',
    async (req, reply) => send(reply, packages.aptUpdate(req.params.id)),
  );

  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages/upgrade-all',
    async (req, reply) => send(reply, packages.upgradeAll(req.params.id)),
  );

  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/install',
    async (req, reply) => {
      const body = parseBody(PackageActionSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, packages.install(req.params.id, body.package));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/remove',
    async (req, reply) => {
      const body = parseBody(PackageActionSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, packages.remove(req.params.id, body.package));
    },
  );

  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/upgrade',
    async (req, reply) => {
      const body = parseBody(PackageActionSchema, req, reply);
      if (!body) return { success: false, error: 'Invalid request body' };
      return send(reply, packages.upgradeOne(req.params.id, body.package));
    },
  );

  fastify.get<{ Params: { id: string }; Querystring: { q: string } }>(
    '/api/servers/:id/admin/packages/search',
    async (req, reply) =>
      send(reply, packages.search(req.params.id, req.query.q ?? '')),
  );

  // ═══════════════════════════════════════════════════════════════
  // CRON
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/cron',
    async (req, reply) => send(reply, cron.getCronInfo(req.params.id)),
  );

  fastify.post<{
    Params: { id: string };
    Body: { schedule: string; command: string; description?: string };
  }>('/api/servers/:id/admin/cron', async (req, reply) => {
    const body = parseBody(AddCronJobSchema, req, reply);
    if (!body) return { success: false, error: 'Invalid request body' };
    return send(reply, cron.addJob(req.params.id, body));
  });

  fastify.delete<{ Params: { id: string; index: string } }>(
    '/api/servers/:id/admin/cron/:index',
    async (req, reply) => {
      const idx = parseInt(req.params.index, 10);
      return send(reply, cron.deleteJobByIndex(req.params.id, idx));
    },
  );

  fastify.put<{
    Params: { id: string; index: string };
    Body: { schedule: string; command: string; description?: string };
  }>('/api/servers/:id/admin/cron/:index', async (req, reply) => {
    const body = parseBody(EditCronJobSchema, req, reply);
    if (!body) return { success: false, error: 'Invalid request body' };
    const idx = parseInt(req.params.index, 10);
    return send(reply, cron.editJobByIndex(req.params.id, idx, body));
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGS
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{
    Params: { id: string };
    Querystring: {
      source?: string; unit?: string; lines?: string;
      priority?: string; since?: string; until?: string; grep?: string;
    };
  }>('/api/servers/:id/admin/logs', async (req, reply) => {
    const q = req.query;
    return send(
      reply,
      logs.getLogs(req.params.id, {
        source: q.source,
        unit: q.unit,
        lines: q.lines ? parseInt(q.lines, 10) : undefined,
        priority: q.priority,
        since: q.since,
        until: q.until,
        grep: q.grep,
      }),
    );
  });

  fastify.get<{
    Params: { id: string };
    Querystring: {
      source?: string; unit?: string; lines?: string;
      priority?: string; since?: string; until?: string; grep?: string;
    };
  }>('/api/servers/:id/admin/logs/export', async (req, reply) => {
    const q = req.query;
    const r = await logs.exportLogs(req.params.id, {
      source: q.source,
      unit: q.unit,
      lines: q.lines ? parseInt(q.lines, 10) : undefined,
      priority: q.priority,
      since: q.since,
      until: q.until,
      grep: q.grep,
    });
    if (!r.ok) {
      reply.code(r.statusCode ?? 500);
      return { success: false, error: r.error };
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `logs-${r.data!.source}-${timestamp}.txt`;
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return r.data!.text;
  });

  // ═══════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/storage',
    async (req, reply) => send(reply, storage.getStorageInfo(req.params.id)),
  );
}
