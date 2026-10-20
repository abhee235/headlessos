// Container file listing parser — parses `ls -lA` output from `docker exec`.
// @see docs/phases/phase-ex7.md (Container Target mode)
//
// Used by the container-files routes to turn `docker exec <id> ls -lA <path>`
// output into FileEntry[]. Must tolerate both GNU coreutils (Debian/Ubuntu) and
// busybox (Alpine) `ls -l`, which share the classic long format:
//
//   -rw-r--r--    1 root     root          1234 Jan  1 12:00 settings.yml
//   drwxr-xr-x    2 root     root          4096 Jan  1 12:00 subdir
//   lrwxrwxrwx    1 root     root            10 Jan  1 12:00 link -> /target

import type { FileEntry } from 'headlessos-shared';

function typeFromPerms(perms: string): FileEntry['type'] {
  switch (perms[0]) {
    case 'd': return 'directory';
    case 'l': return 'symlink';
    case '-': return 'file';
    default: return 'other';
  }
}

/**
 * Parse `ls -lA` long-format output into FileEntry[].
 * Lines that are a `total N` header or malformed are skipped.
 */
export function parseContainerLs(raw: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^total\s+\d+/.test(trimmed)) continue;

    // perms links owner group size month day time/year name...
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 9) continue;
    if (!/^[dlbcps\-][rwxstST\-]{9}/.test(tokens[0]!)) continue; // must start with a perms string

    const perms = tokens[0]!;
    const type = typeFromPerms(perms);
    const owner = tokens[2] ?? '';
    const group = tokens[3] ?? '';
    const size = Number.parseInt(tokens[4] ?? '0', 10) || 0;
    const modified = `${tokens[5] ?? ''} ${tokens[6] ?? ''} ${tokens[7] ?? ''}`.trim();

    let name = tokens.slice(8).join(' ');
    let symlinkTarget: string | undefined;
    if (type === 'symlink' && name.includes(' -> ')) {
      const [left, right] = name.split(' -> ');
      name = left!;
      symlinkTarget = right;
    }

    // Skip the . and .. entries if an ls variant still emits them.
    if (name === '.' || name === '..') continue;

    const entry: FileEntry = { name, type, permissions: perms, owner, group, size, modified };
    if (symlinkTarget) entry.symlinkTarget = symlinkTarget;
    entries.push(entry);
  }

  return entries;
}
