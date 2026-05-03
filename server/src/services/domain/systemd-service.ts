// M12.8: SystemdService — domain layer for systemd service management
// @see docs/phases/phase-12.md
//
// Owns: command building, exec calls, systemctl output parsing, validation.
// Routes (routes/services.ts) only translate HTTP ↔ ServiceResult.

import { DomainService, ok, fail, type ServiceResult } from './base.js';
import { validateServiceName, shellEscape } from '../../security/validators.js';
import { parseSystemctlListUnits } from '../../parsers/deterministic/systemctl.js';

const VALID_ACTIONS = ['start', 'stop', 'restart', 'enable', 'disable'] as const;
type ServiceAction = (typeof VALID_ACTIONS)[number];

function normaliseUnit(name: string): string {
  return name.endsWith('.service') ? name : `${name}.service`;
}

export class SystemdService extends DomainService {
  protected async _construct(): Promise<void> {}

  // ── List all services ─────────────────────────────────

  async listServices(
    serverId: string,
  ): Promise<ServiceResult<{ services: ReturnType<typeof parseSystemctlListUnits>; systemdAvailable: boolean }>> {
    try { this.requireConnected(serverId); } catch (err) {
      const e = err as Error & { statusCode?: number };
      return fail(e.message ?? 'Not connected', e.statusCode ?? 500);
    }

    const result = await this.exec(
      serverId,
      'systemctl list-units --type=service --all --no-pager --no-legend',
      10_000,
    );

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      const errMsg = result.stderr.trim();
      if (errMsg.includes('not found') || errMsg.includes('command not found')) {
        return ok({ services: [], systemdAvailable: false });
      }
      return fail(errMsg || 'Failed to list services', 500);
    }

    return ok({ services: parseSystemctlListUnits(result.stdout), systemdAvailable: true });
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
    const result = await this.exec(
      serverId,
      `sudo systemctl ${action as ServiceAction} ${shellEscape(unit)}`,
      15_000,
    );

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
