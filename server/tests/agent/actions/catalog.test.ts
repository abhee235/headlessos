// EX9.1: the seeded action catalog
// @see docs/phases/phase-ex9.md §1

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ActionCatalog, ALL_ACTIONS, getDefaultCatalog, CatalogError } from '../../../src/agent/actions/catalog/index.js';
import { ActionRunner } from '../../../src/agent/actions/runner.js';
import { readAction } from '../../../src/agent/actions/catalog/define.js';
import { summarizeInspect } from '../../../src/agent/actions/catalog/docker.js';
import { isBlockedCommand } from '../../../src/security/validators.js';

/**
 * Every action, a sample of its parameters and the exact command it builds.
 * A new action must be added here — the test below fails otherwise.
 */
const EXPECTED: Record<string, [params: Record<string, unknown>, command: string]> = {
  os_release: [{}, 'cat /etc/os-release'],
  kernel_info: [{}, 'uname -a'],
  uptime: [{}, 'uptime'],
  cpu_info: [{}, 'lscpu'],
  load_average: [{}, 'cat /proc/loadavg'],
  memory_usage: [{}, 'free -m'],
  logged_in_users: [{}, 'who'],
  recent_logins: [{ lines: 50 }, 'last -n 50'],
  current_user: [{}, 'id'],
  disk_usage: [{}, 'df -hT'],
  disk_inodes: [{}, 'df -i'],
  block_devices: [{}, 'lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT'],
  mounts: [{}, 'findmnt -l'],
  dir_size: [{ path: '/var/log', depth: 0 }, 'du -h -x --max-depth=0 -- /var/log'],
  process_list: [{ sortBy: 'memory' }, 'ps aux --sort=-%mem'],
  process_detail: [{ pid: 1234 }, 'ps -o pid,ppid,user,stat,nlwp,ni,lstart,etime,%cpu,%mem,rss,args -p 1234'],
  process_find: [{ name: 'nginx' }, 'pgrep -a nginx'],
  network_interfaces: [{}, 'ip -brief addr'],
  network_routes: [{}, 'ip route show'],
  listening_ports: [{}, 'ss -tulnp'],
  network_connections: [{}, 'ss -tunap'],
  dns_config: [{}, 'cat /etc/resolv.conf'],
  dns_lookup: [{ host: 'example.com' }, 'getent ahosts example.com'],
  ping_host: [{ host: '10.0.0.1', count: 2 }, 'ping -c 2 -W 2 10.0.0.1'],
  http_check: [{ url: 'https://example.com/health' }, "curl -sS -o /dev/null -w 'status=%{http_code} time=%{time_total}s\\n' --max-time 10 -- https://example.com/health"],
  firewall_status: [{}, 'sudo -n ufw status verbose'],
  service_list: [{ state: 'failed' }, 'systemctl list-units --type=service --no-pager --no-legend --state=failed'],
  service_failed: [{}, 'systemctl --failed --no-pager --no-legend'],
  service_status: [{ unit: 'nginx' }, 'systemctl status --no-pager --lines=20 -- nginx'],
  service_config: [{ unit: 'nginx.service' }, 'systemctl cat --no-pager -- nginx.service'],
  sysv_services: [{}, 'service --status-all'],
  service_logs: [{ unit: 'nginx', lines: 50, since: '1h' }, 'journalctl -u nginx -n 50 --no-pager --output=short-iso --since=-1h'],
  system_logs: [{ priority: 'err' }, 'journalctl -n 100 --no-pager --output=short-iso -p err'],
  kernel_messages: [{}, 'dmesg --time-format=iso'],
  file_tail: [{ path: '/var/log/nginx/error.log', lines: 30 }, 'sftp: last 30 lines of /var/log/nginx/error.log'],
  cron_user: [{}, 'crontab -l'],
  docker_containers: [{}, "docker ps -a --no-trunc --format '{{json .}}'"],
  docker_images: [{}, "docker images --format '{{json .}}'"],
  docker_stats: [{}, "docker stats --no-stream --format '{{json .}}'"],
  docker_inspect: [{ container: 'web-1' }, 'docker inspect --type container -- web-1'],
  docker_logs: [{ container: 'web-1', lines: 200 }, 'docker logs --tail 200 --timestamps -- web-1'],
  docker_volumes: [{}, 'docker volume ls'],
  docker_disk_usage: [{}, 'docker system df'],
  packages_upgradable: [{}, 'apt list --upgradable'],
  package_status: [{ name: 'nginx' }, 'apt-cache policy nginx'],
  nginx_test: [{}, 'sudo -n nginx -t'],
  nginx_sites: [{ which: 'available' }, 'ls -la /etc/nginx/sites-available'],
  tls_certificates: [{}, 'sudo -n certbot certificates'],
  fail2ban_status: [{ jail: 'sshd' }, 'sudo -n fail2ban-client status sshd'],
  user_accounts: [{}, 'sftp: read /etc/passwd'],
  user_groups: [{ user: 'www-data' }, 'id -- www-data'],
  sudo_rights: [{}, 'sudo -n -l'],
  file_read: [{ path: '/etc/hosts' }, 'sftp: read /etc/hosts'],
  dir_list: [{ path: '/etc/nginx' }, 'ls -la --time-style=long-iso -- /etc/nginx'],
  file_find: [{ path: '/var/log', name: '*.log', type: 'file' }, "find /var/log -xdev -maxdepth 2 -type f -name '*.log' -print"],
  file_search: [{ path: '/etc/nginx', text: 'server_name' }, ''], // long exclude list — checked separately below
  cli_locate: [{ program: 'docker' }, 'which docker'],
  cli_help: [{ program: 'restic', subcommands: ['backup'] }, 'restic backup --help'],
  cli_version: [{ program: 'restic' }, 'restic --version'],
  cli_manual: [{ program: 'restic' }, 'man -P cat restic'],
};

