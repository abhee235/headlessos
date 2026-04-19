// MockSSH — Canned SSH responses for agent pipeline testing
//
// Implements enough of ConnectionManager for ToolContext.ssh.
// Returns pre-defined command outputs from a lookup map.

export interface MockExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
}

/**
 * Mock SSH ConnectionManager that returns canned command outputs.
 * Used in FakeLLM end-to-end tests where we need real tools (exec_command,
 * get_server_context) but don't want a real SSH connection.
 */
export class MockSSHConnectionManager {
  private commands: Map<string, MockExecResult>;
  private _execLog: Array<{ serverId: string; command: string }> = [];

  /**
   * @param commands Map of command string → canned result.
   *   Supports exact match. For piped commands, use the full pipe string as key.
   */
  constructor(commands: Map<string, MockExecResult>) {
    this.commands = commands;
  }

  /**
   * Mock exec — looks up the command in the canned responses map.
   * Throws a descriptive error if the command is not in the map.
   */
  async exec(
    serverId: string,
    command: string,
    _timeout?: number,
  ): Promise<MockExecResult> {
    this._execLog.push({ serverId, command });

    const result = this.commands.get(command);
    if (result) {
      return { ...result, durationMs: result.durationMs ?? 10 };
    }

    // Try partial match — sometimes commands have slight formatting differences
    for (const [key, val] of this.commands) {
      if (command.trim() === key.trim()) {
        return { ...val, durationMs: val.durationMs ?? 10 };
      }
    }

    throw new Error(
      `MockSSH: unexpected command "${command}"\n` +
      `Available commands:\n${[...this.commands.keys()].map(k => `  - "${k}"`).join('\n')}`,
    );
  }

  /** Get the log of all exec calls for assertions */
  get execLog(): ReadonlyArray<{ serverId: string; command: string }> {
    return this._execLog;
  }

  /** Reset the exec log */
  resetLog(): void {
    this._execLog = [];
  }
}

// ── Canned Server Context Outputs ──

/**
 * Realistic Ubuntu 22.04 server outputs for get_server_context commands.
 * These match the commands in server/src/agent/tools/get-server-context.ts.
 */
export function createUbuntuServerOutputs(): Map<string, MockExecResult> {
  const ok = (stdout: string): MockExecResult => ({
    exitCode: 0, stdout, stderr: '',
  });

  const fail = (stderr: string): MockExecResult => ({
    exitCode: 1, stdout: '', stderr,
  });

  return new Map<string, MockExecResult>([
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
    // Note: nginx -v outputs to stderr (this is real nginx behavior)

    // ── Additional exec_command outputs ──
    ['uname -a', ok('Linux web-prod-01 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux')],

    ['top -bn1 | head -5', ok(
`top - 10:32:45 up 42 days,  3:15,  2 users,  load average: 0.45, 0.38, 0.32
Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie
%Cpu(s): 45.2 us,  3.1 sy,  0.0 ni, 50.8 id,  0.2 wa,  0.0 hi,  0.7 si,  0.0 st
MiB Mem :   7987.4 total,    318.2 free,   6348.8 used,   1320.4 buff/cache
MiB Swap:   2048.0 total,   1536.0 free,    512.0 used.   1278.6 avail Mem`)],

    ['ps aux | head -1', ok('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND')],

    ['cat /proc/loadavg', ok('0.45 0.38 0.32 1/142 45321')],

    ['cat /proc/cpuinfo', ok(
`processor	: 0
model name	: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz		: 2300.000
cache size	: 46080 KB
cpu cores	: 4

processor	: 1
model name	: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz		: 2300.000
cache size	: 46080 KB
cpu cores	: 4

processor	: 2
model name	: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz		: 2300.000
cache size	: 46080 KB
cpu cores	: 4

processor	: 3
model name	: Intel(R) Xeon(R) CPU E5-2686 v4 @ 2.30GHz
cpu MHz		: 2300.000
cache size	: 46080 KB
cpu cores	: 4`)],
  ]);
}
