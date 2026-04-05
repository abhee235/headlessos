// M7.2: Server Admin Routes — server management via SSH
// @see docs/phases/phase-7.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { validateServiceName, validateLogSource, shellEscape } from '../security/validators.js';
import { parseSsListening, parseSsConnections } from '../parsers/deterministic/ss.js';
import { parseIpRoute, parseResolvConf } from '../parsers/deterministic/ip-route.js';
import { parseUfwStatus } from '../parsers/deterministic/ufw.js';
import { parseEtcPasswd } from '../parsers/deterministic/etc-passwd.js';
import { parseWho, parseLast } from '../parsers/deterministic/who.js';
import { parseSshdConfig } from '../parsers/deterministic/sshd-config.js';
import { parseNginxSites, parseNginxConfigTest, parseCertbotCertificates } from '../parsers/deterministic/nginx.js';
import { parseAptUpgradable, parseDpkgCount } from '../parsers/deterministic/apt.js';
import { parseCrontab, parseSystemCrontab } from '../parsers/deterministic/crontab.js';
import { parseJournalctl, parseDmesg } from '../parsers/deterministic/journalctl.js';
import { parseDu } from '../parsers/deterministic/du.js';
import { parseFindmnt, parseSwapon } from '../parsers/deterministic/findmnt.js';
import {
  NetworkInfoSchema,
  FirewallStatusSchema,
  SecurityInfoSchema,
  WebServerInfoSchema,
  PackageInfoSchema,
  CronInfoSchema,
  LogInfoSchema,
  StorageInfoSchema,
  AddFirewallRuleSchema,
  ToggleFirewallSchema,
} from '../parsers/schemas/serveradmin.js';
import type {
  NetworkInfo,
  FirewallStatus,
  SecurityInfo,
  WebServerInfo,
  PackageInfo,
  CronInfo,
  LogInfo,
  StorageInfo,
} from '../parsers/schemas/serveradmin.js';

interface ServerAdminRouteOpts {
  connectionManager: ConnectionManager;
}

