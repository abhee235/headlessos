// M8.2: Deterministic parser for ufw app list output
// @see docs/phases/phase-8.md

import type { UfwAppList } from '../schemas/serveradmin.js';

/**
 * Parse `sudo ufw app list` output.
 *
 * Example output:
 * ```
 * Available applications:
 *   Apache
 *   Apache Full
 *   Apache Secure
 *   Nginx Full
 *   Nginx HTTP
 *   Nginx HTTPS
 *   OpenSSH
 * ```
 */
export function parseUfwAppList(raw: string): UfwAppList {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('command not found')) {
    return { apps: [] };
  }

  const apps: UfwAppList['apps'] = [];
  const lines = trimmed.split('\n');

  for (const line of lines) {
    // Skip the header line "Available applications:"
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('Available applications')) continue;
    apps.push({ name: trimmedLine });
  }

  return { apps };
}
