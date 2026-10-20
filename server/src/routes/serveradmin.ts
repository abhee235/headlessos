// M7.2: Server Admin Routes — server management via SSH
// @see docs/phases/phase-7.md

import type { FastifyInstance } from 'fastify';
import type { ConnectionManager } from '../ssh/connection-manager.js';
import { validateServiceName, validateLogSource, shellEscape, validateIpAddress, validateJailName, validateCidr, validatePortRange, validateUfwAppName, validateNginxSiteName, validatePackageName, validateSearchQuery, validateCronSchedule, validateCronCommand, validateCronIndex, validateUsername, validateTty, validateGroupName, validateHostname, validateInterfaceName, validateLogPriority, validateGrepPattern, validateDateParam } from '../security/validators.js';
import { parseSsListening, parseSsConnections } from '../parsers/deterministic/ss.js';
import { parseIpRoute, parseResolvConf, parseIpLinkShow } from '../parsers/deterministic/ip-route.js';
import { parseUfwStatus } from '../parsers/deterministic/ufw.js';
import { parseEtcPasswd } from '../parsers/deterministic/etc-passwd.js';
import { parseWho, parseLast } from '../parsers/deterministic/who.js';
import { parseSshdConfig } from '../parsers/deterministic/sshd-config.js';
import { parseNginxSites, parseNginxConfigTest, parseCertbotCertificates } from '../parsers/deterministic/nginx.js';
import { parseAptUpgradable, parseDpkgCount, parseAptSearchResults } from '../parsers/deterministic/apt.js';
import { parseCrontab, parseSystemCrontab } from '../parsers/deterministic/crontab.js';
import { parseJournalctl, parseDmesg } from '../parsers/deterministic/journalctl.js';
import { parseDu } from '../parsers/deterministic/du.js';
import { parseFindmnt, parseSwapon } from '../parsers/deterministic/findmnt.js';
import { parseFail2banJailStatus } from '../parsers/deterministic/fail2ban.js';
import { parseUfwAppList } from '../parsers/deterministic/ufw-apps.js';
import {
  NetworkInfoSchema,
  FirewallStatusSchema,
  SecurityInfoSchema,
  WebServerInfoSchema,
  NginxSiteConfigSchema,
  PackageInfoSchema,
  PackageActionSchema,
  PackageSearchQuerySchema,
  CronInfoSchema,
  AddCronJobSchema,
  EditCronJobSchema,
  CreateUserSchema,
  SetPasswordSchema,
  AddToGroupSchema,
  KillSessionSchema,
  SetHostnameSchema,
  SetDnsSchema,
  LogInfoSchema,
  StorageInfoSchema,
  AddFirewallRuleSchema,
  AddAdvancedFirewallRuleSchema,
  AllowDenyAppSchema,
  UfwAppListSchema,
  ToggleFirewallSchema,
  Fail2banJailDetailSchema,
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
  Fail2banJailDetail,
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
        const [portsRaw, connectionsRaw, routesRaw, dnsRaw, linksRaw, hostnameRaw] = await Promise.all([
          safeExec(id, 'ss -tlnp'),
          safeExec(id, 'ss -tunap'),
          safeExec(id, 'ip route show'),
          safeExec(id, 'cat /etc/resolv.conf'),
          safeExec(id, 'ip -o link show'),
          safeExec(id, 'hostname'),
        ]);

        const data: NetworkInfo = NetworkInfoSchema.parse({
          hostname: hostnameRaw.trim() || undefined,
          ports: parseSsListening(portsRaw),
          connections: parseSsConnections(connectionsRaw),
          routes: parseIpRoute(routesRaw),
          dns: parseResolvConf(dnsRaw),
          interfaces: parseIpLinkShow(linksRaw),
        });

        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch network data' };
      }
    },
  );

  // ── M8.7: Network Management (hostname, DNS, interfaces) ─────────────

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/network/hostname',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = SetHostnameSchema.parse(req.body);
        if (!validateHostname(body.hostname)) {
          reply.code(400);
          return { success: false, error: 'Invalid hostname (RFC 1123)' };
        }

        const result = await exec(id, `sudo hostnamectl set-hostname ${shellEscape(body.hostname)}`, 15_000);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to set hostname' };
        }
        return { success: true, message: `Hostname set to ${body.hostname}` };
      } catch (err) {
        if ((err as Record<string, unknown>).name === 'ZodError') {
          reply.code(400);
          return { success: false, error: 'Invalid request body' };
        }
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to set hostname' };
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/network/dns',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = SetDnsSchema.parse(req.body);

        // Validate each nameserver is a valid IP
        for (const ns of body.nameservers) {
          if (!validateIpAddress(ns)) {
            reply.code(400);
            return { success: false, error: `Invalid nameserver IP: ${ns}` };
          }
        }
        // Validate search domains if provided
        if (body.searchDomains) {
          for (const d of body.searchDomains) {
            if (!validateHostname(d)) {
              reply.code(400);
              return { success: false, error: `Invalid search domain: ${d}` };
            }
          }
        }

        // Build resolv.conf content
        let content = '# Generated by HeadlessOS\n';
        for (const ns of body.nameservers) {
          content += `nameserver ${ns}\n`;
        }
        if (body.searchDomains && body.searchDomains.length > 0) {
          content += `search ${body.searchDomains.join(' ')}\n`;
        }

        // Write via tee (needs sudo for /etc/resolv.conf)
        const escaped = shellEscape(content);
        const result = await exec(id, `echo ${escaped} | sudo tee /etc/resolv.conf > /dev/null`, 15_000);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to write DNS config' };
        }
        return { success: true, message: 'DNS configuration updated' };
      } catch (err) {
        if ((err as Record<string, unknown>).name === 'ZodError') {
          reply.code(400);
          return { success: false, error: 'Invalid request body' };
        }
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to set DNS' };
      }
    },
  );

  fastify.post<{ Params: { id: string; name: string } }>(
    '/api/servers/:id/admin/network/interface/:name/up',
    async (req, reply) => {
      const { id, name } = req.params;
      requireConnected(id);

      if (!validateInterfaceName(name)) {
        reply.code(400);
        return { success: false, error: 'Invalid interface name' };
      }

      try {
        const result = await exec(id, `sudo ip link set ${shellEscape(name)} up`, 15_000);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || `Failed to bring ${name} up` };
        }
        return { success: true, message: `Interface ${name} is up` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : `Failed to bring ${name} up` };
      }
    },
  );

  fastify.post<{ Params: { id: string; name: string } }>(
    '/api/servers/:id/admin/network/interface/:name/down',
    async (req, reply) => {
      const { id, name } = req.params;
      requireConnected(id);

      if (!validateInterfaceName(name)) {
        reply.code(400);
        return { success: false, error: 'Invalid interface name' };
      }

      try {
        const result = await exec(id, `sudo ip link set ${shellEscape(name)} down`, 15_000);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || `Failed to bring ${name} down` };
        }
        return { success: true, message: `Interface ${name} is down` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : `Failed to bring ${name} down` };
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

  // POST add advanced firewall rule (from IP/CIDR)
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/advanced',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = AddAdvancedFirewallRuleSchema.parse(req.body);

        // Validate the source IP/CIDR
        const isIp = validateIpAddress(body.from);
        const isCidr = validateCidr(body.from);
        if (!isIp && !isCidr) {
          reply.code(400);
          return { success: false, error: 'Invalid source IP or CIDR notation' };
        }

        // Validate port range if provided
        if (body.port && !validatePortRange(body.port)) {
          reply.code(400);
          return { success: false, error: 'Invalid port or port range (e.g., 80, 8000:9000)' };
        }

        // Build command: sudo ufw allow from <ip/cidr> to any [port <port>] [proto <proto>]
        let cmd = `sudo ufw ${body.action} from ${shellEscape(body.from)} to any`;
        if (body.port) {
          cmd += ` port ${shellEscape(body.port)}`;
        }
        if (body.protocol) {
          cmd += ` proto ${body.protocol}`;
        }
        if (body.comment) {
          cmd += ` comment ${shellEscape(body.comment)}`;
        }

        const result = await exec(id, cmd, 15_000);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || 'Failed to add advanced rule' };
        }

        return { success: true, message: `Advanced rule added: ${body.action} from ${body.from}` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add firewall rule' };
      }
    },
  );

  // GET ufw app profiles
  fastify.get<{ Params: { id: string } }>(
    '/api/servers/:id/admin/firewall/apps',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const raw = await safeExec(id, 'sudo ufw app list');
        const data = UfwAppListSchema.parse(parseUfwAppList(raw));
        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch app profiles' };
      }
    },
  );

  // POST allow/deny app profile
  fastify.post<{ Params: { id: string }; Body: unknown }>(
    '/api/servers/:id/admin/firewall/app',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const body = AllowDenyAppSchema.parse(req.body);

        if (!validateUfwAppName(body.app)) {
          reply.code(400);
          return { success: false, error: 'Invalid app profile name' };
        }

        const cmd = `sudo ufw ${body.action} ${shellEscape(body.app)}`;
        const result = await exec(id, cmd, 15_000);

        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr.trim() || `Failed to ${body.action} app profile` };
        }

        return { success: true, message: `App profile ${body.action}: ${body.app}` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to modify app profile' };
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
  // FAIL2BAN MANAGEMENT (M8.1)
  // ═══════════════════════════════════════════════════════════════════════

  // GET jail detail
  fastify.get<{ Params: { id: string; jail: string } }>(
    '/api/servers/:id/admin/fail2ban/jails/:jail',
    async (req, reply) => {
      const { id, jail } = req.params;
      requireConnected(id);

      if (!validateJailName(jail)) {
        reply.code(400);
        return { success: false, error: 'Invalid jail name' };
      }

      try {
        const raw = await safeExec(id, `sudo fail2ban-client status ${shellEscape(jail)}`);
        if (!raw || raw.includes('does not exist') || raw.includes('not found')) {
          reply.code(404);
          return { success: false, error: `Jail "${jail}" not found` };
        }
        const detail = Fail2banJailDetailSchema.parse(parseFail2banJailStatus(raw));
        return { success: true, data: detail };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch jail detail' };
      }
    },
  );

  // POST ban IP
  fastify.post<{ Params: { id: string }; Body: { jail: string; ip: string } }>(
    '/api/servers/:id/admin/fail2ban/ban',
    async (req, reply) => {
      const { id } = req.params;
      const { jail, ip } = req.body || {};
      requireConnected(id);

      if (!jail || !validateJailName(jail)) {
        reply.code(400);
        return { success: false, error: 'Invalid jail name' };
      }
      if (!ip || !validateIpAddress(ip)) {
        reply.code(400);
        return { success: false, error: 'Invalid IP address' };
      }

      try {
        const result = await exec(id, `sudo fail2ban-client set ${shellEscape(jail)} banip ${shellEscape(ip)}`);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr || 'Failed to ban IP' };
        }
        return { success: true, message: `Banned ${ip} in jail ${jail}` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to ban IP' };
      }
    },
  );

  // POST unban IP
  fastify.post<{ Params: { id: string }; Body: { jail: string; ip: string } }>(
    '/api/servers/:id/admin/fail2ban/unban',
    async (req, reply) => {
      const { id } = req.params;
      const { jail, ip } = req.body || {};
      requireConnected(id);

      if (!jail || !validateJailName(jail)) {
        reply.code(400);
        return { success: false, error: 'Invalid jail name' };
      }
      if (!ip || !validateIpAddress(ip)) {
        reply.code(400);
        return { success: false, error: 'Invalid IP address' };
      }

      try {
        const result = await exec(id, `sudo fail2ban-client set ${shellEscape(jail)} unbanip ${shellEscape(ip)}`);
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr || 'Failed to unban IP' };
        }
        return { success: true, message: `Unbanned ${ip} from jail ${jail}` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to unban IP' };
      }
    },
  );

  // POST reload fail2ban
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/fail2ban/reload',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo fail2ban-client reload');
        if (result.exitCode !== 0) {
          reply.code(400);
          return { success: false, error: result.stderr || 'Failed to reload fail2ban' };
        }
        return { success: true, message: 'fail2ban reloaded' };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to reload fail2ban' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // USER & SESSION MANAGEMENT (M8.6)
  // ═══════════════════════════════════════════════════════════════════════

  // POST create user
  fastify.post<{ Params: { id: string }; Body: { username: string; shell?: string; createHome?: boolean } }>(
    '/api/servers/:id/admin/users',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = CreateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const { username, shell, createHome } = parsed.data;

      if (!validateUsername(username)) {
        reply.code(400);
        return { success: false, error: 'Invalid username. Must be lowercase, 1-32 chars, start with letter or underscore.' };
      }

      // Prevent creating root or system users
      const protected_users = ['root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news', 'uucp', 'proxy', 'www-data', 'nobody'];
      if (protected_users.includes(username)) {
        reply.code(400);
        return { success: false, error: `Cannot create protected system user "${username}"` };
      }

      try {
        let cmd = `sudo useradd`;
        if (createHome !== false) cmd += ' -m';
        if (shell) cmd += ` -s ${shellEscape(shell)}`;
        cmd += ` ${shellEscape(username)}`;

        const result = await exec(id, cmd, 10_000);
        if (result.exitCode !== 0) {
          const errMsg = result.stderr || '';
          if (errMsg.includes('already exists')) {
            reply.code(409);
            return { success: false, error: `User "${username}" already exists` };
          }
          reply.code(500);
          return { success: false, error: errMsg || 'Failed to create user' };
        }
        return { success: true, message: `User "${username}" created` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to create user' };
      }
    },
  );

  // DELETE user
  fastify.delete<{ Params: { id: string; username: string } }>(
    '/api/servers/:id/admin/users/:username',
    async (req, reply) => {
      const { id, username } = req.params;
      requireConnected(id);

      if (!validateUsername(username)) {
        reply.code(400);
        return { success: false, error: 'Invalid username' };
      }

      // Prevent deleting root or current SSH user
      if (username === 'root') {
        reply.code(400);
        return { success: false, error: 'Cannot delete root user' };
      }

      try {
        const result = await exec(id, `sudo userdel -r ${shellEscape(username)}`, 15_000);
        if (result.exitCode !== 0) {
          const errMsg = result.stderr || '';
          if (errMsg.includes('does not exist')) {
            reply.code(404);
            return { success: false, error: `User "${username}" not found` };
          }
          if (errMsg.includes('currently used by process')) {
            reply.code(409);
            return { success: false, error: `User "${username}" has running processes. Kill them first.` };
          }
          reply.code(500);
          return { success: false, error: errMsg || 'Failed to delete user' };
        }
        return { success: true, message: `User "${username}" deleted` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to delete user' };
      }
    },
  );

  // POST set password
  fastify.post<{ Params: { id: string; username: string }; Body: { password: string } }>(
    '/api/servers/:id/admin/users/:username/password',
    async (req, reply) => {
      const { id, username } = req.params;
      requireConnected(id);

      if (!validateUsername(username)) {
        reply.code(400);
        return { success: false, error: 'Invalid username' };
      }

      const parsed = SetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Password is required' };
      }
      const { password } = parsed.data;

      try {
        // Use chpasswd via stdin — password never appears in process list.
        // SECURITY: escape the ENTIRE "user:pass" string once. Wrapping
        // shellEscape() output in extra quotes (echo '...') breaks the quoting
        // and leaves the password unquoted → command injection.
        const result = await exec(id, `echo ${shellEscape(`${username}:${password}`)} | sudo chpasswd`, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to set password' };
        }
        return { success: true, message: `Password set for "${username}"` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to set password' };
      }
    },
  );

  // POST add user to group
  fastify.post<{ Params: { id: string; username: string }; Body: { group: string } }>(
    '/api/servers/:id/admin/users/:username/groups',
    async (req, reply) => {
      const { id, username } = req.params;
      requireConnected(id);

      if (!validateUsername(username)) {
        reply.code(400);
        return { success: false, error: 'Invalid username' };
      }

      const parsed = AddToGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Group name is required' };
      }
      const { group } = parsed.data;

      if (!validateGroupName(group)) {
        reply.code(400);
        return { success: false, error: 'Invalid group name' };
      }

      try {
        const result = await exec(id, `sudo usermod -aG ${shellEscape(group)} ${shellEscape(username)}`, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to add user to group' };
        }
        return { success: true, message: `Added "${username}" to group "${group}"` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add user to group' };
      }
    },
  );

  // POST kill session
  fastify.post<{ Params: { id: string }; Body: { tty: string } }>(
    '/api/servers/:id/admin/sessions/kill',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = KillSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'TTY is required' };
      }
      const { tty } = parsed.data;

      if (!validateTty(tty)) {
        reply.code(400);
        return { success: false, error: 'Invalid TTY format' };
      }

      try {
        const result = await exec(id, `sudo pkill -KILL -t ${shellEscape(tty)}`, 10_000);
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          // exit code 1 means no processes matched — session may have already ended
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to kill session' };
        }
        return { success: true, message: `Session on ${tty} terminated` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to kill session' };
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
        // Check if nginx is installed — try multiple detection methods.
        // `which nginx` fails when nginx is at /usr/sbin (not in user's PATH),
        // so we check for the config file which always exists when nginx is installed.
        let isInstalled = false;
        const confCheck = await exec(id, 'ls /etc/nginx/nginx.conf', 5_000);
        if (confCheck.exitCode === 0) {
          isInstalled = true;
        } else {
          // Fallback: check if the nginx binary exists anywhere
          const binCheck = await exec(id, 'sudo which nginx', 5_000);
          if (binCheck.exitCode === 0 && binCheck.stdout.trim().length > 0) {
            isInstalled = true;
          }
        }
        if (!isInstalled) {
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
          safeExec(id, 'sudo nginx -t 2>&1'),
          safeExec(id, 'sudo certbot certificates 2>/dev/null'),
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

  // --- M8.3: Nginx site enable ---
  fastify.post<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/enable',
    async (req, reply) => {
      const { id, site } = req.params;
      requireConnected(id);

      if (!validateNginxSiteName(site)) {
        reply.code(400);
        return { success: false, error: 'Invalid site name' };
      }

      try {
        const cmd = `sudo ln -sf /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}`;
        const result = await exec(id, cmd, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr.trim() || 'Failed to enable site' };
        }
        return { success: true, message: `Site '${site}' enabled` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to enable site' };
      }
    },
  );

  // --- M8.3: Nginx site disable ---
  fastify.post<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/disable',
    async (req, reply) => {
      const { id, site } = req.params;
      requireConnected(id);

      if (!validateNginxSiteName(site)) {
        reply.code(400);
        return { success: false, error: 'Invalid site name' };
      }

      try {
        const cmd = `sudo rm /etc/nginx/sites-enabled/${site}`;
        const result = await exec(id, cmd, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr.trim() || 'Failed to disable site' };
        }
        return { success: true, message: `Site '${site}' disabled` };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to disable site' };
      }
    },
  );

  // --- M8.3: Nginx reload ---
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/reload',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo nginx -s reload', 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr.trim() || 'Failed to reload nginx' };
        }
        return { success: true, message: 'Nginx reloaded' };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to reload nginx' };
      }
    },
  );

  // --- M8.3: Nginx restart ---
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/restart',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo systemctl restart nginx', 15_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr.trim() || 'Failed to restart nginx' };
        }
        return { success: true, message: 'Nginx restarted' };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to restart nginx' };
      }
    },
  );

  // --- M8.3: Read site config ---
  fastify.get<{ Params: { id: string; site: string } }>(
    '/api/servers/:id/admin/nginx/sites/:site/config',
    async (req, reply) => {
      const { id, site } = req.params;
      requireConnected(id);

      if (!validateNginxSiteName(site)) {
        reply.code(400);
        return { success: false, error: 'Invalid site name' };
      }

      try {
        const cmd = `sudo cat /etc/nginx/sites-available/${site}`;
        const result = await exec(id, cmd, 10_000);
        if (result.exitCode !== 0) {
          reply.code(404);
          return { success: false, error: 'Site config not found' };
        }
        const data = NginxSiteConfigSchema.parse({ site, config: result.stdout });
        return { success: true, data };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to read site config' };
      }
    },
  );

  // --- M8.3: Test nginx config ---
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/nginx/test',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo nginx -t 2>&1', 10_000);
        const parsed = parseNginxConfigTest(result.stdout || result.stderr);
        return { success: true, data: parsed };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to test config' };
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

  // --- M8.4: apt update ---
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages/update',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo apt update', 120_000);
        return {
          success: result.exitCode === 0,
          data: { output: result.stdout + result.stderr },
          error: result.exitCode !== 0 ? (result.stderr || 'apt update failed') : undefined,
        };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to run apt update' };
      }
    },
  );

  // --- M8.4: apt upgrade all ---
  fastify.post<{ Params: { id: string } }>(
    '/api/servers/:id/admin/packages/upgrade-all',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      try {
        const result = await exec(id, 'sudo apt upgrade -y', 300_000);
        return {
          success: result.exitCode === 0,
          data: { output: result.stdout + result.stderr },
          error: result.exitCode !== 0 ? (result.stderr || 'apt upgrade failed') : undefined,
        };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to run apt upgrade' };
      }
    },
  );

  // --- M8.4: install package ---
  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/install',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = PackageActionSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const pkg = parsed.data.package;
      if (!validatePackageName(pkg)) {
        reply.code(400);
        return { success: false, error: 'Invalid package name' };
      }

      try {
        const result = await exec(id, `sudo apt install -y ${shellEscape(pkg)}`, 300_000);
        return {
          success: result.exitCode === 0,
          data: { output: result.stdout + result.stderr },
          error: result.exitCode !== 0 ? (result.stderr || `Failed to install ${pkg}`) : undefined,
        };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to install package' };
      }
    },
  );

  // --- M8.4: remove package ---
  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/remove',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = PackageActionSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const pkg = parsed.data.package;
      if (!validatePackageName(pkg)) {
        reply.code(400);
        return { success: false, error: 'Invalid package name' };
      }

      try {
        const result = await exec(id, `sudo apt remove -y ${shellEscape(pkg)}`, 120_000);
        return {
          success: result.exitCode === 0,
          data: { output: result.stdout + result.stderr },
          error: result.exitCode !== 0 ? (result.stderr || `Failed to remove ${pkg}`) : undefined,
        };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to remove package' };
      }
    },
  );

  // --- M8.4: upgrade single package ---
  fastify.post<{ Params: { id: string }; Body: { package: string } }>(
    '/api/servers/:id/admin/packages/upgrade',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = PackageActionSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const pkg = parsed.data.package;
      if (!validatePackageName(pkg)) {
        reply.code(400);
        return { success: false, error: 'Invalid package name' };
      }

      try {
        const result = await exec(id, `sudo apt install -y ${shellEscape(pkg)}`, 300_000);
        return {
          success: result.exitCode === 0,
          data: { output: result.stdout + result.stderr },
          error: result.exitCode !== 0 ? (result.stderr || `Failed to upgrade ${pkg}`) : undefined,
        };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to upgrade package' };
      }
    },
  );

  // --- M8.4: search packages ---
  fastify.get<{ Params: { id: string }; Querystring: { q: string } }>(
    '/api/servers/:id/admin/packages/search',
    async (req, reply) => {
      const { id } = req.params;
      const { q } = req.query;
      requireConnected(id);

      if (!q || !validateSearchQuery(q)) {
        reply.code(400);
        return { success: false, error: 'Invalid search query' };
      }

      try {
        const result = await exec(id, `apt search ${shellEscape(q)} 2>/dev/null | head -100`, 30_000);
        const results = parseAptSearchResults(result.stdout);
        return { success: true, data: results };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to search packages' };
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

  // --- M8.5: Add cron job ---
  fastify.post<{ Params: { id: string }; Body: { schedule: string; command: string; description?: string } }>(
    '/api/servers/:id/admin/cron',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const parsed = AddCronJobSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const { schedule, command, description } = parsed.data;

      if (!validateCronSchedule(schedule)) {
        reply.code(400);
        return { success: false, error: 'Invalid cron schedule' };
      }
      if (!validateCronCommand(command)) {
        reply.code(400);
        return { success: false, error: 'Invalid or dangerous cron command' };
      }

      try {
        const entry = description
          ? `# ${description}\n${schedule} ${command}`
          : `${schedule} ${command}`;
        // Append to existing crontab
        const result = await exec(id, `(crontab -l 2>/dev/null; echo '${entry.replace(/'/g, "'\\''")}') | crontab -`, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to add cron job' };
        }
        return { success: true };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to add cron job' };
      }
    },
  );

  // --- M8.5: Delete cron job by index ---
  fastify.delete<{ Params: { id: string; index: string } }>(
    '/api/servers/:id/admin/cron/:index',
    async (req, reply) => {
      const { id } = req.params;
      const index = parseInt(req.params.index, 10);
      requireConnected(id);

      if (!validateCronIndex(index)) {
        reply.code(400);
        return { success: false, error: 'Invalid job index' };
      }

      try {
        // Read current user crontab
        const current = await exec(id, 'crontab -l 2>/dev/null', 5_000);
        if (current.exitCode !== 0 || !current.stdout.trim()) {
          reply.code(400);
          return { success: false, error: 'No crontab entries found' };
        }

        const lines = current.stdout.trim().split('\n');
        // Build list of job lines (non-comment, non-empty, non-variable)
        const jobIndices: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i]!.trim();
          if (!t || t.startsWith('#') || /^\w+=/.test(t)) continue;
          jobIndices.push(i);
        }

        if (index >= jobIndices.length) {
          reply.code(400);
          return { success: false, error: `Job index ${index} out of range (${jobIndices.length} jobs)` };
        }

        const lineToRemove = jobIndices[index]!;
        // Also remove preceding comment line if it exists
        const newLines = lines.filter((_, i) => {
          if (i === lineToRemove) return false;
          // Remove preceding comment
          if (i === lineToRemove - 1 && lines[i]!.trim().startsWith('#')) return false;
          return true;
        });

        const newCrontab = newLines.join('\n');
        const escaped = newCrontab.replace(/'/g, "'\\''");
        const result = await exec(id, `echo '${escaped}' | crontab -`, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to update crontab' };
        }
        return { success: true };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to delete cron job' };
      }
    },
  );

  // --- M8.5: Edit cron job by index ---
  fastify.put<{ Params: { id: string; index: string }; Body: { schedule: string; command: string; description?: string } }>(
    '/api/servers/:id/admin/cron/:index',
    async (req, reply) => {
      const { id } = req.params;
      const index = parseInt(req.params.index, 10);
      requireConnected(id);

      if (!validateCronIndex(index)) {
        reply.code(400);
        return { success: false, error: 'Invalid job index' };
      }

      const parsed = EditCronJobSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { success: false, error: 'Invalid request body' };
      }
      const { schedule, command, description } = parsed.data;

      if (!validateCronSchedule(schedule)) {
        reply.code(400);
        return { success: false, error: 'Invalid cron schedule' };
      }
      if (!validateCronCommand(command)) {
        reply.code(400);
        return { success: false, error: 'Invalid or dangerous cron command' };
      }

      try {
        const current = await exec(id, 'crontab -l 2>/dev/null', 5_000);
        if (current.exitCode !== 0 || !current.stdout.trim()) {
          reply.code(400);
          return { success: false, error: 'No crontab entries found' };
        }

        const lines = current.stdout.trim().split('\n');
        const jobIndices: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i]!.trim();
          if (!t || t.startsWith('#') || /^\w+=/.test(t)) continue;
          jobIndices.push(i);
        }

        if (index >= jobIndices.length) {
          reply.code(400);
          return { success: false, error: `Job index ${index} out of range (${jobIndices.length} jobs)` };
        }

        const lineToReplace = jobIndices[index]!;
        const newEntry = `${schedule} ${command}`;

        // Replace the job line
        lines[lineToReplace] = newEntry;

        // Handle description: replace or add comment above
        const prevLineIdx = lineToReplace - 1;
        if (description) {
          if (prevLineIdx >= 0 && lines[prevLineIdx]!.trim().startsWith('#')) {
            lines[prevLineIdx] = `# ${description}`;
          } else {
            lines.splice(lineToReplace, 0, `# ${description}`);
          }
        } else if (prevLineIdx >= 0 && lines[prevLineIdx]!.trim().startsWith('#')) {
          // Remove old description comment if no new description provided
          lines.splice(prevLineIdx, 1);
        }

        const newCrontab = lines.join('\n');
        const escaped = newCrontab.replace(/'/g, "'\\''");
        const result = await exec(id, `echo '${escaped}' | crontab -`, 10_000);
        if (result.exitCode !== 0) {
          reply.code(500);
          return { success: false, error: result.stderr || 'Failed to update crontab' };
        }
        return { success: true };
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to edit cron job' };
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // LOGS (M8.8 enhanced)
  // ═══════════════════════════════════════════════════════════════════════

  fastify.get<{
    Params: { id: string };
    Querystring: {
      source?: string; unit?: string; lines?: string;
      priority?: string; since?: string; until?: string; grep?: string;
    };
  }>(
    '/api/servers/:id/admin/logs',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

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

      const priority = req.query.priority || '';
      if (priority && !validateLogPriority(priority)) {
        reply.code(400);
        return { success: false, error: 'Invalid priority. Must be 0-7' };
      }

      const since = req.query.since || '';
      if (since && !validateDateParam(since)) {
        reply.code(400);
        return { success: false, error: 'Invalid since date' };
      }

      const until = req.query.until || '';
      if (until && !validateDateParam(until)) {
        reply.code(400);
        return { success: false, error: 'Invalid until date' };
      }

      const grep = req.query.grep || '';
      if (grep && !validateGrepPattern(grep)) {
        reply.code(400);
        return { success: false, error: 'Invalid grep pattern. Avoid shell special characters.' };
      }

      const lineCount = Math.min(parseInt(req.query.lines || '100', 10) || 100, 1000);

      try {
        let raw: string;

        switch (source) {
          case 'dmesg':
            raw = await safeExec(id, `dmesg --time-format=iso 2>/dev/null || dmesg`, 10_000);
            // For dmesg, apply grep filter client-side after parsing
            break;
          case 'syslog':
            raw = await safeExec(id, `tail -n ${lineCount} /var/log/syslog 2>/dev/null || tail -n ${lineCount} /var/log/messages`, 10_000);
            break;
          case 'journal':
          default: {
            const flags: string[] = ['--no-pager', `-n ${lineCount}`, '--output=short-iso'];
            if (unit) flags.push(`-u ${shellEscape(unit)}`);
            if (priority) flags.push(`-p ${priority}`);
            if (since) flags.push(`--since=${shellEscape(since)}`);
            if (until) flags.push(`--until=${shellEscape(until)}`);
            if (grep) flags.push(`--grep=${shellEscape(grep)}`);
            raw = await safeExec(id, `journalctl ${flags.join(' ')} 2>/dev/null`, 15_000);
            break;
          }
        }

        let entries = source === 'dmesg' ? parseDmesg(raw) : parseJournalctl(raw);

        // For non-journal sources, apply grep filter in-memory
        if (grep && source !== 'journal') {
          try {
            const re = new RegExp(grep, 'i');
            entries = entries.filter(e => re.test(e.message));
          } catch {
            // If invalid regex, do simple includes
            const lower = grep.toLowerCase();
            entries = entries.filter(e => e.message.toLowerCase().includes(lower));
          }
        }

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

  // M8.8: Log Export — download filtered logs as text file
  fastify.get<{
    Params: { id: string };
    Querystring: {
      source?: string; unit?: string; lines?: string;
      priority?: string; since?: string; until?: string; grep?: string;
    };
  }>(
    '/api/servers/:id/admin/logs/export',
    async (req, reply) => {
      const { id } = req.params;
      requireConnected(id);

      const rawSource = req.query.source || 'journal';
      if (!validateLogSource(rawSource)) {
        reply.code(400);
        return { success: false, error: 'Invalid log source' };
      }
      const source = rawSource;

      const unit = req.query.unit || '';
      if (unit && !validateServiceName(unit)) {
        reply.code(400);
        return { success: false, error: 'Invalid unit name' };
      }

      const priority = req.query.priority || '';
      if (priority && !validateLogPriority(priority)) {
        reply.code(400);
        return { success: false, error: 'Invalid priority' };
      }

      const since = req.query.since || '';
      if (since && !validateDateParam(since)) {
        reply.code(400);
        return { success: false, error: 'Invalid since date' };
      }

      const until = req.query.until || '';
      if (until && !validateDateParam(until)) {
        reply.code(400);
        return { success: false, error: 'Invalid until date' };
      }

      const grep = req.query.grep || '';
      if (grep && !validateGrepPattern(grep)) {
        reply.code(400);
        return { success: false, error: 'Invalid grep pattern' };
      }

      const lineCount = Math.min(parseInt(req.query.lines || '500', 10) || 500, 5000);

      try {
        let raw: string;

        switch (source) {
          case 'dmesg':
            raw = await safeExec(id, `dmesg --time-format=iso 2>/dev/null || dmesg`, 15_000);
            break;
          case 'syslog':
            raw = await safeExec(id, `tail -n ${lineCount} /var/log/syslog 2>/dev/null || tail -n ${lineCount} /var/log/messages`, 15_000);
            break;
          case 'journal':
          default: {
            const flags: string[] = ['--no-pager', `-n ${lineCount}`, '--output=short-iso'];
            if (unit) flags.push(`-u ${shellEscape(unit)}`);
            if (priority) flags.push(`-p ${priority}`);
            if (since) flags.push(`--since=${shellEscape(since)}`);
            if (until) flags.push(`--until=${shellEscape(until)}`);
            if (grep) flags.push(`--grep=${shellEscape(grep)}`);
            raw = await safeExec(id, `journalctl ${flags.join(' ')} 2>/dev/null`, 20_000);
            break;
          }
        }

        // Apply grep for non-journal sources
        if (grep && source !== 'journal') {
          const lines = raw.split('\n');
          try {
            const re = new RegExp(grep, 'i');
            raw = lines.filter(l => re.test(l)).join('\n');
          } catch {
            const lower = grep.toLowerCase();
            raw = lines.filter(l => l.toLowerCase().includes(lower)).join('\n');
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `logs-${source}-${timestamp}.txt`;

        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        return raw;
      } catch (err) {
        reply.code(500);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to export logs' };
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