export async function serverAdminRoutes(
  fastify: FastifyInstance,
  opts: ServerAdminRouteOpts,
): Promise<void> {
  const { connectionManager } = opts;

  // ── Helper: ensure server is connected ────────────────

  function requireConnected(serverId: string): void {
    const state = connectionManager.getState(serverId);
    if (state.status !== 'connected') {
      throw Object.assign(new Error(`Server "${serverId}" is not connected`), {
        statusCode: 400,
      });
    }
  }

  /** Run command, return stdout or empty string on failure. */
  async function safeExec(serverId: string, command: string, timeout = 10_000): Promise<string> {
    try {
      const result = await connectionManager.exec(serverId, command, timeout);
      return result.stdout;
    } catch {
      return '';
    }
  }

  /** Run command, return full ExecResult. */
  async function exec(serverId: string, command: string, timeout = 10_000) {
    return connectionManager.exec(serverId, command, timeout);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NETWORK
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/network',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const [portsRaw, connectionsRaw, routesRaw, dnsRaw] = await Promise.all([
          safeExec(id, 'ss -tlnp'),
          safeExec(id, 'ss -tunap'),
          safeExec(id, 'ip route show'),
          safeExec(id, 'cat /etc/resolv.conf'),
        ]);

        const data: NetworkInfo = NetworkInfoSchema.parse({
          ports: parseSsListening(portsRaw),
          connections: parseSsConnections(connectionsRaw),
          routes: parseIpRoute(routesRaw),
          dns: parseResolvConf(dnsRaw),
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch network data' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // FIREWALL
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/firewall',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const raw = await safeExec(id, 'sudo ufw status numbered');
        const data: FirewallStatus = FirewallStatusSchema.parse(parseUfwStatus(raw));
        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch firewall status' };
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = AddFirewallRuleSchema.parse(req.body);
        const cmd = `sudo ufw ${body.action} ${body.port}/${body.protocol}`;
        const result = await exec(id, cmd, 15_000);

        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to add rule' };
        }

        return { success: true, message: `Rule added: ${body.action} ${body.port}/${body.protocol}` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add firewall rule' };
      }
    },
  );

  fastify.delete<{ Params: { id: string; ruleNumber: string } }>(
    '/api/servers/:id/admin/firewall/:ruleNumber',
    async (req, reply) => {
      const { id, ruleNumber } = req.params;
      requireConnected(id);

      const num = parseInt(ruleNumber, 10);
      if (isNaN(num) || num < 1) {
        reply.code(400);
        return { success: false, error: 'Invalid rule number' };
      }

      try {
        // Use echo y | to auto-confirm
        const result = await exec(id, `echo y | sudo ufw delete ${num}`, 15_000);

        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to delete rule' };
        }

        return { success: true, message: `Rule ${num} deleted` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to delete firewall rule' };
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/toggle',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = ToggleFirewallSchema.parse(req.body);
        const cmd = body.enable ? 'echo y | sudo ufw enable' : 'sudo ufw disable';
        const result = await exec(id, cmd, 15_000);

        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to toggle firewall' };
        }

        return { success: true, message: body.enable ? 'Firewall enabled' : 'Firewall disabled' };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to toggle firewall' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/security',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const [usersRaw, sessionsRaw, historyRaw, sshdRaw, fail2banRaw] = await Promise.all([
          safeExec(id, 'cat /etc/passwd'),
          safeExec(id, 'who'),
          safeExec(id, 'last -n 30'),
          safeExec(id, 'cat /etc/ssh/sshd_config'),
          safeExec(id, 'sudo fail2ban-client status'),
        ]);

        // Parse fail2ban
        const fail2banAvailable = !fail2banRaw.includes('command not found') && fail2banRaw.trim().length > 0;
        const jails: string[] = [];
        if (fail2banAvailable) {
          const jailMatch = fail2banRaw.match(/Jail list:\s*(.+)/);
          if (jailMatch) {
            jails.push(...jailMatch[1]!.split(',').map((j) => j.trim()).filter(Boolean));
          }
        }

        const data: SecurityInfo = SecurityInfoSchema.parse({
          users: parseEtcPasswd(usersRaw),
          sessions: parseWho(sessionsRaw),
          loginHistory: parseLast(historyRaw),
          sshConfig: parseSshdConfig(sshdRaw),
          fail2ban: {
            available: fail2banAvailable,
            jails: fail2banAvailable ? jails : undefined,
            message: fail2banAvailable ? undefined : 'fail2ban is not installed',
          },
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch security data' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // WEB SERVER
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/webserver',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        // Check if nginx is installed
        const checkResult = await exec(id, 'which nginx', 5_000);
        if (checkResult.exitCode !== 0) {
          const data: WebServerInfo = {
            available: false,
            sites: [],
            sslCertificates: [],
            message: 'Nginx is not installed',
          };
          return { success: true, data };
        }

        const [availableRaw, enabledRaw, configTestRaw, certbotRaw] = await Promise.all([
          safeExec(id, 'ls -1 /etc/nginx/sites-available/ 2>/dev/null'),
          safeExec(id, 'ls -1 /etc/nginx/sites-enabled/ 2>/dev/null'),
          safeExec(id, 'nginx -t 2>&1'),
          safeExec(id, 'certbot certificates 2>/dev/null'),
        ]);

        const sitesInput = `${availableRaw}---ENABLED---${enabledRaw}`;

        const data: WebServerInfo = WebServerInfoSchema.parse({
          available: true,
          sites: parseNginxSites(sitesInput),
          configTest: parseNginxConfigTest(configTestRaw),
          sslCertificates: parseCertbotCertificates(certbotRaw),
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch web server data' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PACKAGES
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        // Check for apt (Debian/Ubuntu)
        const checkResult = await exec(id, 'which apt', 5_000);
        if (checkResult.exitCode !== 0) {
          const data: PackageInfo = {
            available: false,
            totalInstalled: 0,
            upgradable: [],
            message: 'apt package manager not found (non-Debian system?)',
          };
          return { success: true, data };
        }

        const [upgradableRaw, countRaw] = await Promise.all([
          safeExec(id, 'apt list --upgradable 2>/dev/null'),
          safeExec(id, 'dpkg -l 2>/dev/null | wc -l'),
        ]);

        const data: PackageInfo = PackageInfoSchema.parse({
          available: true,
          totalInstalled: parseDpkgCount(countRaw),
          upgradable: parseAptUpgradable(upgradableRaw),
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch package data' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // CRON JOBS
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/cron',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const [userCronRaw, systemCronRaw] = await Promise.all([
          safeExec(id, 'crontab -l 2>&1'),
          safeExec(id, 'cat /etc/crontab 2>/dev/null'),
        ]);

        const userJobs = parseCrontab(userCronRaw);
        const systemJobs = parseSystemCrontab(systemCronRaw);

        const data: CronInfo = CronInfoSchema.parse({
          jobs: [...userJobs, ...systemJobs],
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch cron data' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // LOGS
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{
    Params: { id: string };
    Querystring: { source?: string; unit?: string; lines?: string };
  }>(
    '/api/servers/:id/admin/logs',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      // M5.1: Validate and sanitize all query params
      const rawSource = req.query.source || 'journal';
      if (!validateLogSource(rawSource)) {
        reply.code(400);
        return { success: false, error: 'Invalid log source. Must be: journal, dmesg, or syslog' };
      }
      const source = rawSource;

      const unit = req.query.unit || '';
      if (unit && !validateServiceName(unit)) {
        reply.code(400);
        return { success: false, error: 'Invalid unit name' };
      }

      const lineCount = Math.min(parseInt(req.query.lines || '100', 10) || 100, 500);

      try {
        let raw: string;

        switch (source) {
          case 'dmesg':
            raw = await safeExec(id, `dmesg --time-format=iso 2>/dev/null || dmesg`, 10_000);
            break;
          case 'syslog':
            raw = await safeExec(id, `tail -n ${lineCount} /var/log/syslog 2>/dev/null || tail -n ${lineCount} /var/log/messages`, 10_000);
            break;
          case 'journal':
          default: {
            const unitFlag = unit ? ` -u ${shellEscape(unit)}` : '';
            raw = await safeExec(id, `journalctl --no-pager -n ${lineCount} --output=short-iso${unitFlag} 2>/dev/null`, 10_000);
            break;
          }
        }

        const entries = source === 'dmesg' ? parseDmesg(raw) : parseJournalctl(raw);

        const data: LogInfo = LogInfoSchema.parse({
          source,
          entries,
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch logs' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/storage',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const [duRaw, mountsRaw, swapRaw] = await Promise.all([
          safeExec(id, 'du -sh /var/log /tmp /home /var/lib/docker /var/cache 2>/dev/null'),
          safeExec(id, 'findmnt --json 2>/dev/null || findmnt -l'),
          safeExec(id, 'swapon --show 2>/dev/null'),
        ]);

        const data: StorageInfo = StorageInfoSchema.parse({
          dirSizes: parseDu(duRaw),
          mounts: parseFindmnt(mountsRaw),
          swap: parseSwapon(swapRaw),
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch storage data' };
      }
    },
  );
}
