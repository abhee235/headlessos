// M7.2: Deterministic parser for nginx commands
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { NginxSite, NginxConfigTest, SSLCert } from '../schemas/serveradmin.js';

/**
 * Parses `ls -1 /etc/nginx/sites-available/` and
 * `ls -1 /etc/nginx/sites-enabled/` to determine site status.
 *
 * Input: two sections separated by `---ENABLED---` marker
 * (assembled by the route handler)
 *
 * Format:
 * ```
 * default
 * mysite.conf
 * ---ENABLED---
 * default
 * ```
 */
export function parseNginxSites(raw: string): NginxSite[] {
  const sections = raw.split('---ENABLED---');
  const availableRaw = sections[0] || '';
  const enabledRaw = sections[1] || '';

  const available = availableRaw
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const enabled = new Set(
    enabledRaw
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  );

  return available.map((name) => ({
    name,
    enabled: enabled.has(name),
  }));
}

/**
 * Parses `nginx -t` output.
 *
 * Format:
 * ```
 * nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
 * nginx: configuration file /etc/nginx/nginx.conf test is successful
 * ```
 *
 * Or error:
 * ```
 * nginx: [emerg] unexpected "}" in /etc/nginx/sites-enabled/bad:10
 * nginx: configuration file /etc/nginx/nginx.conf test failed
 * ```
 */
export function parseNginxConfigTest(raw: string): NginxConfigTest {
  const trimmed = raw.trim();
  const success =
    trimmed.includes('test is successful') || trimmed.includes('syntax is ok');
  return {
    success,
    output: trimmed,
  };
}

/**
 * Parses `certbot certificates` output.
 *
 * Format:
 * ```
 * Found the following certs:
 *   Certificate Name: example.com
 *     Serial Number: 123456
 *     Key Type: ECDSA
 *     Domains: example.com www.example.com
 *     Expiry Date: 2025-04-15 10:30:00+00:00 (VALID: 89 days)
 *     Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
 *     Private Key Path: /etc/letsencrypt/live/example.com/privkey.pem
 * ```
 */
export function parseCertbotCertificates(raw: string): SSLCert[] {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.includes('command not found') ||
    trimmed.includes('No certificates found')
  ) {
    return [];
  }

  const certs: SSLCert[] = [];
  const blocks = trimmed.split(/Certificate Name:\s*/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!;
    const lines = block.split('\n');
    const domain = lines[0]?.trim() || 'unknown';

    let expiry = '';
    let daysRemaining = 0;

    for (const line of lines) {
      const expiryMatch = line.match(
        /Expiry Date:\s*(\S+\s+\S+)\s*\((?:VALID|INVALID):\s*(\d+)\s*days?\)/
      );
      if (expiryMatch) {
        expiry = expiryMatch[1]!;
        daysRemaining = parseInt(expiryMatch[2]!, 10);
      }
    }

    certs.push({
      domain,
      expiry,
      issuer: "Let's Encrypt",
      daysRemaining,
    });
  }

  return certs;
}

export const nginxSitesParser: DeterministicParser<NginxSite[]> = {
  name: 'nginx-sites',
  commands: ['ls /etc/nginx/sites-available/', 'ls /etc/nginx/sites-available'],
  parse: parseNginxSites,
};

export const nginxConfigTestParser: DeterministicParser<NginxConfigTest> = {
  name: 'nginx-config-test',
  commands: ['nginx -t'],
  parse: parseNginxConfigTest,
};

export const certbotParser: DeterministicParser<SSLCert[]> = {
  name: 'certbot-certificates',
  commands: ['certbot certificates'],
  parse: parseCertbotCertificates,
};
