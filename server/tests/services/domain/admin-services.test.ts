// M12.6: Tests for domain admin services
// Validates: command construction, validator integration, parser invocation, ServiceResult mapping
// @see docs/phases/phase-12.md

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer } from '../../../src/services/container.js';
import { FirewallAdminService } from '../../../src/services/domain/admin/firewall-admin-service.js';
import { NetworkAdminService } from '../../../src/services/domain/admin/network-admin-service.js';
import { SecurityAdminService } from '../../../src/services/domain/admin/security-admin-service.js';
import { WebServerAdminService } from '../../../src/services/domain/admin/webserver-admin-service.js';
import { PackagesAdminService } from '../../../src/services/domain/admin/packages-admin-service.js';
import { CronAdminService } from '../../../src/services/domain/admin/cron-admin-service.js';
import { LogsAdminService } from '../../../src/services/domain/admin/logs-admin-service.js';
import { StorageAdminService } from '../../../src/services/domain/admin/storage-admin-service.js';
import type { DomainService } from '../../../src/services/domain/base.js';
import { BaseService } from '../../../src/services/base-service.js';
import type { ExecResult } from '../../../src/ssh/connection-manager.js';
import { ServiceError } from '../../../src/services/domain/base.js';

// ── Mock SSH ConnectionManager ──
type ExecImpl = (command: string) => Promise<ExecResult> | ExecResult;

class MockConnection extends BaseService {
  exec = vi.fn<(serverId: string, command: string, timeout?: number) => Promise<ExecResult>>();
  getState = vi.fn<(serverId: string) => { status: string }>(() => ({ status: 'connected' }));
  // Required by ConnectionManager type but unused in our tests
  getSftp = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();

  setExec(impl: ExecImpl): void {
    this.exec.mockImplementation(async (_id, command) => {
      const r = await impl(command);
      return r;
    });
  }
}

class StubOrchestrator extends BaseService {
  execute = vi.fn();
}
class StubPipeline extends BaseService {
  parse = vi.fn();
}

function ok(stdout: string, exitCode = 0, stderr = ''): ExecResult {
  return { stdout, stderr, exitCode, durationMs: 0 };
}

async function bootService<T extends DomainService>(svc: T): Promise<{
  svc: T;
  ssh: MockConnection;
}> {
  const container = new ServiceContainer();
  const ssh = new MockConnection('ssh');
  const orch = new StubOrchestrator('orchestrator');
  const pipe = new StubPipeline('parser');
  container.register('ssh', ssh);
  container.register('orchestrator', orch);
  container.register('parser', pipe);
  container.register(svc.name, svc);
  await container.boot();
  return { svc, ssh };
}

// ──────────────────────────────────────────────────────────────────
// FirewallAdminService
// ──────────────────────────────────────────────────────────────────

describe('FirewallAdminService', () => {
  let svc: FirewallAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new FirewallAdminService('firewall-admin')));
  });

  it('addRule builds correct ufw command', async () => {
    ssh.setExec(() => ok(''));
    const r = await svc.addRule('s1', { action: 'allow', port: 22, protocol: 'tcp' });
    expect(r.ok).toBe(true);
    expect(ssh.exec).toHaveBeenCalledWith('s1', 'sudo ufw allow 22/tcp', expect.any(Number));
  });

  it('deleteRule rejects non-positive numbers', async () => {
    const r = await svc.deleteRule('s1', 0);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(400);
  });

  it('addAdvancedRule rejects invalid CIDR', async () => {
    const r = await svc.addAdvancedRule('s1', { action: 'allow', from: 'not-an-ip' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid source/);
  });

  it('addAdvancedRule accepts valid CIDR with port and protocol', async () => {
    ssh.setExec(() => ok(''));
    const r = await svc.addAdvancedRule('s1', {
      action: 'allow',
      from: '10.0.0.0/8',
      port: '8000:9000',
      protocol: 'tcp',
    });
    expect(r.ok).toBe(true);
    const call = ssh.exec.mock.calls[0]![1];
    expect(call).toContain("sudo ufw allow from '10.0.0.0/8'");
    expect(call).toContain("port '8000:9000'");
    expect(call).toContain('proto tcp');
  });

  it('toggle enable/disable produces correct commands', async () => {
    ssh.setExec(() => ok(''));
    await svc.toggle('s1', true);
    expect(ssh.exec.mock.calls[0]![1]).toBe('echo y | sudo ufw enable');
    await svc.toggle('s1', false);
    expect(ssh.exec.mock.calls[1]![1]).toBe('sudo ufw disable');
  });

  it('throws ServiceError when not connected', async () => {
    ssh.getState.mockReturnValue({ status: 'disconnected' });
    await expect(svc.getStatus('s1')).rejects.toBeInstanceOf(ServiceError);
  });
});

