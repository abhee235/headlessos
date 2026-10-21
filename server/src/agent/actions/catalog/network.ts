// EX9.1: read actions — network
// @see docs/phases/phase-ex9.md §1

import { z } from 'zod';
import { readAction } from './define.js';
import { hostName, httpUrl } from '../params.js';

export const NETWORK_ACTIONS = [
  readAction({
    id: 'network_interfaces',
    title: 'Network interfaces',
    description: 'Interfaces with state and IP addresses, one line each (ip -brief addr).',
    category: 'network',
    keywords: ['ip', 'address', 'interface', 'nic', 'eth0'],
    run: { kind: 'exec', build: () => ['ip', '-brief', 'addr'] },
  }),
  readAction({
    id: 'network_routes',
    title: 'Routes',
    description: 'Routing table including the default gateway (ip route).',
    category: 'network',
    keywords: ['route', 'gateway', 'default'],
    run: { kind: 'exec', build: () => ['ip', 'route', 'show'] },
  }),
  readAction({
    id: 'listening_ports',
    title: 'Listening ports',
    description: 'TCP and UDP ports the server listens on, with the owning process (ss -tulnp).',
    category: 'network',
    keywords: ['port', 'listen', 'open', 'socket', 'bind'],
    run: { kind: 'exec', build: () => ['ss', '-tulnp'] },
  }),
  readAction({
    id: 'network_connections',
    title: 'Connections',
    description: 'All TCP and UDP sockets with peers and processes (ss -tunap).',
    category: 'network',
    keywords: ['connection', 'established', 'socket', 'peer'],
    run: { kind: 'exec', build: () => ['ss', '-tunap'] },
  }),
  readAction({
    id: 'dns_config',
    title: 'DNS resolvers',
    description: 'Configured DNS name servers and search domains (/etc/resolv.conf).',
    category: 'network',
    keywords: ['dns', 'resolver', 'nameserver'],
    run: { kind: 'exec', build: () => ['cat', '/etc/resolv.conf'] },
  }),
  readAction({
    id: 'dns_lookup',
    title: 'DNS lookup',
    description: 'Resolve a host name from the server, as the server sees it (getent ahosts).',
    category: 'network',
    keywords: ['dns', 'resolve', 'lookup', 'domain'],
    params: z.object({ host: hostName() }).strict(),
    okExitCodes: [0, 2],
    run: { kind: 'exec', build: (p) => ['getent', 'ahosts', p.host] },
  }),
  readAction({
    id: 'ping_host',
    title: 'Ping',
    description: 'Ping a host from the server a few times to check reachability and latency.',
    category: 'network',
    keywords: ['ping', 'reachable', 'latency', 'network'],
    params: z.object({
      host: hostName(),
      count: z.number().int().min(1).max(5).default(3).describe('packets, 1–5'),
    }).strict(),
    okExitCodes: [0, 1],
    timeoutMs: 20_000,
    run: { kind: 'exec', build: (p) => ['ping', '-c', String(p.count), '-W', '2', p.host] },
  }),
  readAction({
    id: 'http_check',
    title: 'HTTP check',
    description: 'Request a URL from the server and report only the status code and time (no body).',
    category: 'network',
    keywords: ['http', 'website', 'url', 'curl', 'status', 'health', 'up'],
    params: z.object({ url: httpUrl() }).strict(),
    timeoutMs: 15_000,
    run: {
      kind: 'exec',
      build: (p) => ['curl', '-sS', '-o', '/dev/null', '-w', 'status=%{http_code} time=%{time_total}s\\n', '--max-time', '10', '--', p.url],
    },
  }),
  readAction({
    id: 'firewall_status',
    title: 'Firewall status',
    description: 'UFW firewall state, defaults and rules (needs passwordless sudo).',
    category: 'network',
    keywords: ['firewall', 'ufw', 'rules', 'blocked', 'allow'],
    run: { kind: 'exec', sudo: true, build: () => ['ufw', 'status', 'verbose'] },
  }),
];
