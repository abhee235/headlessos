// M15.14, M15.16: a failed connection reads as something the owner can act on
import { describe, it, expect } from 'vitest';
import { describeConnectFailure, isKeyLost } from '../../src/ssh/connect-failure.js';

const server = { host: '192.168.1.20', port: 22, authMethod: 'password' as const, password: 'saved' };
const named = { ...server, host: 'pi.local' };

describe('describeConnectFailure', () => {
  it('turns a refused connection into a sentence, and keeps the error to search for', () => {
    expect(describeConnectFailure('connect ECONNREFUSED 192.168.1.20:22', server)).toEqual({
      title: 'Nothing is answering at 192.168.1.20:22',
      hint: 'The server may be off, or SSH may use another port.',
      detail: 'connect ECONNREFUSED 192.168.1.20:22',
      help: 'connection-refused',
    });
  });

  it('shows the address the owner typed, not the one a name resolved to', () => {
    expect(describeConnectFailure('connect ECONNREFUSED 10.0.0.9:22', named).detail)
      .toBe('connect ECONNREFUSED pi.local:22');
  });

  it.each([
    ['Timed out while waiting for handshake', "192.168.1.20:22 didn't answer", 'connection-timed-out'],
    ['connect ETIMEDOUT 192.168.1.20:22', "192.168.1.20:22 didn't answer", 'connection-timed-out'],
    ['getaddrinfo ENOTFOUND pi.local', "Can't find 192.168.1.20", 'host-not-found'],
    ['getaddrinfo EAI_AGAIN pi.local', "Can't find 192.168.1.20", 'host-not-found'],
    ['All configured authentication methods failed', 'The server refused this login', 'login-rejected'],
    ['Cannot parse privateKey: Unsupported key format', "This SSH key can't be read", 'ssh-key-problems'],
    ['Cannot parse privateKey: Encrypted OpenSSH private key detected, but no passphrase given', 'This key needs its passphrase', 'ssh-key-problems'],
    ['Cannot parse privateKey: Bad passphrase?', 'That passphrase is wrong', 'ssh-key-problems'],
    ['Connection lost before handshake', "Couldn't connect to this server", 'a-server-wont-connect'],
  ])('%s', (error, title, help) => {
    expect(describeConnectFailure(error, server, 'linux')).toMatchObject({ title, help });
  });

  describe('M15.8: a blocked local network', () => {
    const blocked = 'connect EHOSTUNREACH 192.168.1.20:22';

    it('says where the permission is on macOS', () => {
      const failure = describeConnectFailure(blocked, server, 'darwin');
      expect(failure.hint).toContain('Privacy & Security → Local Network');
      expect(failure.help).toBe('local-network-access-on-macos');
    });

    it('does not mention macOS elsewhere', () => {
      for (const platform of ['win32', 'linux']) {
        const failure = describeConnectFailure(blocked, server, platform);
        expect(failure.hint).not.toContain('macOS');
        expect(failure.help).toBe('no-route-to-host');
      }
    });

    it('covers a whole network being unreachable', () => {
      expect(describeConnectFailure('connect ENETUNREACH 192.168.1.20:22', server, 'darwin').help)
        .toBe('local-network-access-on-macos');
    });
  });

  it('M15.16: says so when a password login had no password', () => {
    const failure = describeConnectFailure('All configured authentication methods failed', { ...server, password: undefined });
    expect(failure.title).toBe('No password was sent');
    expect(failure.help).toBe('login-rejected');
  });

  it('M15.16: does not blame a missing password on a key server', () => {
    const failure = describeConnectFailure('All configured authentication methods failed', { ...server, authMethod: 'privateKey', password: undefined });
    expect(failure.title).toBe('The server refused this login');
  });

  it('keeps paths out of the detail', () => {
    const failure = describeConnectFailure('Something failed reading /home/owner/.ssh/id_rsa', server);
    expect(failure.detail).not.toContain('owner');
  });
});

describe('isKeyLost', () => {
  it('is a key server with no key', () => {
    expect(isKeyLost({ authMethod: 'privateKey' })).toBe(true);
    expect(isKeyLost({ authMethod: 'privateKey', privateKeyPath: 'key text' })).toBe(false);
    expect(isKeyLost({ authMethod: 'password' })).toBe(false);
  });
});