// ──────────────────────────────────────────────────────────────────
// NetworkAdminService
// ──────────────────────────────────────────────────────────────────

describe('NetworkAdminService', () => {
  let svc: NetworkAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new NetworkAdminService('network-admin')));
  });

  it('setHostname rejects invalid hostname', async () => {
    const r = await svc.setHostname('s1', '-bad-hostname');
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(400);
  });

  it('setHostname runs hostnamectl on valid input', async () => {
    ssh.setExec(() => ok(''));
    const r = await svc.setHostname('s1', 'web-01');
    expect(r.ok).toBe(true);
    expect(ssh.exec.mock.calls[0]![1]).toContain('hostnamectl set-hostname');
  });

  it('setDns rejects empty nameserver list', async () => {
    const r = await svc.setDns('s1', []);
    expect(r.ok).toBe(false);
  });

  it('setDns rejects invalid IP', async () => {
    const r = await svc.setDns('s1', ['not-an-ip']);
    expect(r.ok).toBe(false);
  });

  it('interfaceUp validates name and runs ip link set up', async () => {
    ssh.setExec(() => ok(''));
    const ok1 = await svc.interfaceUp('s1', 'eth0');
    expect(ok1.ok).toBe(true);
    const bad = await svc.interfaceUp('s1', '../bad');
    expect(bad.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// SecurityAdminService — user management & fail2ban
// ──────────────────────────────────────────────────────────────────

describe('SecurityAdminService', () => {
  let svc: SecurityAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new SecurityAdminService('security-admin')));
  });

  it('createUser refuses protected names', async () => {
    const r = await svc.createUser('s1', 'root');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/protected/i);
  });

  it('createUser builds useradd with -m by default', async () => {
    ssh.setExec(() => ok(''));
    await svc.createUser('s1', 'alice');
    expect(ssh.exec.mock.calls[0]![1]).toBe("sudo useradd -m 'alice'");
  });

  it('createUser maps "already exists" to 409', async () => {
    ssh.setExec(() => ok('', 9, 'useradd: user alice already exists'));
    const r = await svc.createUser('s1', 'alice');
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(409);
  });

  it('deleteUser refuses root', async () => {
    const r = await svc.deleteUser('s1', 'root');
    expect(r.ok).toBe(false);
  });

  it('banIp validates jail and IP', async () => {
    const r1 = await svc.banIp('s1', 'jail-name', 'not-an-ip');
    expect(r1.ok).toBe(false);
    const r2 = await svc.banIp('s1', '../bad', '10.0.0.1');
    expect(r2.ok).toBe(false);
  });

  it('killSession treats exit 1 as success (no matching sessions)', async () => {
    ssh.setExec(() => ok('', 1, ''));
    const r = await svc.killSession('s1', 'pts/0');
    expect(r.ok).toBe(true);
  });

  it('killSession rejects invalid TTY', async () => {
    const r = await svc.killSession('s1', '../etc');
    expect(r.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// WebServerAdminService
// ──────────────────────────────────────────────────────────────────

describe('WebServerAdminService', () => {
  let svc: WebServerAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new WebServerAdminService('webserver-admin')));
  });

  it('returns available:false when nginx not installed', async () => {
    ssh.setExec((cmd) => {
      if (cmd.includes('ls /etc/nginx/nginx.conf')) return ok('', 1, 'No such file');
      if (cmd.includes('which nginx')) return ok('', 1, '');
      return ok('');
    });
    const r = await svc.getWebServerInfo('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.available).toBe(false);
    expect(r.data!.message).toMatch(/not installed/i);
  });

  it('enableSite rejects invalid site name', async () => {
    const r = await svc.enableSite('s1', '../etc/passwd');
    expect(r.ok).toBe(false);
  });

  it('enableSite creates symlink', async () => {
    ssh.setExec(() => ok(''));
    await svc.enableSite('s1', 'mysite');
    expect(ssh.exec.mock.calls[0]![1]).toBe(
      'sudo ln -sf /etc/nginx/sites-available/mysite /etc/nginx/sites-enabled/mysite',
    );
  });

  it('readSiteConfig returns 404 on missing file', async () => {
    ssh.setExec(() => ok('', 1, 'cat: file not found'));
    const r = await svc.readSiteConfig('s1', 'mysite');
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────
// PackagesAdminService
// ──────────────────────────────────────────────────────────────────

describe('PackagesAdminService', () => {
  let svc: PackagesAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new PackagesAdminService('packages-admin')));
  });

  it('returns available:false when apt missing', async () => {
    ssh.setExec(() => ok('', 1, ''));
    const r = await svc.getPackageInfo('s1');
    expect(r.ok).toBe(true);
    expect(r.data!.available).toBe(false);
  });

  it('install rejects invalid package name', async () => {
    const r = await svc.install('s1', 'pkg; rm -rf /');
    expect(r.ok).toBe(false);
  });

  it('install builds apt install -y command', async () => {
    ssh.setExec((cmd) => {
      if (cmd === 'which apt') return ok('/usr/bin/apt');
      return ok('install ok');
    });
    const r = await svc.install('s1', 'nginx');
    expect(r.ok).toBe(true);
    // First call after `which apt` skip — install should be present
    const hasInstall = ssh.exec.mock.calls.some((c) =>
      c[1].includes("sudo apt install -y 'nginx'"),
    );
    expect(hasInstall).toBe(true);
  });

  it('search rejects empty query', async () => {
    const r = await svc.search('s1', '');
    expect(r.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// CronAdminService
// ──────────────────────────────────────────────────────────────────

describe('CronAdminService', () => {
  let svc: CronAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new CronAdminService('cron-admin')));
  });

  it('addJob rejects invalid schedule', async () => {
    const r = await svc.addJob('s1', { schedule: 'not a schedule', command: 'echo hi' });
    expect(r.ok).toBe(false);
  });

  it('addJob rejects dangerous commands', async () => {
    const r = await svc.addJob('s1', {
      schedule: '0 * * * *',
      command: 'rm -rf /',
    });
    expect(r.ok).toBe(false);
  });

  it('addJob with description prepends comment', async () => {
    ssh.setExec(() => ok(''));
    const r = await svc.addJob('s1', {
      schedule: '0 * * * *',
      command: '/usr/bin/backup.sh',
      description: 'hourly backup',
    });
    expect(r.ok).toBe(true);
    const cmd = ssh.exec.mock.calls[0]![1];
    expect(cmd).toContain('# hourly backup');
  });

  it('deleteJobByIndex returns 400 when crontab empty', async () => {
    ssh.setExec(() => ok('', 1, ''));
    const r = await svc.deleteJobByIndex('s1', 0);
    expect(r.ok).toBe(false);
  });

  it('deleteJobByIndex removes correct job line', async () => {
    const crontab = [
      '# managed crontab',
      'PATH=/usr/bin',
      '',
      '# hourly backup',
      '0 * * * * /usr/bin/backup.sh',
      '*/5 * * * * /usr/bin/health.sh',
    ].join('\n');

    ssh.setExec((cmd) => {
      if (cmd.includes('crontab -l')) return ok(crontab);
      return ok('');
    });

    const r = await svc.deleteJobByIndex('s1', 0); // first non-comment job
    expect(r.ok).toBe(true);
    // Final write call: the new crontab should not contain backup.sh nor its comment
    const writeCall = ssh.exec.mock.calls.find((c) =>
      c[1].includes('| crontab -') && c[1].includes('echo'),
    )!;
    expect(writeCall[1]).not.toContain('backup.sh');
    expect(writeCall[1]).not.toContain('hourly backup');
    expect(writeCall[1]).toContain('health.sh');
  });

  it('deleteJobByIndex out of range returns 400', async () => {
    ssh.setExec((cmd) => {
      if (cmd.includes('crontab -l')) return ok('0 * * * * echo hi');
      return ok('');
    });
    const r = await svc.deleteJobByIndex('s1', 99);
    expect(r.ok).toBe(false);
    expect(r.statusCode).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────
// LogsAdminService
// ──────────────────────────────────────────────────────────────────

describe('LogsAdminService', () => {
  let svc: LogsAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new LogsAdminService('logs-admin')));
  });

  it('rejects invalid source', async () => {
    const r = await svc.getLogs('s1', { source: 'invalid' });
    expect(r.ok).toBe(false);
  });

  it('rejects bad priority', async () => {
    const r = await svc.getLogs('s1', { priority: '99' });
    expect(r.ok).toBe(false);
  });

  it('rejects grep with shell metacharacters', async () => {
    const r = await svc.getLogs('s1', { grep: '$(rm -rf /)' });
    expect(r.ok).toBe(false);
  });

  it('builds journalctl command with all flags', async () => {
    ssh.setExec(() => ok(''));
    await svc.getLogs('s1', {
      source: 'journal',
      unit: 'nginx',
      lines: 50,
      priority: '3',
      since: '2024-01-01',
    });
    const cmd = ssh.exec.mock.calls[0]![1];
    expect(cmd).toContain('journalctl');
    expect(cmd).toContain('-n 50');
    expect(cmd).toContain("-u 'nginx'");
    expect(cmd).toContain('-p 3');
    expect(cmd).toContain('--since=');
  });

  it('caps lines at 1000 for getLogs', async () => {
    ssh.setExec(() => ok(''));
    await svc.getLogs('s1', { source: 'journal', lines: 99999 });
    const cmd = ssh.exec.mock.calls[0]![1];
    expect(cmd).toContain('-n 1000');
  });

  it('caps lines at 5000 for exportLogs', async () => {
    ssh.setExec(() => ok(''));
    await svc.exportLogs('s1', { source: 'journal', lines: 99999 });
    const cmd = ssh.exec.mock.calls[0]![1];
    expect(cmd).toContain('-n 5000');
  });
});

// ──────────────────────────────────────────────────────────────────
// StorageAdminService
// ──────────────────────────────────────────────────────────────────

describe('StorageAdminService', () => {
  let svc: StorageAdminService;
  let ssh: MockConnection;

  beforeEach(async () => {
    ({ svc, ssh } = await bootService(new StorageAdminService('storage-admin')));
  });

  it('runs all 3 commands in parallel and parses', async () => {
    ssh.setExec((cmd) => {
      if (cmd.startsWith('du -sh')) return ok('1.2G\t/var/log\n300M\t/tmp');
      if (cmd.startsWith('findmnt')) return ok('{"filesystems":[]}');
      if (cmd.startsWith('swapon')) return ok('');
      return ok('');
    });
    const r = await svc.getStorageInfo('s1');
    expect(r.ok).toBe(true);
    expect(ssh.exec).toHaveBeenCalledTimes(3);
  });
});
