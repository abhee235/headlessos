// M12.8: SystemdService — domain layer for systemd service management
// @see docs/phases/phase-12.md
//
// Owns: command building, exec calls, systemctl output parsing, validation.
// Routes (routes/services.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import { validateServiceName, shellEscape } from '../../security/validators.js';
import {
  parseSystemctlListUnits,
  parseSystemctlShow,
  unitFileStateToStartup,
} from '../../parsers/deterministic/systemctl.js';
import {
  parseServiceStatusAll,
  parseRcLinks,
  parseShortDescriptions,
  buildSysvServices,
} from '../../parsers/deterministic/sysv-init.js';
import type { ServiceListParsed } from '../../parsers/schemas/services.js';
import type { InitSystem } from '../../parsers/schemas/taskmanager.js';
import { PROBE, NO_SYSTEMD_RE, buildSysvCommand } from './init-system.js';

export interface ServiceListResult {
  services: ServiceListParsed;
  /** true only when systemd answered (kept for the pre-EX8.9 client) */
  systemdAvailable: boolean;
  /** EX8.9 */
  init: InitSystem;
}

const VALID_ACTIONS = ['start', 'stop', 'restart', 'enable', 'disable'] as const;
type ServiceAction = (typeof VALID_ACTIONS)[number];

function normaliseUnit(name: string): string {
  return name.endsWith('.service') ? name : `${name}.service`;
}

export class SystemdService extends DomainService {
  protected async _construct(): Promise<void> {}

  // ── List all services ─────────────────────────────────

  /**
   * systemd: `list-units` merged with `MainPID` / `UnitFileState` from
   * `systemctl show`. EX8.9: without systemd (containers, SysV hosts) the list
   * comes from `service --status-all` + /etc/rc2.d start links; `init` says
   * which answered ('none' when neither exists).
   */
  async listServices(serverId: string): Promise<ServiceResult<ServiceListResult>> {
    try { this.requireConnected(serverId); } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    const [result, runtime] = await Promise.all([
      this.exec(serverId, PROBE.listUnits, 10_000),
      this.execSafe(serverId, PROBE.serviceRuntime, 10_000),
    ]);

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      const errMsg = result.stderr.trim();
      if (errMsg.includes('not found') || NO_SYSTEMD_RE.test(errMsg)) {
        return ok(await this.listSysvServices(serverId));
      }
      return fail(errMsg || 'Failed to list services', 500);
    }

    const byId = new Map(
      (runtime.exitCode === 0 ? parseSystemctlShow(runtime.stdout) : [])
        .filter((b) => b.Id)
        .map((b) => [b.Id!.replace(/\.service$/, ''), b]),
    );
    const services = parseSystemctlListUnits(result.stdout).map((s) => {
      const info = byId.get(s.name);
      const pid = Number.parseInt(info?.MainPID ?? '', 10);
      return {
        ...s,
        startup: unitFileStateToStartup(info?.UnitFileState),
        pid: Number.isInteger(pid) && pid > 0 ? pid : null,
      };
    });
    return ok({ services, systemdAvailable: true, init: 'systemd' });
  }

  private async listSysvServices(serverId: string): Promise<ServiceListResult> {
    const [status, rc2, desc] = await Promise.all([
      this.execSafe(serverId, PROBE.serviceStatusAll, 20_000),
      this.execSafe(serverId, PROBE.rc2d, 5_000),
      this.execSafe(serverId, PROBE.initDescriptions, 10_000),
    ]);
    // `[ ? ]` lines go to stderr on some sysvinit-utils versions
    const statuses = parseServiceStatusAll(`${status.stdout}\n${status.stderr}`);
    if (statuses.length === 0) return { services: [], systemdAvailable: false, init: 'none' };
    return {
      services: buildSysvServices(statuses, parseRcLinks(rc2.stdout), parseShortDescriptions(desc.stdout)),
      systemdAvailable: false,
      init: 'sysv',
    };
  }

  // ── Control a service (start / stop / restart / enable / disable) ──

  async controlService(
    serverId: string,
    serviceName: string,
    action: string,
  ): Promise<ServiceResult<void>> {
    try { this.requireConnected(serverId); } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    if (!validateServiceName(serviceName)) {
      return fail('Invalid service name', 400);
    }
    if (!(VALID_ACTIONS as ReadonlyArray<string>).includes(action)) {
      return fail(
        `Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        400,
      );
    }

    const unit = normaliseUnit(serviceName);
    let result = await this.exec(
      serverId,
      `sudo systemctl ${action as ServiceAction} ${shellEscape(unit)}`,
      15_000,
    );

    // EX8.9: no systemd as PID 1 (or no systemctl) → SysV `service` / `update-rc.d`
    if (result.exitCode !== 0 && NO_SYSTEMD_RE.test(result.stderr)) {
      result = await this.exec(serverId, buildSysvCommand(serviceName, action as ServiceAction), 15_000);
    }

    if (result.exitCode !== 0) {
      return fail(
        result.stderr.trim() || `systemctl ${action} failed with exit code ${result.exitCode}`,
        500,
      );
    }
    return ok(undefined);
  }

  // ── Service status ────────────────────────────────────

  async getServiceStatus(
    serverId: string,
    serviceName: string,
  ): Promise<ServiceResult<{ raw: string }>> {
    try { this.requireConnected(serverId); } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    if (!validateServiceName(serviceName)) {
      return fail('Invalid service name', 400);
    }

    const unit = normaliseUnit(serviceName);
    // systemctl status returns exit code 3 for inactive services — that's expected
    const result = await this.exec(
      serverId,
      `systemctl status ${shellEscape(unit)} --no-pager`,
      10_000,
    );

    return ok({ raw: result.stdout.trim() || result.stderr.trim() });
  }

  // ── Service journal logs ──────────────────────────────

  async getServiceLogs(
    serverId: string,
    serviceName: string,
    lines: string,
  ): Promise<ServiceResult<{ logs: string }>> {
    try { this.requireConnected(serverId); } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    if (!validateServiceName(serviceName)) {
      return fail('Invalid service name', 400);
    }
    if (!/^\d+$/.test(lines)) {
      return fail('Invalid lines count', 400);
    }

    const unit = normaliseUnit(serviceName);
    const result = await this.exec(
      serverId,
      `journalctl -u ${shellEscape(unit)} -n ${lines} --no-pager`,
      10_000,
    );

    return ok({ logs: result.stdout.trim() || result.stderr.trim() });
  }
}
