// M7.2: Deterministic parser for ip route and /etc/resolv.conf
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { Route, DNSConfig } from '../schemas/serveradmin.js';

/**
 * Parses `ip route show` output into Route[].
 *
 * Format:
 * ```
 * default via 10.0.2.1 dev eth0 proto dhcp metric 100
 * 10.0.2.0/24 dev eth0 proto kernel scope link src 10.0.2.15 metric 100
 * 172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1 linkdown
 * ```
 */
export function parseIpRoute(raw: string): Route[] {
  const lines = raw.trim().split('\n');
  const routes: Route[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const route: Route = {
      destination: '',
      interface: '',
    };

    // Extract destination (first token)
    const tokens = trimmed.split(/\s+/);
    route.destination = tokens[0] || '';

    // Extract named fields
    for (let i = 1; i < tokens.length; i++) {
      switch (tokens[i]) {
        case 'via':
          route.gateway = tokens[i + 1];
          i++;
          break;
        case 'dev':
          route.interface = tokens[i + 1] || '';
          i++;
          break;
        case 'metric':
          route.metric = parseInt(tokens[i + 1] || '', 10) || undefined;
          i++;
          break;
        case 'scope':
          route.scope = tokens[i + 1];
          i++;
          break;
        case 'proto':
          route.protocol = tokens[i + 1];
          i++;
          break;
      }
    }

    if (route.destination && route.interface) {
      routes.push(route);
    }
  }

  return routes;
}

/**
 * Parses /etc/resolv.conf content into DNSConfig.
 *
 * Format:
 * ```
 * # This is a comment
 * nameserver 8.8.8.8
 * nameserver 8.8.4.4
 * search example.com local.lan
 * ```
 */
export function parseResolvConf(raw: string): DNSConfig {
  const lines = raw.trim().split('\n');
  const nameservers: string[] = [];
  const searchDomains: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    if (trimmed.startsWith('nameserver')) {
      const ns = trimmed.replace(/^nameserver\s+/, '').trim();
      if (ns) nameservers.push(ns);
    } else if (trimmed.startsWith('search')) {
      const domains = trimmed.replace(/^search\s+/, '').trim().split(/\s+/);
      searchDomains.push(...domains.filter(Boolean));
    } else if (trimmed.startsWith('domain')) {
      const domain = trimmed.replace(/^domain\s+/, '').trim();
      if (domain) searchDomains.push(domain);
    }
  }

  return { nameservers, searchDomains };
}

export const ipRouteParser: DeterministicParser<Route[]> = {
  name: 'ip-route',
  commands: ['ip route show', 'ip route'],
  parse: parseIpRoute,
};

export const resolvConfParser: DeterministicParser<DNSConfig> = {
  name: 'resolv-conf',
  commands: ['cat /etc/resolv.conf'],
  parse: parseResolvConf,
};
