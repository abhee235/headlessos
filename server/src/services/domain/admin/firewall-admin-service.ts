// M12.4: FirewallAdminService — UFW firewall management
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import {
  shellEscape,
  validateIpAddress,
  validateCidr,
  validatePortRange,
  validateUfwAppName,
} from '../../../security/validators.js';
import { parseUfwStatus } from '../../../parsers/deterministic/ufw.js';
import { parseUfwAppList } from '../../../parsers/deterministic/ufw-apps.js';
import {
  FirewallStatusSchema,
  UfwAppListSchema,
  type FirewallStatus,
} from '../../../parsers/schemas/serveradmin.js';
import { z } from 'zod';

interface BasicRule {
  action: 'allow' | 'deny';
  port: number;
  protocol: 'tcp' | 'udp';
}
interface AdvancedRule {
  action: 'allow' | 'deny';
  from: string;
  port?: string;
  protocol?: 'tcp' | 'udp';
  comment?: string;
}

export class FirewallAdminService extends DomainService {
  async getStatus(serverId: string): Promise<ServiceResult<FirewallStatus>> {
    this.requireConnected(serverId);
    const raw = await this.safeExec(serverId, 'sudo ufw status numbered');
    const data = FirewallStatusSchema.parse(parseUfwStatus(raw));
    return ok(data);
  }

  async addRule(
    serverId: string,
    rule: BasicRule,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    return this.execAction(
      serverId,
      `sudo ufw ${rule.action} ${rule.port}/${rule.protocol}`,
      `Rule added: ${rule.action} ${rule.port}/${rule.protocol}`,
    );
  }

  async addAdvancedRule(
    serverId: string,
    rule: AdvancedRule,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateIpAddress(rule.from) && !validateCidr(rule.from)) {
      return fail('Invalid source IP or CIDR notation', 400);
    }
    if (rule.port && !validatePortRange(rule.port)) {
      return fail('Invalid port or port range (e.g., 80, 8000:9000)', 400);
    }

    let cmd = `sudo ufw ${rule.action} from ${shellEscape(rule.from)} to any`;
    if (rule.port) cmd += ` port ${shellEscape(rule.port)}`;
    if (rule.protocol) cmd += ` proto ${rule.protocol}`;
    if (rule.comment) cmd += ` comment ${shellEscape(rule.comment)}`;

    return this.execAction(
      serverId,
      cmd,
      `Advanced rule added: ${rule.action} from ${rule.from}`,
    );
  }

  async deleteRule(
    serverId: string,
    ruleNumber: number,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!Number.isInteger(ruleNumber) || ruleNumber < 1) {
      return fail('Invalid rule number', 400);
    }
    return this.execAction(
      serverId,
      `echo y | sudo ufw delete ${ruleNumber}`,
      `Rule ${ruleNumber} deleted`,
    );
  }

  async toggle(
    serverId: string,
    enable: boolean,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    const cmd = enable ? 'echo y | sudo ufw enable' : 'sudo ufw disable';
    return this.execAction(
      serverId,
      cmd,
      enable ? 'Firewall enabled' : 'Firewall disabled',
    );
  }

  async listApps(
    serverId: string,
  ): Promise<ServiceResult<z.infer<typeof UfwAppListSchema>>> {
    this.requireConnected(serverId);
    const raw = await this.safeExec(serverId, 'sudo ufw app list');
    return ok(UfwAppListSchema.parse(parseUfwAppList(raw)));
  }

  async allowDenyApp(
    serverId: string,
    action: 'allow' | 'deny',
    app: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateUfwAppName(app)) return fail('Invalid app profile name', 400);
    return this.execAction(
      serverId,
      `sudo ufw ${action} ${shellEscape(app)}`,
      `App profile ${action}: ${app}`,
    );
  }
}
