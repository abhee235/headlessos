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
 * EX9.1: keys are the exact commands the catalog actions build
 * (server/src/agent/actions/catalog/), as get_server_context runs actions.
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

    ['which nginx', fail('')],
    // Note: nginx -v outputs to stderr (this is real nginx behavior)

    // ── Additional exec_command outputs ──
    ['uname -a', ok('Linux web-prod-01 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux')],

    ['ps aux --sort=-%cpu', ok(
`USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
postgres     890 18.5 12.4 2201840 512000 ?     Ss   Apr03  42:10 postgres: main
node        1501 12.3  8.2 1887436 262144 ?     Sl   Apr03  31:02 node /app/server.js
www-data    1234  5.7  2.8 131072  46080 ?      S    Apr03   9:44 nginx: worker process
root           1  0.0  0.1 167744  11264 ?      Ss   Apr03   0:12 /sbin/init`)],

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
