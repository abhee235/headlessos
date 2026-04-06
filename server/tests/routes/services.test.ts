// M3.6: Services Routes Tests — unit tests for service parsing and validation
// @see docs/phases/phase-3.md

import { describe, it, expect } from 'vitest';

// Test the isValidServiceName validation logic (from services routes)
function isValidServiceName(name: string): boolean {
  return /^[a-zA-Z0-9_\-@.]+$/.test(name) && name.length <= 256;
}

// Test the parseServiceList function
interface ServiceInfo {
  name: string;
  loadState: 'loaded' | 'not-found' | 'masked';
  activeState: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  subState: string;
  description: string;
}

function parseServiceList(stdout: string): ServiceInfo[] {
  const lines = stdout.trim().split('\n').filter(Boolean);
  const services: ServiceInfo[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cleaned = trimmed.replace(/^[●○]\s*/, '');

    const parts = cleaned.split(/\s+/);
    if (parts.length < 4) continue;

    const unitName = parts[0];
    const loadState = parts[1];
    const activeState = parts[2];
    const subState = parts[3];
    const description = parts.slice(4).join(' ');

    if (!unitName.endsWith('.service')) continue;

    const name = unitName.replace(/\.service$/, '');

    services.push({
      name,
      loadState: (['loaded', 'not-found', 'masked'].includes(loadState)
        ? loadState
        : 'loaded') as ServiceInfo['loadState'],
      activeState: (['active', 'inactive', 'failed', 'activating', 'deactivating'].includes(activeState)
        ? activeState
        : 'inactive') as ServiceInfo['activeState'],
      subState,
      description,
    });
  }

  services.sort((a, b) => {
    if (a.activeState === 'active' && b.activeState !== 'active') return -1;
    if (a.activeState !== 'active' && b.activeState === 'active') return 1;
    if (a.activeState === 'failed' && b.activeState !== 'failed') return -1;
    if (a.activeState !== 'failed' && b.activeState === 'failed') return 1;
    return a.name.localeCompare(b.name);
  });

  return services;
}

describe('isValidServiceName', () => {
  it('accepts valid service names', () => {
    expect(isValidServiceName('ssh')).toBe(true);
    expect(isValidServiceName('nginx')).toBe(true);
    expect(isValidServiceName('docker')).toBe(true);
    expect(isValidServiceName('my-service')).toBe(true);
    expect(isValidServiceName('my_service')).toBe(true);
    expect(isValidServiceName('service@1')).toBe(true);
    expect(isValidServiceName('ssh.service')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidServiceName('')).toBe(false);
  });

  it('rejects shell injection attempts', () => {
    expect(isValidServiceName('ssh; rm -rf /')).toBe(false);
    expect(isValidServiceName('$(whoami)')).toBe(false);
    expect(isValidServiceName('`id`')).toBe(false);
    expect(isValidServiceName('ssh && cat /etc/passwd')).toBe(false);
    expect(isValidServiceName('ssh|cat')).toBe(false);
    expect(isValidServiceName('ssh > /tmp/out')).toBe(false);
  });

  it('rejects strings with spaces', () => {
    expect(isValidServiceName('my service')).toBe(false);
  });

  it('rejects strings longer than 256 chars', () => {
    expect(isValidServiceName('a'.repeat(257))).toBe(false);
    expect(isValidServiceName('a'.repeat(256))).toBe(true);
  });
});

describe('parseServiceList', () => {
  it('parses systemctl list-units output correctly', () => {
    const stdout = [
      '  ssh.service                           loaded active   running  OpenBSD Secure Shell server',
      '  nginx.service                         loaded active   running  A high performance web server',
      '  docker.service                        loaded inactive dead     Docker Application Container Engine',
    ].join('\n');

    const result = parseServiceList(stdout);
    expect(result).toHaveLength(3);

    // Active services come first
    expect(result[0].name).toBe('nginx');
    expect(result[0].activeState).toBe('active');
    expect(result[0].subState).toBe('running');
    expect(result[0].description).toBe('A high performance web server');

    expect(result[1].name).toBe('ssh');
    expect(result[1].activeState).toBe('active');
    expect(result[1].loadState).toBe('loaded');
  });

  it('handles failed services with ● prefix', () => {
    const stdout = '● mysql.service                         loaded failed   failed   MySQL Community Server';
    const result = parseServiceList(stdout);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('mysql');
    expect(result[0].activeState).toBe('failed');
    expect(result[0].subState).toBe('failed');
  });

  it('ignores non-.service units', () => {
    const stdout = [
      '  ssh.service         loaded active running OpenBSD Secure Shell server',
      '  dbus.socket         loaded active running D-Bus System Socket',
      '  tmp.mount           loaded active mounted Temporary Directory',
    ].join('\n');

    const result = parseServiceList(stdout);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ssh');
  });

  it('handles empty output', () => {
    expect(parseServiceList('')).toHaveLength(0);
    expect(parseServiceList('\n')).toHaveLength(0);
  });

  it('sorts active before inactive, failed before inactive', () => {
    const stdout = [
      '  inactive-svc.service   loaded inactive dead     Inactive service',
      '  failed-svc.service     loaded failed   failed   Failed service',
      '  active-svc.service     loaded active   running  Active service',
    ].join('\n');

    const result = parseServiceList(stdout);
    expect(result[0].name).toBe('active-svc');
    expect(result[1].name).toBe('failed-svc');
    expect(result[2].name).toBe('inactive-svc');
  });

  it('handles masked services', () => {
    const stdout = '  masked-svc.service    masked inactive dead     Masked service';
    const result = parseServiceList(stdout);
    expect(result).toHaveLength(1);
    expect(result[0].loadState).toBe('masked');
    expect(result[0].activeState).toBe('inactive');
  });

  it('strips .service suffix from name', () => {
    const stdout = '  cron.service    loaded active running  Regular background program processing daemon';
    const result = parseServiceList(stdout);
    expect(result[0].name).toBe('cron');
  });

  it('handles lines with short content gracefully', () => {
    const stdout = 'abc\n  x.service loaded active running OK';
    const result = parseServiceList(stdout);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('x');
  });
});
