// M7.2: Deterministic parser for sshd_config
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { SSHConfig } from '../schemas/serveradmin.js';

/**
 * Parses key directives from /etc/ssh/sshd_config.
 *
 * Only extracts the security-relevant directives.
 * Handles "Include" directives are NOT followed — this parser only
 * reads the main config file content provided.
 *
 * Example:
 * ```
 * # sshd_config
 * Port 22
 * PermitRootLogin prohibit-password
 * PasswordAuthentication no
 * PubkeyAuthentication yes
 * MaxAuthTries 3
 * X11Forwarding no
 * ```
 */
export function parseSshdConfig(raw: string): SSHConfig {
  const config: SSHConfig = {
    port: '22',
    permitRootLogin: 'prohibit-password',
    passwordAuthentication: 'yes',
    pubkeyAuthentication: 'yes',
    maxAuthTries: '6',
    x11Forwarding: 'no',
  };

  const lines = raw.trim().split('\n');

  const directiveMap: Record<string, keyof SSHConfig> = {
    port: 'port',
    permitrootlogin: 'permitRootLogin',
    passwordauthentication: 'passwordAuthentication',
    pubkeyauthentication: 'pubkeyAuthentication',
    maxauthtries: 'maxAuthTries',
    x11forwarding: 'x11Forwarding',
  };

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match: Directive value
    const match = trimmed.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;

    const directive = match[1]!.toLowerCase();
    const value = match[2]!.trim();

    const key = directiveMap[directive];
    if (key) {
      config[key] = value;
    }
  }

  return config;
}

export const sshdConfigParser: DeterministicParser<SSHConfig> = {
  name: 'sshd-config',
  commands: ['cat /etc/ssh/sshd_config'],
  parse: parseSshdConfig,
};
