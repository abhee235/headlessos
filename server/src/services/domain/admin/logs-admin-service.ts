// M12.4: LogsAdminService — system log retrieval (journalctl, dmesg, syslog)
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import {
  shellEscape,
  validateLogSource,
  validateServiceName,
  validateLogPriority,
  validateDateParam,
  validateGrepPattern,
} from '../../../security/validators.js';
import {
  parseJournalctl,
  parseDmesg,
} from '../../../parsers/deterministic/journalctl.js';
import {
  LogInfoSchema,
  type LogInfo,
} from '../../../parsers/schemas/serveradmin.js';

export interface LogQuery {
  source?: string;
  unit?: string;
  lines?: number;
  priority?: string;
  since?: string;
  until?: string;
  grep?: string;
}

type LogSource = 'journal' | 'dmesg' | 'syslog';

export class LogsAdminService extends DomainService {
  /** Fetch parsed log entries. Default lines=100, max 1000. */
  async getLogs(
    serverId: string,
    q: LogQuery,
  ): Promise<ServiceResult<LogInfo>> {
    this.requireConnected(serverId);
    const v = validateLogQuery(q);
    if (!v.ok) return fail(v.error, 400);

    const { source, unit, priority, since, until, grep } = v;
    const lines = Math.min(Math.max(q.lines ?? 100, 1), 1000);

    const raw = await this.fetchRawLogs(
      serverId,
      source,
      unit,
      priority,
      since,
      until,
      grep,
      lines,
      15_000,
    );

    let entries =
      source === 'dmesg' ? parseDmesg(raw) : parseJournalctl(raw);

    // For non-journal sources, apply grep filter in-memory
    if (grep && source !== 'journal') {
      try {
        const re = new RegExp(grep, 'i');
        entries = entries.filter((e) => re.test(e.message));
      } catch {
        const lower = grep.toLowerCase();
        entries = entries.filter((e) => e.message.toLowerCase().includes(lower));
      }
    }

    return ok(LogInfoSchema.parse({ source, entries }));
  }

  /** Returns the raw text for export download. Default lines=500, max 5000. */
  async exportLogs(
    serverId: string,
    q: LogQuery,
  ): Promise<ServiceResult<{ text: string; source: LogSource }>> {
    this.requireConnected(serverId);
    const v = validateLogQuery(q);
    if (!v.ok) return fail(v.error, 400);

    const { source, unit, priority, since, until, grep } = v;
    const lines = Math.min(Math.max(q.lines ?? 500, 1), 5000);

    let raw = await this.fetchRawLogs(
      serverId,
      source,
      unit,
      priority,
      since,
      until,
      grep,
      lines,
      20_000,
    );

    if (grep && source !== 'journal') {
      const arr = raw.split('\n');
      try {
        const re = new RegExp(grep, 'i');
        raw = arr.filter((l) => re.test(l)).join('\n');
      } catch {
        const lower = grep.toLowerCase();
        raw = arr.filter((l) => l.toLowerCase().includes(lower)).join('\n');
      }
    }

    return ok({ text: raw, source });
  }

  private async fetchRawLogs(
    serverId: string,
    source: LogSource,
    unit: string,
    priority: string,
    since: string,
    until: string,
    grep: string,
    lines: number,
    timeout: number,
  ): Promise<string> {
    switch (source) {
      case 'dmesg':
        return this.safeExec(
          serverId,
          'dmesg --time-format=iso 2>/dev/null || dmesg',
          timeout,
        );
      case 'syslog':
        return this.safeExec(
          serverId,
          `tail -n ${lines} /var/log/syslog 2>/dev/null || tail -n ${lines} /var/log/messages`,
          timeout,
        );
      case 'journal':
      default: {
        const flags: string[] = [
          '--no-pager',
          `-n ${lines}`,
          '--output=short-iso',
        ];
        if (unit) flags.push(`-u ${shellEscape(unit)}`);
        if (priority) flags.push(`-p ${priority}`);
        if (since) flags.push(`--since=${shellEscape(since)}`);
        if (until) flags.push(`--until=${shellEscape(until)}`);
        if (grep) flags.push(`--grep=${shellEscape(grep)}`);
        return this.safeExec(
          serverId,
          `journalctl ${flags.join(' ')} 2>/dev/null`,
          timeout,
        );
      }
    }
  }
}

interface ValidationOk {
  ok: true;
  source: LogSource;
  unit: string;
  priority: string;
  since: string;
  until: string;
  grep: string;
}
interface ValidationErr {
  ok: false;
  error: string;
}

function validateLogQuery(q: LogQuery): ValidationOk | ValidationErr {
  const rawSource = q.source || 'journal';
  if (!validateLogSource(rawSource)) {
    return {
      ok: false,
      error: 'Invalid log source. Must be: journal, dmesg, or syslog',
    };
  }
  const unit = q.unit || '';
  if (unit && !validateServiceName(unit)) {
    return { ok: false, error: 'Invalid unit name' };
  }
  const priority = q.priority || '';
  if (priority && !validateLogPriority(priority)) {
    return { ok: false, error: 'Invalid priority. Must be 0-7' };
  }
  const since = q.since || '';
  if (since && !validateDateParam(since)) {
    return { ok: false, error: 'Invalid since date' };
  }
  const until = q.until || '';
  if (until && !validateDateParam(until)) {
    return { ok: false, error: 'Invalid until date' };
  }
  const grep = q.grep || '';
  if (grep && !validateGrepPattern(grep)) {
    return {
      ok: false,
      error: 'Invalid grep pattern. Avoid shell special characters.',
    };
  }
  return {
    ok: true,
    source: rawSource as LogSource,
    unit,
    priority,
    since,
    until,
    grep,
  };
}