const runner = new ActionRunner({ ssh: {} as never });

describe('seeded catalog', () => {
  it('has 40–60 actions, all read-only (EX9.1)', () => {
    const catalog = getDefaultCatalog();
    expect(catalog.size).toBeGreaterThanOrEqual(40);
    expect(catalog.size).toBeLessThanOrEqual(60);
    expect(catalog.list({ risk: 'change' })).toEqual([]);
  });

  it('has an expected command for every action, and no stale entries', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(ALL_ACTIONS.map((a) => a.id).sort());
  });

  it.each(Object.entries(EXPECTED).filter(([, [, cmd]]) => cmd))('%s builds the expected command', (id, [params, command]) => {
    const preview = runner.preview(id, params);
    expect(preview).toMatchObject({ ok: true, command });
  });

  it('file_search reads literally, skips secret files and searches only the path', () => {
    const preview = runner.preview('file_search', { path: '/etc/nginx', text: 'a b; $(id)' });
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.command.startsWith('grep -rnIF -m 20 ')).toBe(true);
    expect(preview.command).toContain('--exclude-dir=.ssh');
    expect(preview.command).toContain("'--exclude=*.pem'");
    expect(preview.command.endsWith("-e 'a b; $(id)' -- /etc/nginx")).toBe(true);
  });

  it('no built command trips the classic blocklist (it applies to granted commands too)', () => {
    for (const [id, [params]] of Object.entries(EXPECTED)) {
      if (getDefaultCatalog().get(id)!.run.kind !== 'exec') continue; // SFTP reads send no command
      const preview = runner.preview(id, params);
      if (!preview.ok) throw new Error(`${id}: ${preview.error}`);
      expect(isBlockedCommand(preview.command), `${id}: ${preview.command}`).toBe(false);
    }
  });

  it('every action works with only its required params (defaults fill the rest)', () => {
    for (const def of ALL_ACTIONS) {
      const required = Object.fromEntries(
        Object.entries(EXPECTED[def.id]![0]).filter(([k]) => !(def.params.shape as Record<string, z.ZodTypeAny>)[k]!.isOptional()),
      );
      expect(runner.validate(def.id, required).ok, def.id).toBe(true);
    }
  });

  it('every description is one line the model can read', () => {
    for (const def of ALL_ACTIONS) {
      expect(def.description.length).toBeLessThanOrEqual(120);
      expect(def.description).not.toContain('\n');
    }
  });
});

describe('ActionCatalog checks', () => {
  const base = { title: 'T', description: 'd', category: 'system' as const, run: { kind: 'exec' as const, build: () => ['true'] } };

  it('rejects malformed ids, loose params and duplicate ids', () => {
    expect(() => new ActionCatalog([readAction({ ...base, id: 'Bad-Id' })])).toThrow(CatalogError);
    expect(() => new ActionCatalog([readAction({ ...base, id: 'loose', params: z.object({ a: z.string() }) })])).toThrow(/strict/);
    expect(() => new ActionCatalog([readAction({ ...base, id: 'twice' }), readAction({ ...base, id: 'twice' })])).toThrow(/duplicate/);
  });

  it('rejects a read action that builds a write command', () => {
    const def = readAction({ ...base, id: 'sneaky', run: { kind: 'exec', build: () => ['systemctl', 'restart', 'nginx'] } });
    expect(() => new ActionCatalog([def])).toThrow(/write command/);
  });

  it('rejects out-of-range timeouts and long descriptions', () => {
    expect(() => new ActionCatalog([readAction({ ...base, id: 'slow', timeoutMs: 120_000 })])).toThrow(/timeout/);
    expect(() => new ActionCatalog([readAction({ ...base, id: 'wordy', description: 'x'.repeat(121) })])).toThrow(/description/);
  });

  it('suggests the closest ids for an unknown one', () => {
    expect(getDefaultCatalog().closest('disk_usge')[0]).toBe('disk_usage');
    expect(getDefaultCatalog().closest('docker_ps')).toContain('docker_stats');
  });
});

describe('docker_inspect summary', () => {
  it('drops environment variables (secrets) and keeps what diagnoses a container', () => {
    const raw = JSON.stringify([{
      Id: 'abcdef0123456789', Name: '/web', State: { Status: 'exited', ExitCode: 137, OOMKilled: true }, RestartCount: 3,
      Config: { Image: 'nginx:1.27', Env: ['DB_PASSWORD=hunter2', 'API_KEY=sk-123'], Cmd: ['nginx'] },
      HostConfig: { RestartPolicy: { Name: 'always' }, Memory: 268435456 },
      Mounts: [{ Type: 'bind', Source: '/srv/web', Destination: '/usr/share/nginx/html', RW: false, Propagation: 'rprivate' }],
      NetworkSettings: { Networks: { bridge: {} }, Ports: {} },
    }]);
    const summary = summarizeInspect(raw);
    const text = JSON.stringify(summary);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('sk-123');
    expect(summary).toEqual([expect.objectContaining({
      Id: 'abcdef012345', EnvCount: 2, RestartCount: 3, Image: 'nginx:1.27',
      State: { Status: 'exited', ExitCode: 137, OOMKilled: true },
      Networks: ['bridge'],
    })]);
  });
});
