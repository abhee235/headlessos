// M4.6: Tests for systemctl list-units parser
// @see docs/phases/phase-4.md

import { describe, it, expect } from 'vitest';
import { parseSystemctlListUnits } from '../../src/parsers/deterministic/systemctl.js';
import { ServiceListSchema } from '../../src/parsers/schemas/services.js';

// ── Fixtures ──

const TYPICAL_OUTPUT = `  cron.service                loaded active   running Regular background program processing daemon
  dbus.service                loaded active   running D-Bus System Message Bus
  getty@tty1.service          loaded active   running Getty on tty1
  networkd-dispatcher.service loaded active   running Dispatcher daemon for systemd-networkd
  nginx.service               loaded active   running A high performance web server and reverse proxy server
  ssh.service                 loaded active   running OpenBSD Secure Shell server
  systemd-journald.service    loaded active   running Journal Service
  systemd-logind.service      loaded active   running User Login Management
  systemd-resolved.service    loaded active   running Network Name Resolution
  ufw.service                 loaded active   exited  Uncomplicated firewall`;

const WITH_FAILED_SERVICES = `  cron.service                loaded active   running Regular background program processing daemon
● nginx.service               loaded failed   failed  A high performance web server and reverse proxy server
  ssh.service                 loaded active   running OpenBSD Secure Shell server
  ufw.service                 loaded inactive dead    Uncomplicated firewall`;

const WITH_MIXED_STATES = `  accounts-daemon.service     loaded inactive dead    Accounts Service
  apparmor.service            loaded active   exited  Load AppArmor profiles
  cron.service                loaded active   running Regular background program processing daemon
● mysql.service               loaded failed   failed  MySQL Community Server
  nginx.service               loaded active   running A high performance web server
  docker.service              loaded active   running Docker Application Container Engine
  systemd-timesyncd.service   loaded active   running Network Time Synchronization
  snapd.service               not-found inactive dead  Snap Daemon
○ apport.service              masked  inactive dead    LSB: Automatic crash report generation`;

const WITH_NON_SERVICE_UNITS = `  cron.service             loaded active   running Regular background program processing daemon
  cron.timer               loaded active   waiting Trigger cron regularly
  ssh.service              loaded active   running OpenBSD Secure Shell server
  ssh.socket               loaded inactive dead    OpenBSD SSH server socket (per-connection)
  nginx.service            loaded active   running A high performance web server`;

const EMPTY_OUTPUT = '';

const SINGLE_SERVICE = `  ssh.service loaded active running OpenBSD Secure Shell server`;

const WITH_HEADER_LINE = `UNIT                     LOAD   ACTIVE SUB     DESCRIPTION
  ssh.service              loaded active running OpenBSD Secure Shell server
  cron.service             loaded active running Regular background program processing daemon`;

// ── Tests ──

