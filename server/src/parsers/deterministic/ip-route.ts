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

export interface IpLinkEntry {
  name: string;
  state: 'UP' | 'DOWN' | 'UNKNOWN';
  mac?: string;
  mtu?: number;
  type?: string;
}

/**
 * Parses `ip -o link show` output into IpLinkEntry[].
 *
 * Format (one line per interface):
 * ```
 * 1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000\    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
 * 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000\    link/ether 52:54:00:xx:xx:xx brd ff:ff:ff:ff:ff:ff
 * ```
 */
export function parseIpLinkShow(raw: string): IpLinkEntry[] {
  if (!raw.trim()) return [];

  const entries: IpLinkEntry[] = [];
  // Each interface is on one logical line (may contain \\)
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    const full = line.replace(/\\\s*/g, ' ').trim();
    if (!full) continue;

    // Match: index: name: <FLAGS> ...
    const nameMatch = full.match(/^\d+:\s+(\S+?):\s+<([^>]*)>/);
    if (!nameMatch) continue;

    const name = nameMatch[1]!.replace(/@.*$/, '');
    const flags = nameMatch[2] || '';

    // Determine state from `state XXX` token, or infer from flags
    let state: 'UP' | 'DOWN' | 'UNKNOWN' = 'UNKNOWN';
    const stateMatch = full.match(/\bstate\s+(UP|DOWN|UNKNOWN)\b/i);
    if (stateMatch) {
      state = stateMatch[1]!.toUpperCase() as 'UP' | 'DOWN' | 'UNKNOWN';
    } else if (flags.includes('UP')) {
      state = 'UP';
    } else {
      state = 'DOWN';
    }

    // Extract MTU
    let mtu: number | undefined;
    const mtuMatch = full.match(/\bmtu\s+(\d+)\b/);
    if (mtuMatch) mtu = parseInt(mtuMatch[1]!, 10);

    // Extract MAC from link/ether
    let mac: string | undefined;
    const macMatch = full.match(/link\/ether\s+([0-9a-f:]{17})/);
    if (macMatch) mac = macMatch[1];

    // Extract link type
    let type: string | undefined;
    const typeMatch = full.match(/link\/(\S+)/);
    if (typeMatch) type = typeMatch[1];

    entries.push({ name, state, mac, mtu, type });
  }

  return entries;
}
