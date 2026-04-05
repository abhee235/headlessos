// M7.2: Deterministic parser for ss (socket statistics) output
// @see docs/phases/phase-7.md

import type { DeterministicParser } from '../pipeline.js';
import type { ListeningPort, NetworkConnection } from '../schemas/serveradmin.js';

/**
 * Parses `ss -tlnp` output into structured ListeningPort array.
 *
 * Expected format:
 * ```
 * State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port  Process
 * LISTEN  0       128      0.0.0.0:22           0.0.0.0:*          users:(("sshd",pid=1234,fd=3))
 * LISTEN  0       511      0.0.0.0:80           0.0.0.0:*          users:(("nginx",pid=5678,fd=6))
 * ```
 */
export function parseSsListening(raw: string): ListeningPort[] {
  const lines = raw.trim().split('\n');
  const results: ListeningPort[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('State') || line.startsWith('Netid')) continue;

    // Match LISTEN lines
    // State Recv-Q Send-Q Local_Address:Port Peer_Address:Port Process
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    // Find the local address:port column
    let localAddr = '';
    let proto: 'tcp' | 'udp' = 'tcp';

    // state is LISTEN, UNCONN, etc. or netid is tcp/udp
    if (parts[0] === 'LISTEN' || parts[0] === 'UNCONN') {
      localAddr = parts[3] || '';
    } else if (parts[0] === 'tcp' || parts[0] === 'udp') {
      proto = parts[0] as 'tcp' | 'udp';
      localAddr = parts[4] || '';
    } else {
      continue;
    }

    if (parts[0] === 'UNCONN') proto = 'udp';

    // Parse address:port
    const lastColon = localAddr.lastIndexOf(':');
    if (lastColon === -1) continue;

    const address = localAddr.substring(0, lastColon);
    const port = parseInt(localAddr.substring(lastColon + 1), 10);
    if (isNaN(port)) continue;

    // Parse process info from users:(("name",pid=123,fd=4))
    let process = '';
    let pid: number | undefined;
    const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (processMatch) {
      process = processMatch[1] || '';
      pid = parseInt(processMatch[2] || '0', 10);
    }

    results.push({
      protocol: proto,
      localAddress: address || '0.0.0.0',
      localPort: port,
      process,
      pid,
    });
  }

  return results;
}

/**
 * Parses `ss -tunap` output into structured NetworkConnection array.
 *
 * Expected format:
 * ```
 * Netid State   Recv-Q Send-Q  Local Address:Port  Peer Address:Port  Process
 * tcp   ESTAB   0      0       10.0.0.5:22         192.168.1.100:54321 users:(("sshd",pid=1234,fd=3))
 * ```
 */
export function parseSsConnections(raw: string): NetworkConnection[] {
  const lines = raw.trim().split('\n');
  const results: NetworkConnection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith('Netid') || line.startsWith('State')) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;

    let proto: 'tcp' | 'udp' = 'tcp';
    let state = '';
    let localAddr = '';
    let peerAddr = '';

    // Format: Netid State Recv-Q Send-Q Local Peer Process
    if (parts[0] === 'tcp' || parts[0] === 'udp') {
      proto = parts[0] as 'tcp' | 'udp';
      state = parts[1] || '';
      localAddr = parts[4] || '';
      peerAddr = parts[5] || '';
    } else if (parts[0] === 'ESTAB' || parts[0] === 'TIME-WAIT' || parts[0] === 'CLOSE-WAIT' || parts[0] === 'SYN-SENT' || parts[0] === 'SYN-RECV') {
      state = parts[0];
      localAddr = parts[3] || '';
      peerAddr = parts[4] || '';
    } else {
      continue;
    }

    // Skip listening or unconnected sockets
    if (state === 'LISTEN' || state === 'UNCONN') continue;
    // Skip wildcard peers
    if (peerAddr === '0.0.0.0:*' || peerAddr === '*:*' || peerAddr === '[::]:*') continue;

    const localColon = localAddr.lastIndexOf(':');
    const peerColon = peerAddr.lastIndexOf(':');
    if (localColon === -1 || peerColon === -1) continue;

    const localPort = parseInt(localAddr.substring(localColon + 1), 10);
    const remotePort = parseInt(peerAddr.substring(peerColon + 1), 10);
    if (isNaN(localPort) || isNaN(remotePort)) continue;

    let process = '';
    let pid: number | undefined;
    const processMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (processMatch) {
      process = processMatch[1] || '';
      pid = parseInt(processMatch[2] || '0', 10);
    }

    results.push({
      protocol: proto,
      localAddress: localAddr.substring(0, localColon) || '0.0.0.0',
      localPort,
      remoteAddress: peerAddr.substring(0, peerColon) || '0.0.0.0',
      remotePort,
      state,
      process,
      pid,
    });
  }

  return results;
}

export const ssListeningParser: DeterministicParser<ListeningPort[]> = {
  name: 'ss-listening',
  commands: ['ss -tlnp', 'ss -tulnp'],
  parse: parseSsListening,
};

export const ssConnectionsParser: DeterministicParser<NetworkConnection[]> = {
  name: 'ss-connections',
  commands: ['ss -tunap'],
  parse: parseSsConnections,
};
