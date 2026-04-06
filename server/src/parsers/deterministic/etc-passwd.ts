// M7.2: Deterministic parser for /etc/passwd
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { SystemUser } from '../schemas/serveradmin.js';

/**
 * Parses /etc/passwd file content into structured SystemUser[].
 *
 * Format: username:x:uid:gid:description:home:shell
 *
 * Example:
 * ```
 * root:x:0:0:root:/root:/bin/bash
 * daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
 * testuser:x:1000:1000:Test User:/home/testuser:/bin/bash
 * ```
 */
export function parseEtcPasswd(raw: string): SystemUser[] {
  const lines = raw.trim().split('\n');
  const users: SystemUser[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(':');
    if (parts.length < 7) continue;

    const uid = parseInt(parts[2]!, 10);
    const gid = parseInt(parts[3]!, 10);
    if (isNaN(uid) || isNaN(gid)) continue;

    users.push({
      username: parts[0]!,
      uid,
      gid,
      description: parts[4] || undefined,
      home: parts[5]!,
      shell: parts[6]!,
    });
  }

  return users;
}

export const etcPasswdParser: DeterministicParser<SystemUser[]> = {
  name: 'etc-passwd',
  commands: ['cat /etc/passwd'],
  parse: parseEtcPasswd,
};
