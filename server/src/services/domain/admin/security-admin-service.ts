// M12.4: SecurityAdminService — security info, fail2ban, user/session management
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import {
  shellEscape,
  validateIpAddress,
  validateJailName,
  validateUsername,
  validateGroupName,
  validateTty,
} from '../../../security/validators.js';
import { parseEtcPasswd } from '../../../parsers/deterministic/etc-passwd.js';
import { parseWho, parseLast } from '../../../parsers/deterministic/who.js';
import { parseSshdConfig } from '../../../parsers/deterministic/sshd-config.js';
import { parseFail2banJailStatus } from '../../../parsers/deterministic/fail2ban.js';
import {
  SecurityInfoSchema,
  Fail2banJailDetailSchema,
  type SecurityInfo,
  type Fail2banJailDetail,
} from '../../../parsers/schemas/serveradmin.js';

const PROTECTED_USERS = new Set([
  'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man',
  'lp', 'mail', 'news', 'uucp', 'proxy', 'www-data', 'nobody',
]);

export class SecurityAdminService extends DomainService {
  async getSecurityInfo(serverId: string): Promise<ServiceResult<SecurityInfo>> {
    this.requireConnected(serverId);
    const [users, sessions, history, sshd, fail2ban] = await Promise.all([
      this.safeExec(serverId, 'cat /etc/passwd'),
      this.safeExec(serverId, 'who'),
      this.safeExec(serverId, 'last -n 30'),
      this.safeExec(serverId, 'cat /etc/ssh/sshd_config'),
      this.safeExec(serverId, 'sudo fail2ban-client status'),
    ]);

    const fail2banAvailable =
      !fail2ban.includes('command not found') && fail2ban.trim().length > 0;
    const jails: string[] = [];
    if (fail2banAvailable) {
      const m = fail2ban.match(/Jail list:\s*(.+)/);
      if (m) jails.push(...m[1]!.split(',').map((j) => j.trim()).filter(Boolean));
    }

    const data = SecurityInfoSchema.parse({
      users: parseEtcPasswd(users),
      sessions: parseWho(sessions),
      loginHistory: parseLast(history),
      sshConfig: parseSshdConfig(sshd),
      fail2ban: {
        available: fail2banAvailable,
        jails: fail2banAvailable ? jails : undefined,
        message: fail2banAvailable ? undefined : 'fail2ban is not installed',
      },
    });
    return ok(data);
  }

  // ── fail2ban ─────────────────────────────────────────

  async getJailDetail(
    serverId: string,
    jail: string,
  ): Promise<ServiceResult<Fail2banJailDetail>> {
    this.requireConnected(serverId);
    if (!validateJailName(jail)) return fail('Invalid jail name', 400);

    const raw = await this.safeExec(
      serverId,
      `sudo fail2ban-client status ${shellEscape(jail)}`,
    );
    if (!raw || raw.includes('does not exist') || raw.includes('not found')) {
      return fail(`Jail "${jail}" not found`, 404);
    }
    return ok(Fail2banJailDetailSchema.parse(parseFail2banJailStatus(raw)));
  }

  async banIp(
    serverId: string,
    jail: string,
    ip: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateJailName(jail)) return fail('Invalid jail name', 400);
    if (!validateIpAddress(ip)) return fail('Invalid IP address', 400);
    return this.execAction(
      serverId,
      `sudo fail2ban-client set ${shellEscape(jail)} banip ${shellEscape(ip)}`,
      `Banned ${ip} in jail ${jail}`,
    );
  }

  async unbanIp(
    serverId: string,
    jail: string,
    ip: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateJailName(jail)) return fail('Invalid jail name', 400);
    if (!validateIpAddress(ip)) return fail('Invalid IP address', 400);
    return this.execAction(
      serverId,
      `sudo fail2ban-client set ${shellEscape(jail)} unbanip ${shellEscape(ip)}`,
      `Unbanned ${ip} from jail ${jail}`,
    );
  }

  async reloadFail2ban(
    serverId: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    return this.execAction(
      serverId,
      'sudo fail2ban-client reload',
      'fail2ban reloaded',
    );
  }

  // ── user management ──────────────────────────────────

  async createUser(
    serverId: string,
    username: string,
    opts: { shell?: string; createHome?: boolean } = {},
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateUsername(username)) {
      return fail(
        'Invalid username. Must be lowercase, 1-32 chars, start with letter or underscore.',
        400,
      );
    }
    if (PROTECTED_USERS.has(username)) {
      return fail(`Cannot create protected system user "${username}"`, 400);
    }

    let cmd = 'sudo useradd';
    if (opts.createHome !== false) cmd += ' -m';
    if (opts.shell) cmd += ` -s ${shellEscape(opts.shell)}`;
    cmd += ` ${shellEscape(username)}`;

    const r = await this.exec(serverId, cmd, 10_000);
    if (r.exitCode !== 0) {
      const msg = r.stderr.trim() || '';
      if (msg.includes('already exists')) {
        return fail(`User "${username}" already exists`, 409);
      }
      return fail(msg || 'Failed to create user', 500);
    }
    return ok({ message: `User "${username}" created` });
  }

  async deleteUser(
    serverId: string,
    username: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateUsername(username)) return fail('Invalid username', 400);
    if (username === 'root') return fail('Cannot delete root user', 400);

    const r = await this.exec(
      serverId,
      `sudo userdel -r ${shellEscape(username)}`,
      15_000,
    );
    if (r.exitCode !== 0) {
      const msg = r.stderr.trim() || '';
      if (msg.includes('does not exist')) {
        return fail(`User "${username}" not found`, 404);
      }
      if (msg.includes('currently used by process')) {
        return fail(
          `User "${username}" has running processes. Kill them first.`,
          409,
        );
      }
      return fail(msg || 'Failed to delete user', 500);
    }
    return ok({ message: `User "${username}" deleted` });
  }

  async setPassword(
    serverId: string,
    username: string,
    password: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateUsername(username)) return fail('Invalid username', 400);
    // SECURITY (C2): escape the ENTIRE "user:pass" string once. Wrapping
    // shellEscape() output in extra quotes (echo '...') breaks the quoting and
    // leaves the password unquoted → command injection.
    return this.execAction(
      serverId,
      `echo ${shellEscape(`${username}:${password}`)} | sudo chpasswd`,
      `Password set for "${username}"`,
      10_000,
    );
  }

  async addToGroup(
    serverId: string,
    username: string,
    group: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateUsername(username)) return fail('Invalid username', 400);
    if (!validateGroupName(group)) return fail('Invalid group name', 400);
    return this.execAction(
      serverId,
      `sudo usermod -aG ${shellEscape(group)} ${shellEscape(username)}`,
      `Added "${username}" to group "${group}"`,
      10_000,
    );
  }

  async killSession(
    serverId: string,
    tty: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateTty(tty)) return fail('Invalid TTY format', 400);
    const r = await this.exec(
      serverId,
      `sudo pkill -KILL -t ${shellEscape(tty)}`,
      10_000,
    );
    // exit code 1 means no processes matched — session may have already ended
    if (r.exitCode !== 0 && r.exitCode !== 1) {
      return fail(r.stderr.trim() || 'Failed to kill session', 500);
    }
    return ok({ message: `Session on ${tty} terminated` });
  }
}
