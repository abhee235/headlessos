// M15.14, M15.16: what a failed connection means, in words the owner can act on
// @see docs/phases/phase-15.md
//
// The raw error goes to the log. The window gets a plain title and hint, the exact error to
// search for, and the section of the Troubleshooting page that covers it.

import type { ConnectFailure, ServerConfig } from 'headlessos-shared';
import { isAuthFailure, sanitizeErrorMessage } from '../security/validators.js';

type Target = Pick<ServerConfig, 'host' | 'port' | 'authMethod' | 'password'>;

/** M15.16: the key was saved once, but can't be decrypted any more */
export const KEY_LOST: ConnectFailure = {
  title: "This server's saved key can't be read",
  hint: 'Go back, remove this server and add it again with the key.',
  help: 'ssh-key-problems',
};

/** M15.16: a key server with no key left to offer */
export function isKeyLost(server: Pick<ServerConfig, 'authMethod' | 'privateKeyPath'>): boolean {
  return server.authMethod === 'privateKey' && !server.privateKeyPath;
}

export function describeConnectFailure(
  error: string,
  server: Target,
  platform: string = process.platform,
): ConnectFailure {
  const { host, port } = server;
  const address = `${host}:${port}`;
  // The owner typed this address and the screen shows it, so it isn't worth hiding here
  const detail = sanitizeErrorMessage(error).replaceAll('[ip]', host);

  if (/no passphrase given/i.test(error)) {
    return { title: 'This key needs its passphrase', hint: 'Type it above and try again.', detail, help: 'ssh-key-problems' };
  }
  if (/bad passphrase/i.test(error)) {
    return { title: 'That passphrase is wrong', hint: 'Type it again and try once more.', detail, help: 'ssh-key-problems' };
  }
  if (/cannot parse privateKey/i.test(error)) {
    return { title: "This SSH key can't be read", hint: 'Use the private key, not the .pub file.', detail, help: 'ssh-key-problems' };
  }
  if (isAuthFailure(error)) {
    if (server.authMethod === 'password' && !server.password) {
      return { title: 'No password was sent', hint: 'Type the password and try again.', detail, help: 'login-rejected' };
    }
    return { title: 'The server refused this login', hint: 'Check the username and password, or the key.', detail, help: 'login-rejected' };
  }
  if (error.includes('ECONNREFUSED')) {
    return { title: `Nothing is answering at ${address}`, hint: 'The server may be off, or SSH may use another port.', detail, help: 'connection-refused' };
  }
  if (/timed out|ETIMEDOUT/i.test(error)) {
    return { title: `${address} didn't answer`, hint: 'The server may be off, or a firewall may be blocking this port.', detail, help: 'connection-timed-out' };
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(error)) {
    return { title: `Can't find ${host}`, hint: 'Check the spelling, or use the IP address instead.', detail, help: 'host-not-found' };
  }
  if (/EHOSTUNREACH|ENETUNREACH/.test(error)) {
    // M15.8: a host that is really offline gives the same error, hence "may"
    return platform === 'darwin'
      ? {
          title: `Can't reach ${host}`,
          hint: 'macOS may be keeping HeadlessOS off your local network. Allow it in System Settings → Privacy & Security → Local Network.',
          detail,
          help: 'local-network-access-on-macos',
        }
      : { title: `Can't reach ${host}`, hint: 'Check that this computer can reach the server’s network.', detail, help: 'no-route-to-host' };
  }
  return { title: "Couldn't connect to this server", detail, help: 'a-server-wont-connect' };
}
