// FakeSSH Connection Proxy — wraps the real ConnectionManager but intercepts
// calls for a special "fake-server" ID, returning canned outputs.
// Used when LLM_PROVIDER=fake to test the full agent pipeline live.

import type { ConnectionManager } from '../../ssh/connection-manager.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

/**
 * Wraps the real ConnectionManager. For "fake-server", returns canned
 * SSH outputs without a real SSH connection. All other server IDs
 * pass through to the real manager.
 */
export class FakeSSHProxy {
  private real: ConnectionManager;
  private commands: Map<string, ExecResult>;
  readonly fakeServerId = 'fake-server';

  constructor(real: ConnectionManager, commands: Map<string, ExecResult>) {
    this.real = real;
    this.commands = commands;
  }

  /**
   * Return "connected" for fake-server, delegate everything else.
   */
  getState(serverId: string) {
    if (serverId === this.fakeServerId) {
      return {
        serverId: this.fakeServerId,
        status: 'connected' as const,
        connectedAt: new Date().toISOString(),
        detectedTools: ['docker', 'nginx', 'git', 'python3'],
      };
    }
    return this.real.getState(serverId);
  }

  /**
   * Return canned output for fake-server, delegate everything else.
   * Simulates realistic SSH round-trip latency (50–200ms per command).
   */
  async exec(serverId: string, command: string, timeout?: number): Promise<ExecResult> {
    if (serverId === this.fakeServerId) {
      const result = this.commands.get(command);
      if (result) {
        // Simulate SSH exec latency based on the canned durationMs
        const delay = Math.max(result.durationMs, 30);
        await sleep(delay);
        return { ...result, durationMs: delay };
      }

      // Try trimmed match
      for (const [key, val] of this.commands) {
        if (command.trim() === key.trim()) {
          const delay = Math.max(val.durationMs, 30);
          await sleep(delay);
          return { ...val, durationMs: delay };
        }
      }

      // Try substring/contains match for piped or modified commands
      for (const [key, val] of this.commands) {
        if (command.includes(key) || key.includes(command.split('|')[0]!.trim())) {
          const delay = Math.max(val.durationMs, 30);
          await sleep(delay);
          return { ...val, durationMs: delay };
        }
      }

      // Unknown command — return an error result (don't throw, so the agent can recover)
      console.warn(`[FakeSSH] Unknown command: "${command}"`);
      await sleep(20);
      return {
        stdout: '',
        stderr: `command not found: ${command.split(' ')[0]}`,
        exitCode: 127,
        durationMs: 20,
      };
    }

    return this.real.exec(serverId, command, timeout);
  }

  // ── Proxy all other ConnectionManager methods to the real implementation ──

  connect(config: Parameters<ConnectionManager['connect']>[0]) {
    const cfg = config as { id?: string; host?: string; name?: string };
    if (cfg.id === this.fakeServerId || (cfg.host === '127.0.0.1' && cfg.name?.includes('Fake'))) {
      // No-op for fake-server — it's always "connected"
      return Promise.resolve();
    }
    return this.real.connect(config);
  }

  disconnect(serverId: string) {
    if (serverId === this.fakeServerId) {
      return Promise.resolve();
    }
    return this.real.disconnect(serverId);
  }

  /**
   * SFTP stub — for fake-server, throws (we don't support SFTP in fake mode).
   * For real servers, delegates to the real ConnectionManager.
   */
  async getSftp(serverId: string) {
    if (serverId === this.fakeServerId) {
      throw new Error('[FakeSSH] SFTP is not available for fake-server');
    }
    return this.real.getSftp(serverId);
  }

  // Forward BaseService methods
  get name() { return this.real.name; }
}

// ── Canned outputs for fake-server ──

/** Quick command (~40ms SSH round-trip) */
function ok(stdout: string, durationMs = 40): ExecResult {
  return { exitCode: 0, stdout, stderr: '', durationMs };
}

/** Slow command — top, docker stats, etc. (~120ms) */
function slow(stdout: string): ExecResult {
  return { exitCode: 0, stdout, stderr: '', durationMs: 120 };
}

function fail(stderr: string): ExecResult {
  return { exitCode: 1, stdout: '', stderr, durationMs: 40 };
}

/**
 * Realistic Ubuntu 22.04 server outputs for the "system overview" scenario.
 */
