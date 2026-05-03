// M12.4: PackagesAdminService — apt package management
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import {
  shellEscape,
  validatePackageName,
  validateSearchQuery,
} from '../../../security/validators.js';
import {
  parseAptUpgradable,
  parseDpkgCount,
  parseAptSearchResults,
} from '../../../parsers/deterministic/apt.js';
import {
  PackageInfoSchema,
  type PackageInfo,
} from '../../../parsers/schemas/serveradmin.js';

interface ActionOutput {
  output: string;
}

export class PackagesAdminService extends DomainService {
  async getPackageInfo(serverId: string): Promise<ServiceResult<PackageInfo>> {
    this.requireConnected(serverId);

    const checkResult = await this.exec(serverId, 'which apt', 5_000);
    if (checkResult.exitCode !== 0) {
      return ok({
        available: false,
        totalInstalled: 0,
        upgradable: [],
        message: 'apt package manager not found (non-Debian system?)',
      });
    }

    const [upgradable, count] = await Promise.all([
      this.safeExec(serverId, 'apt list --upgradable 2>/dev/null'),
      this.safeExec(serverId, 'dpkg -l 2>/dev/null | wc -l'),
    ]);

    return ok(
      PackageInfoSchema.parse({
        available: true,
        totalInstalled: parseDpkgCount(count),
        upgradable: parseAptUpgradable(upgradable),
      }),
    );
  }

  async aptUpdate(serverId: string): Promise<ServiceResult<ActionOutput>> {
    return this.runAptCommand(serverId, 'sudo apt update', 120_000);
  }

  async upgradeAll(serverId: string): Promise<ServiceResult<ActionOutput>> {
    return this.runAptCommand(serverId, 'sudo apt upgrade -y', 300_000);
  }

  async install(
    serverId: string,
    pkg: string,
  ): Promise<ServiceResult<ActionOutput>> {
    this.requireConnected(serverId);
    if (!validatePackageName(pkg)) return fail('Invalid package name', 400);
    return this.runAptCommand(
      serverId,
      `sudo apt install -y ${shellEscape(pkg)}`,
      300_000,
    );
  }

  async remove(
    serverId: string,
    pkg: string,
  ): Promise<ServiceResult<ActionOutput>> {
    this.requireConnected(serverId);
    if (!validatePackageName(pkg)) return fail('Invalid package name', 400);
    return this.runAptCommand(
      serverId,
      `sudo apt remove -y ${shellEscape(pkg)}`,
      120_000,
    );
  }

  async upgradeOne(
    serverId: string,
    pkg: string,
  ): Promise<ServiceResult<ActionOutput>> {
    this.requireConnected(serverId);
    if (!validatePackageName(pkg)) return fail('Invalid package name', 400);
    return this.runAptCommand(
      serverId,
      `sudo apt install -y ${shellEscape(pkg)}`,
      300_000,
    );
  }

  async search(
    serverId: string,
    query: string,
  ): Promise<ServiceResult<ReturnType<typeof parseAptSearchResults>>> {
    this.requireConnected(serverId);
    if (!query || !validateSearchQuery(query)) {
      return fail('Invalid search query', 400);
    }
    const r = await this.exec(
      serverId,
      `apt search ${shellEscape(query)} 2>/dev/null | head -100`,
      30_000,
    );
    return ok(parseAptSearchResults(r.stdout));
  }

  /** apt action helper — returns combined output + propagates failure status. */
  private async runAptCommand(
    serverId: string,
    cmd: string,
    timeout: number,
  ): Promise<ServiceResult<ActionOutput>> {
    this.requireConnected(serverId);
    const r = await this.exec(serverId, cmd, timeout);
    const output = r.stdout + r.stderr;
    if (r.exitCode !== 0) {
      return {
        ok: false,
        error: r.stderr.trim() || `apt command failed (exit ${r.exitCode})`,
        statusCode: 500,
        data: { output },
      };
    }
    return ok({ output });
  }
}
