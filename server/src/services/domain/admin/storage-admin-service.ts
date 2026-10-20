// M12.4: StorageAdminService — disk usage, mounts, swap
// @see docs/phases/phase-12.md

import { DomainService, ok, type ServiceResult } from '../base.js';
import { parseDu } from '../../../parsers/deterministic/du.js';
import {
  parseFindmnt,
  parseSwapon,
} from '../../../parsers/deterministic/findmnt.js';
import {
  StorageInfoSchema,
  type StorageInfo,
} from '../../../parsers/schemas/serveradmin.js';

export class StorageAdminService extends DomainService {
  async getStorageInfo(
    serverId: string,
  ): Promise<ServiceResult<StorageInfo>> {
    this.requireConnected(serverId);
    const [du, mounts, swap] = await Promise.all([
      this.safeExec(
        serverId,
        'du -sh /var/log /tmp /home /var/lib/docker /var/cache 2>/dev/null',
      ),
      this.safeExec(serverId, 'findmnt --json 2>/dev/null || findmnt -l'),
      this.safeExec(serverId, 'swapon --show 2>/dev/null'),
    ]);

    return ok(
      StorageInfoSchema.parse({
        dirSizes: parseDu(du),
        mounts: parseFindmnt(mounts),
        swap: parseSwapon(swap),
      }),
    );
  }
}