export function createFakeServerOutputs(): Map<string, ExecResult> {
  return new Map<string, ExecResult>([
    // ── get_server_context commands ──
    ['cat /etc/os-release', ok(
`PRETTY_NAME="Ubuntu 22.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy`)],

    ['hostname', ok('web-prod-01')],
    ['uname -m', ok('x86_64')],
    ['uname -r', ok('5.15.0-91-generic')],
    ['uptime', ok(' 10:32:45 up 42 days,  3:15,  2 users,  load average: 0.45, 0.38, 0.32')],

    ['free -h', ok(
`              total        used        free      shared  buff/cache   available
Mem:          7.8Gi       6.2Gi       0.3Gi       0.1Gi       1.3Gi       1.2Gi
Swap:         2.0Gi       0.5Gi       1.5Gi`)],

    ['df -h', ok(
`Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1       500G  320G  180G  64% /
tmpfs           3.9G     0  3.9G   0% /dev/shm
/dev/sda2        50G   12G   38G  24% /boot`)],

    ['docker --version', ok('Docker version 24.0.7, build afdd53b')],
    ['nginx -v', fail('nginx version: nginx/1.24.0')],

    // ── Additional commands the agent might call ──
    ['uname -a', ok('Linux web-prod-01 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux')],

    ['top -bn1 | head -5', slow(
`top - 10:32:45 up 42 days,  3:15,  2 users,  load average: 0.45, 0.38, 0.32
Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie
%Cpu(s): 45.2 us,  3.1 sy,  0.0 ni, 50.8 id,  0.2 wa,  0.0 hi,  0.7 si,  0.0 st
MiB Mem :   7987.4 total,    318.2 free,   6348.8 used,   1320.4 buff/cache
MiB Swap:   2048.0 total,   1536.0 free,    512.0 used.   1278.6 avail Mem`)],

    ['cat /proc/loadavg', ok('0.45 0.38 0.32 1/142 45321')],
    ['cat /proc/cpuinfo', slow(
`processor\t: 0
model name\t: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz\t\t: 2300.000
cache size\t: 46080 KB
cpu cores\t: 4

processor\t: 1
model name\t: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz\t\t: 2300.000
cache size\t: 46080 KB
cpu cores\t: 4

processor\t: 2
model name\t: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz\t\t: 2300.000
cache size\t: 46080 KB
cpu cores\t: 4

processor\t: 3
model name\t: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz\t\t: 2300.000
cache size\t: 46080 KB
cpu cores\t: 4`)],

    ['cat /proc/meminfo', ok(
`MemTotal:        8180992 kB
MemFree:          325836 kB
MemAvailable:    1309516 kB
Buffers:          142088 kB
Cached:          1210132 kB
SwapCached:        32768 kB
SwapTotal:       2097152 kB
SwapFree:        1572864 kB`)],

    ['cat /proc/version', ok('Linux version 5.15.0-91-generic (buildd@lcy02-amd64-045) (gcc (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023')],

    ['ps aux | head -1', ok('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND')],

    // Docker commands (read-only)
    ['docker ps', ok(
`CONTAINER ID   IMAGE             COMMAND                  CREATED       STATUS       PORTS                    NAMES
a1b2c3d4e5f6   nginx:latest      "/docker-entrypoint.…"   3 days ago    Up 3 days    0.0.0.0:80->80/tcp       nginx-proxy
b2c3d4e5f6a7   postgres:15       "docker-entrypoint.s…"   5 days ago    Up 5 days    0.0.0.0:5432->5432/tcp   postgres-db
c3d4e5f6a7b8   redis:7           "docker-entrypoint.s…"   5 days ago    Up 5 days    0.0.0.0:6379->6379/tcp   redis-cache`)],

    ['docker ps -a', slow(
`CONTAINER ID   IMAGE             COMMAND                  CREATED       STATUS                   PORTS                    NAMES
a1b2c3d4e5f6   nginx:latest      "/docker-entrypoint.…"   3 days ago    Up 3 days                0.0.0.0:80->80/tcp       nginx-proxy
b2c3d4e5f6a7   postgres:15       "docker-entrypoint.s…"   5 days ago    Up 5 days                0.0.0.0:5432->5432/tcp   postgres-db
c3d4e5f6a7b8   redis:7           "docker-entrypoint.s…"   5 days ago    Up 5 days                0.0.0.0:6379->6379/tcp   redis-cache
d4e5f6a7b8c9   myapp:v1.9        "node server.js"         10 days ago   Exited (0) 2 days ago                             old-api`)],

    ['docker stats --no-stream', slow(
`CONTAINER ID   NAME           CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O
a1b2c3d4e5f6   nginx-proxy    2.30%     45.2MiB / 7.8GiB     0.57%     1.2GB / 890MB     12MB / 0B
b2c3d4e5f6a7   postgres-db    8.10%     512MiB / 7.8GiB      6.41%     450MB / 320MB     2.1GB / 1.8GB
c3d4e5f6a7b8   redis-cache    0.40%     28.1MiB / 7.8GiB     0.35%     120MB / 98MB      0B / 45MB`)],

    // Systemd services
    ['systemctl list-units --type=service --state=running', slow(
`UNIT                     LOAD   ACTIVE SUB     DESCRIPTION
docker.service           loaded active running Docker Application Container Engine
nginx.service            loaded active running A high performance web server
ssh.service              loaded active running OpenBSD Secure Shell server
cron.service             loaded active running Regular background program processing
systemd-journald.service loaded active running Journal Service`)],

    // Network
    ['ip addr', ok(
`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    inet 10.0.1.42/24 brd 10.0.1.255 scope global dynamic eth0`)],

    ['ss -tlnp', ok(
`State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port  Process
LISTEN 0      511           0.0.0.0:80         0.0.0.0:*      users:(("nginx",pid=1234,fd=6))
LISTEN 0      128           0.0.0.0:22         0.0.0.0:*      users:(("sshd",pid=567,fd=3))
LISTEN 0      244           0.0.0.0:5432       0.0.0.0:*      users:(("postgres",pid=890,fd=4))
LISTEN 0      511           0.0.0.0:6379       0.0.0.0:*      users:(("redis-server",pid=1011,fd=6))`)],

    // Logs
    ['journalctl --no-pager -n 20', ok(
`Apr 08 10:30:01 web-prod-01 CRON[45123]: (root) CMD (/usr/local/bin/cleanup.sh)
Apr 08 10:31:22 web-prod-01 nginx[1234]: 10.0.1.1 - - [08/Apr/2026:10:31:22 +0000] "GET / HTTP/1.1" 200 612
Apr 08 10:32:01 web-prod-01 dockerd[890]: Container a1b2c3d4 health check passed
Apr 08 10:32:45 web-prod-01 sshd[5678]: Accepted publickey for admin from 10.0.1.1 port 52431`)],

    // Cron
    ['cat /etc/passwd', ok('root:x:0:0:root:/root:/bin/bash\ntestuser:x:1000:1000:Test User:/home/testuser:/bin/bash')],
  ]);
}
