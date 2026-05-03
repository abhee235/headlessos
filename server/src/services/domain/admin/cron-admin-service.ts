// M12.4: CronAdminService — crontab management
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import {
  validateCronSchedule,
  validateCronCommand,
  validateCronIndex,
} from '../../../security/validators.js';
import {
  parseCrontab,
  parseSystemCrontab,
} from '../../../parsers/deterministic/crontab.js';
import {
  CronInfoSchema,
  type CronInfo,
} from '../../../parsers/schemas/serveradmin.js';

interface CronJob {
  schedule: string;
  command: string;
  description?: string;
}

export class CronAdminService extends DomainService {
  async getCronInfo(serverId: string): Promise<ServiceResult<CronInfo>> {
    this.requireConnected(serverId);
    const [user, system] = await Promise.all([
      this.safeExec(serverId, 'crontab -l 2>&1'),
      this.safeExec(serverId, 'cat /etc/crontab 2>/dev/null'),
    ]);
    const data = CronInfoSchema.parse({
      jobs: [...parseCrontab(user), ...parseSystemCrontab(system)],
    });
    return ok(data);
  }

  async addJob(
    serverId: string,
    job: CronJob,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateCronSchedule(job.schedule)) {
      return fail('Invalid cron schedule', 400);
    }
    if (!validateCronCommand(job.command)) {
      return fail('Invalid or dangerous cron command', 400);
    }

    const entry = job.description
      ? `# ${job.description}\n${job.schedule} ${job.command}`
      : `${job.schedule} ${job.command}`;
    const escaped = entry.replace(/'/g, "'\\''");
    return this.execAction(
      serverId,
      `(crontab -l 2>/dev/null; echo '${escaped}') | crontab -`,
      'Cron job added',
      10_000,
    );
  }

  async deleteJobByIndex(
    serverId: string,
    index: number,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateCronIndex(index)) return fail('Invalid job index', 400);

    const lines = await this.readUserCrontab(serverId);
    if (!lines) return fail('No crontab entries found', 400);

    const jobIndices = findJobLineIndices(lines);
    if (index >= jobIndices.length) {
      return fail(
        `Job index ${index} out of range (${jobIndices.length} jobs)`,
        400,
      );
    }

    const lineToRemove = jobIndices[index]!;
    const newLines = lines.filter((_, i) => {
      if (i === lineToRemove) return false;
      // Also strip preceding comment line if present
      if (i === lineToRemove - 1 && lines[i]!.trim().startsWith('#')) {
        return false;
      }
      return true;
    });

    return this.writeUserCrontab(serverId, newLines.join('\n'), 'Cron job deleted');
  }

  async editJobByIndex(
    serverId: string,
    index: number,
    job: CronJob,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateCronIndex(index)) return fail('Invalid job index', 400);
    if (!validateCronSchedule(job.schedule)) {
      return fail('Invalid cron schedule', 400);
    }
    if (!validateCronCommand(job.command)) {
      return fail('Invalid or dangerous cron command', 400);
    }

    const lines = await this.readUserCrontab(serverId);
    if (!lines) return fail('No crontab entries found', 400);

    const jobIndices = findJobLineIndices(lines);
    if (index >= jobIndices.length) {
      return fail(
        `Job index ${index} out of range (${jobIndices.length} jobs)`,
        400,
      );
    }

    const lineToReplace = jobIndices[index]!;
    lines[lineToReplace] = `${job.schedule} ${job.command}`;

    const prevIdx = lineToReplace - 1;
    if (job.description) {
      if (prevIdx >= 0 && lines[prevIdx]!.trim().startsWith('#')) {
        lines[prevIdx] = `# ${job.description}`;
      } else {
        lines.splice(lineToReplace, 0, `# ${job.description}`);
      }
    } else if (prevIdx >= 0 && lines[prevIdx]!.trim().startsWith('#')) {
      lines.splice(prevIdx, 1);
    }

    return this.writeUserCrontab(serverId, lines.join('\n'), 'Cron job updated');
  }

  /** Returns the array of crontab lines, or null if crontab is empty/missing. */
  private async readUserCrontab(serverId: string): Promise<string[] | null> {
    const r = await this.exec(serverId, 'crontab -l 2>/dev/null', 5_000);
    if (r.exitCode !== 0 || !r.stdout.trim()) return null;
    return r.stdout.trim().split('\n');
  }

  private async writeUserCrontab(
    serverId: string,
    content: string,
    successMessage: string,
  ): Promise<ServiceResult<{ message: string }>> {
    const escaped = content.replace(/'/g, "'\\''");
    return this.execAction(
      serverId,
      `echo '${escaped}' | crontab -`,
      successMessage,
      10_000,
    );
  }
}

/** Indices into `lines` that hold actual cron jobs (no blanks/comments/vars). */
function findJobLineIndices(lines: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t || t.startsWith('#') || /^\w+=/.test(t)) continue;
    out.push(i);
  }
  return out;
}
