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

    ['uptime', ok(' 10:32:45 up 42 days,  3:15,  2 users,  load average: 0.45, 0.38, 0.32')],

    ['free -m', ok(
`               total        used        free      shared  buff/cache   available
Mem:            7987        6349         318         102        1320        1279
Swap:           2048         512        1536`)],

    ['df -hT', ok(
`Filesystem     Type   Size  Used Avail Use% Mounted on
/dev/sda1      ext4   500G  320G  180G  64% /
tmpfs          tmpfs  3.9G     0  3.9G   0% /dev/shm
/dev/sda2      ext4    50G   12G   38G  24% /boot`)],

    ['which docker', ok('/usr/bin/docker')],
    ['which nginx', ok('/usr/sbin/nginx')],

    // ── Additional commands the agent might call ──
    ['uname -a', ok('Linux web-prod-01 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux')],

    ['ps aux --sort=-%cpu', slow(
`USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
postgres     890 18.5 12.4 2201840 512000 ?     Ss   Apr03  42:10 postgres: main
node        1501 12.3  8.2 1887436 262144 ?     Sl   Apr03  31:02 node /app/server.js
www-data    1234  5.7  2.8 131072  46080 ?      S    Apr03   9:44 nginx: worker process
root           1  0.0  0.1 167744  11264 ?      Ss   Apr03   0:12 /sbin/init`)],

    ['cat /proc/loadavg', ok('0.45 0.38 0.32 1/142 45321')],
    // EX10.8: cpu_usage and network_traffic sample these twice (the same answer twice: since-boot / zero rates)
    ['cat /proc/stat', ok(`cpu  348672 1823 380036 1366221 20038 0 64106 0 0 0
cpu0 174336 911 190018 683110 10019 0 32053 0 0 0
cpu1 174336 912 190018 683111 10019 0 32053 0 0 0
intr 123456
ctxt 654321`)],
    ['cat /proc/net/dev', ok(`Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  123456     789    0    0    0     0          0         0   123456     789    0    0    0     0       0          0
  eth0: 25582428  314139    0    0    0     0          0         0 66673212  242752    0    0    0     0       0          0`)],

    // EX9.4: outputs for the agent benchmark's questions (catalog action commands)
    ['systemctl status --no-pager --lines=20 -- nginx', ok(
`● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/lib/systemd/system/nginx.service; enabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-04-06 07:17:30 UTC; 2 days ago
   Main PID: 1234 (nginx)
      Tasks: 5 (limit: 9387)
     Memory: 45.2M`)],
    ['systemctl --failed --no-pager --no-legend', ok(
`● certbot.service loaded failed failed Certbot`)],
    ['cat /etc/resolv.conf', ok(
`nameserver 1.1.1.1
nameserver 8.8.8.8
search internal.example`)],
    ['who', ok(
`admin    pts/0        2026-04-08 10:12 (10.0.1.1)
deploy   pts/1        2026-04-08 09:40 (10.0.1.7)`)],
    ['journalctl -n 100 --no-pager --output=short-iso -p err', ok(
`2026-04-08T09:58:12+0000 web-prod-01 certbot[2201]: Challenge failed for domain old.example.com
2026-04-08T10:02:44+0000 web-prod-01 kernel: EXT4-fs warning (device sda1): ext4_dx_add_entry: directory index full`)],
    ['pgrep -a nginx', ok(
`1234 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;
1235 nginx: worker process`)],
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


    // Docker commands (read-only)
    ["docker ps -a --no-trunc --format '{{json .}}'", slow(
`{"ID":"a1b2c3d4e5f6","Names":"nginx-proxy","Image":"nginx:latest","State":"running","Status":"Up 3 days","Ports":"0.0.0.0:80->80/tcp","CreatedAt":"2026-04-05 10:00:00 +0000 UTC","RunningFor":"3 days ago"}
{"ID":"b2c3d4e5f6a7","Names":"postgres-db","Image":"postgres:15","State":"running","Status":"Up 5 days","Ports":"0.0.0.0:5432->5432/tcp","CreatedAt":"2026-04-03 10:00:00 +0000 UTC","RunningFor":"5 days ago"}
{"ID":"c3d4e5f6a7b8","Names":"redis-cache","Image":"redis:7","State":"running","Status":"Up 5 days","Ports":"0.0.0.0:6379->6379/tcp","CreatedAt":"2026-04-03 10:00:00 +0000 UTC","RunningFor":"5 days ago"}
{"ID":"d4e5f6a7b8c9","Names":"old-api","Image":"myapp:v1.9","State":"exited","Status":"Exited (0) 2 days ago","Ports":"","CreatedAt":"2026-03-29 10:00:00 +0000 UTC","RunningFor":"10 days ago"}`)],

    ["docker stats --no-stream --format '{{json .}}'", slow(
`{"Name":"nginx-proxy","CPUPerc":"2.30%","MemUsage":"45.2MiB / 7.8GiB","MemPerc":"0.57%","NetIO":"1.2GB / 890MB","BlockIO":"12MB / 0B","PIDs":"5"}
{"Name":"postgres-db","CPUPerc":"8.10%","MemUsage":"512MiB / 7.8GiB","MemPerc":"6.41%","NetIO":"450MB / 320MB","BlockIO":"2.1GB / 1.8GB","PIDs":"14"}
{"Name":"redis-cache","CPUPerc":"0.40%","MemUsage":"28.1MiB / 7.8GiB","MemPerc":"0.35%","NetIO":"120MB / 98MB","BlockIO":"0B / 45MB","PIDs":"4"}`)],

    // Systemd services
    ['systemctl list-units --type=service --no-pager --no-legend --all', slow(
`docker.service           loaded active running Docker Application Container Engine
nginx.service            loaded active running A high performance web server
ssh.service              loaded active running OpenBSD Secure Shell server
cron.service             loaded active running Regular background program processing
systemd-journald.service loaded active running Journal Service`)],

    // Network
    ['ip -brief addr', ok(
`lo               UNKNOWN        127.0.0.1/8 ::1/128
eth0             UP             10.0.1.42/24 fe80::5054:ff:fe12:3456/64`)],

    ['ss -tulnp', ok(
`Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
tcp   LISTEN 0      511          0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=1234,fd=6))
tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=567,fd=3))
tcp   LISTEN 0      244          0.0.0.0:5432       0.0.0.0:*     users:(("postgres",pid=890,fd=4))
tcp   LISTEN 0      511          0.0.0.0:6379       0.0.0.0:*     users:(("redis-server",pid=1011,fd=6))`)],

    // Logs
    ['journalctl -n 100 --no-pager --output=short-iso', ok(
`2026-04-08T10:30:01+0000 web-prod-01 CRON[45123]: (root) CMD (/usr/local/bin/cleanup.sh)
2026-04-08T10:31:22+0000 web-prod-01 nginx[1234]: 10.0.1.1 - - [08/Apr/2026:10:31:22 +0000] "GET / HTTP/1.1" 200 612
2026-04-08T10:32:01+0000 web-prod-01 dockerd[890]: Container a1b2c3d4 health check passed
2026-04-08T10:32:45+0000 web-prod-01 sshd[5678]: Accepted publickey for admin from 10.0.1.1 port 52431`)],

  ]);
}
