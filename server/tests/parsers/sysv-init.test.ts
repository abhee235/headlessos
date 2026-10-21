// EX8.9: Tests for SysV init parsers (service --status-all, rc2.d, init.d)
// @see docs/phases/phase-ex8.md

import { describe, it, expect } from 'vitest';
import {
  parseServiceStatusAll,
  parseRcLinks,
  parseInitDList,
  parseShortDescriptions,
  buildSysvServices,
} from '../../src/parsers/deterministic/sysv-init.js';
import { ServiceListSchema } from '../../src/parsers/schemas/services.js';

// Captured from the dev container (Ubuntu 22.04, no systemd)
const STATUS_ALL = ` [ - ]  dbus
 [ ? ]  hwclock.sh
 [ - ]  nginx
 [ - ]  procps
 [ + ]  ssh
`;

const RC2D = `README
S01dbus
S01nginx
S01ssh
K01apache2
`;

const INIT_D = `README
dbus
hwclock.sh
nginx
procps
skeleton
ssh
.depend.boot
`;

const DESCRIPTIONS = `/etc/init.d/dbus:# Short-Description: D-Bus systemwide message bus
/etc/init.d/hwclock.sh:# Short-Description: Save system clock to hardware on shutdown.
/etc/init.d/nginx:# Short-Description: starts the nginx web server
/etc/init.d/procps:# Short-Description: Configure kernel parameters at boottime
/etc/init.d/ssh:# Short-Description:	OpenBSD Secure Shell server
`;

describe('parseServiceStatusAll', () => {
  it('maps + / - / ? to running / stopped / unknown', () => {
    expect(parseServiceStatusAll(STATUS_ALL)).toEqual([
      { name: 'dbus', status: 'stopped' },
      { name: 'hwclock.sh', status: 'unknown' },
      { name: 'nginx', status: 'stopped' },
      { name: 'procps', status: 'stopped' },
      { name: 'ssh', status: 'running' },
    ]);
  });

  it('dedupes when stdout and stderr are concatenated, ignores noise', () => {
    const r = parseServiceStatusAll(`${STATUS_ALL}\n [ ? ]  hwclock.sh\nsh: 1: crontab: not found\n`);
    expect(r).toHaveLength(5);
  });

  it('returns [] for empty or error output', () => {
    expect(parseServiceStatusAll('')).toEqual([]);
    expect(parseServiceStatusAll('sh: 1: service: not found')).toEqual([]);
  });
});

describe('parseRcLinks', () => {
  it('S links start, K-only links do not', () => {
    const m = parseRcLinks(RC2D);
    expect(m.get('ssh')).toBe(true);
    expect(m.get('nginx')).toBe(true);
    expect(m.get('apache2')).toBe(false);
    expect(m.has('README')).toBe(false);
  });

  it('S wins over K for the same script', () => {
    expect(parseRcLinks('K01foo\nS02foo').get('foo')).toBe(true);
  });
});

describe('parseInitDList', () => {
  it('drops README, skeleton and dotfiles', () => {
    expect(parseInitDList(INIT_D)).toEqual(['dbus', 'hwclock.sh', 'nginx', 'procps', 'ssh']);
  });
});

describe('parseShortDescriptions', () => {
  it('reads tab- or space-separated descriptions', () => {
    const m = parseShortDescriptions(DESCRIPTIONS);
    expect(m.get('ssh')).toBe('OpenBSD Secure Shell server');
    expect(m.get('nginx')).toBe('starts the nginx web server');
    expect(m.size).toBe(5);
  });
});

describe('buildSysvServices', () => {
  it('builds a schema-valid, sorted list with startup and null pid', () => {
    const list = ServiceListSchema.parse(buildSysvServices(
      parseServiceStatusAll(STATUS_ALL),
      parseRcLinks(RC2D),
      parseShortDescriptions(DESCRIPTIONS),
    ));
    expect(list[0]).toEqual({
      name: 'ssh', loadState: 'loaded', activeState: 'active', subState: 'running',
      description: 'OpenBSD Secure Shell server', startup: 'automatic', pid: null,
    });
    const hw = list.find((s) => s.name === 'hwclock.sh')!;
    expect(hw.activeState).toBe('inactive');
    expect(hw.subState).toBe('unknown');
    expect(hw.startup).toBe('manual');
    expect(list.find((s) => s.name === 'nginx')!.startup).toBe('automatic');
  });
});