describe('parseSystemctlListUnits', () => {
  it('parses typical systemctl output', () => {
    const result = parseSystemctlListUnits(TYPICAL_OUTPUT);
    const validated = ServiceListSchema.parse(result);

    expect(validated.length).toBe(10);
    expect(validated[0].activeState).toBe('active'); // sorted active first

    const cron = validated.find(s => s.name === 'cron');
    expect(cron).toBeDefined();
    expect(cron!.loadState).toBe('loaded');
    expect(cron!.activeState).toBe('active');
    expect(cron!.subState).toBe('running');
    expect(cron!.description).toBe('Regular background program processing daemon');
  });

  it('handles failed services with ● prefix', () => {
    const result = parseSystemctlListUnits(WITH_FAILED_SERVICES);
    const validated = ServiceListSchema.parse(result);

    expect(validated.length).toBe(4);

    // Active services should come first, then failed
    expect(validated[0].activeState).toBe('active');

    const nginx = validated.find(s => s.name === 'nginx');
    expect(nginx).toBeDefined();
    expect(nginx!.activeState).toBe('failed');
    expect(nginx!.subState).toBe('failed');
  });

  it('sorts: active first, then failed, then inactive, then alphabetical', () => {
    const result = parseSystemctlListUnits(WITH_MIXED_STATES);
    const validated = ServiceListSchema.parse(result);

    // All active services should be first
    const activeServices = validated.filter(s => s.activeState === 'active');
    const failedServices = validated.filter(s => s.activeState === 'failed');
    const inactiveServices = validated.filter(s => s.activeState === 'inactive');

    // Check ordering: actives before failed, failed before inactive
    if (activeServices.length > 0 && failedServices.length > 0) {
      const lastActiveIdx = validated.findIndex(s => s === activeServices[activeServices.length - 1]);
      const firstFailedIdx = validated.findIndex(s => s === failedServices[0]);
      expect(lastActiveIdx).toBeLessThan(firstFailedIdx);
    }

    if (failedServices.length > 0 && inactiveServices.length > 0) {
      const lastFailedIdx = validated.findIndex(s => s === failedServices[failedServices.length - 1]);
      const firstInactiveIdx = validated.findIndex(s => s === inactiveServices[0]);
      expect(lastFailedIdx).toBeLessThan(firstInactiveIdx);
    }
  });

  it('handles not-found and masked load states', () => {
    const result = parseSystemctlListUnits(WITH_MIXED_STATES);
    const validated = ServiceListSchema.parse(result);

    const snapd = validated.find(s => s.name === 'snapd');
    expect(snapd).toBeDefined();
    expect(snapd!.loadState).toBe('not-found');

    const apport = validated.find(s => s.name === 'apport');
    expect(apport).toBeDefined();
    expect(apport!.loadState).toBe('masked');
  });

  it('filters out non-.service units', () => {
    const result = parseSystemctlListUnits(WITH_NON_SERVICE_UNITS);
    const validated = ServiceListSchema.parse(result);

    // Only .service units should remain
    expect(validated.length).toBe(3); // cron, ssh, nginx
    expect(validated.every(s => !s.name.includes('.timer') && !s.name.includes('.socket'))).toBe(true);
  });

  it('strips .service suffix from names', () => {
    const result = parseSystemctlListUnits(TYPICAL_OUTPUT);
    expect(result.every(s => !s.name.endsWith('.service'))).toBe(true);
  });

  it('handles empty output', () => {
    const result = parseSystemctlListUnits(EMPTY_OUTPUT);
    const validated = ServiceListSchema.parse(result);
    expect(validated).toEqual([]);
  });

  it('handles single service line', () => {
    const result = parseSystemctlListUnits(SINGLE_SERVICE);
    const validated = ServiceListSchema.parse(result);

    expect(validated.length).toBe(1);
    expect(validated[0].name).toBe('ssh');
    expect(validated[0].activeState).toBe('active');
    expect(validated[0].description).toBe('OpenBSD Secure Shell server');
  });

  it('skips header line if present', () => {
    const result = parseSystemctlListUnits(WITH_HEADER_LINE);
    const validated = ServiceListSchema.parse(result);

    expect(validated.length).toBe(2);
    expect(validated[0].name).toBe('cron');
    expect(validated[1].name).toBe('ssh');
  });

  it('defaults invalid load/active states to safe values', () => {
    const weirdOutput = `  test.service bogus_load bogus_active running Test Service`;
    const result = parseSystemctlListUnits(weirdOutput);
    const validated = ServiceListSchema.parse(result);

    expect(validated.length).toBe(1);
    expect(validated[0].loadState).toBe('loaded'); // defaulted
    expect(validated[0].activeState).toBe('inactive'); // defaulted
  });

  it('Zod schema rejects invalid data', () => {
    expect(() => ServiceListSchema.parse([{ name: '', loadState: 'wrong' }])).toThrow();
    expect(() => ServiceListSchema.parse('not an array')).toThrow();
  });
});
