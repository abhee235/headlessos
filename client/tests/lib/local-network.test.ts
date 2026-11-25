// M17.7: which hosts the Mac app explains the Local Network prompt for
import { describe, it, expect } from 'vitest';
import { isLocalNetworkHost } from '../../src/lib/local-network';

describe('isLocalNetworkHost', () => {
  it.each([
    '192.168.1.20', '10.0.0.5', '172.16.4.1', '172.31.255.254', '169.254.10.20',
    'fd12:3456:789a::1', 'fe80::1', '[fe80::1]',
    'raspberrypi.local', 'raspberrypi.local.', 'nas.lan', 'pi.home', 'server.home.arpa', 'box.internal', 'raspberrypi', 'Pi.LOCAL',
  ])('counts %s as local', (host) => {
    expect(isLocalNetworkHost(host)).toBe(true);
  });

  it.each([
    '127.0.0.1', 'localhost', 'app.localhost', '::1',
    '172.15.0.1', '172.32.0.1', '8.8.8.8', '100.64.0.1', '2001:db8::1',
    'example.com', 'my.vps.example.org', '', '999.1.1.1', '1.2.3',
  ])('does not count %s', (host) => {
    expect(isLocalNetworkHost(host)).toBe(false);
  });
});
