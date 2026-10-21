# Security Model

> Threat model, mitigations, and security rules for HeadlessOS.

## Threat Model

HeadlessOS is a **local application** that executes commands on remote servers via SSH. The primary threat is: **if the local app is compromised, the attacker gains SSH access to all configured servers.**

### Attack Surface

```
┌───────────────┐     ┌──────────────┐     ┌─────────────┐
│               │     │              │     │             │
│   Browser     │────▶│  Fastify     │────▶│  VPS via    │
│  (localhost)  │     │  Backend     │     │  SSH        │
│               │     │  (localhost) │     │             │
└───────────────┘     └──────────────┘     └─────────────┘
       │                     │                    │
  Attack vectors:       Attack vectors:      Attack vectors:
  - XSS                 - Command injection  - SSH credential theft
  - CSRF                - Path traversal     - Privilege escalation
  - Malicious input     - SSRF               - Data exfiltration
```

### Severity Levels

| Threat | Severity | Likelihood | Impact |
|--------|----------|------------|--------|
| Command injection via user input | **CRITICAL** | Medium | Full server compromise |
| Path traversal in file operations | **HIGH** | Medium | Read/write any file on server |
| SSH credential theft (local file read) | **HIGH** | Low | Access to all servers |
| XSS in rendered terminal output | **MEDIUM** | Medium | Local app compromise |
| Denial of service (fork bomb command) | **MEDIUM** | Low | Server becomes unresponsive |
| LLM prompt injection via terminal output | **LOW** | Low | Incorrect data display |

---

## Mitigation Rules

### 1. NEVER Interpolate User Input Into Shell Commands

**THE MOST IMPORTANT RULE.** This is the #1 security vulnerability in this system.

```typescript
// ❌ NEVER DO THIS
const command = `docker stop ${userInput}`;
await ssh.exec(command);

// ❌ NEVER DO THIS EITHER
const command = `ls -la ${filePath}`;
await ssh.exec(command);

// ✅ ALWAYS validate and use parameterized templates
const containerId = validateContainerId(userInput); // must match /^[a-f0-9]{12,64}$/
const command = `docker stop ${containerId}`;
await ssh.exec(command);

// ✅ FOR FILE PATHS — validate, normalize, check for traversal
const safePath = validateAndSanitizePath(userInput);
await sftp.readdir(safePath); // Use SFTP API, not shell commands for files
```

### 2. Input Validation Rules

Every user-provided parameter MUST be validated before use in a command:

| Parameter Type | Validation Rule | Regex |
|----------------|----------------|-------|
| Container ID | Hex string, 12-64 chars | `/^[a-f0-9]{12,64}$/` |
| Image ID | Hex string, 12-64 chars (or name:tag) | `/^[a-f0-9]{12,64}$\|^[\w.-]+\/[\w.-]+(:\S+)?$/` |
| PID | Positive integer, 1-32768 | `/^[1-9]\d{0,4}$/` |
| Service name | Alphanumeric + limited special chars | `/^[a-zA-Z0-9_@.-]+\.service$/` |
| File path | Absolute path, no traversal | See path validation below |
| Signal number | Integer 1-31 | `/^([1-9]\|[12]\d\|3[01])$/` |

### 3. Path Validation

```typescript
function validatePath(inputPath: string): string {
  // 1. Must be absolute
  if (!inputPath.startsWith('/')) {
    throw new SecurityError('Path must be absolute');
  }

  // 2. Normalize (resolve .., ., //)
  const normalized = path.posix.normalize(inputPath);

  // 3. Check for traversal AFTER normalization
  if (normalized.includes('..')) {
    throw new SecurityError('Path traversal detected');
  }

  // 4. Block known dangerous paths (optional, configurable)
  const blockedPaths = ['/proc/sysrq-trigger', '/dev/sda'];
  if (blockedPaths.some(p => normalized.startsWith(p))) {
    throw new SecurityError('Access to this path is restricted');
  }

  // 5. Check for null bytes (bypass attempt)
  if (normalized.includes('\0')) {
    throw new SecurityError('Null byte in path');
  }

  return normalized;
}
```

### 4. Command Allowlists

**For direct exec endpoints**, only allow pre-approved commands:

```typescript
const ALLOWED_COMMANDS = new Map<string, CommandRule>([
  // System info (read-only, safe)
  ['hostname', { pattern: /^hostname$/, risk: 'none' }],
  ['uptime', { pattern: /^uptime$/, risk: 'none' }],
  ['uname', { pattern: /^uname\s+-[a-z]+$/, risk: 'none' }],
  ['df', { pattern: /^df\s+-h/, risk: 'none' }],
  ['free', { pattern: /^free\s+-[mhg]$/, risk: 'none' }],
  ['ip', { pattern: /^ip\s+(-brief\s+)?addr/, risk: 'none' }],
  ['ps', { pattern: /^ps\s+aux/, risk: 'none' }],
  ['cat /proc/cpuinfo', { pattern: /^cat\s+\/proc\/cpuinfo/, risk: 'none' }],

  // Docker (medium risk — state changes)
  ['docker ps', { pattern: /^docker\s+ps/, risk: 'low' }],
  ['docker images', { pattern: /^docker\s+images/, risk: 'low' }],
  ['docker start', { pattern: /^docker\s+start\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker stop', { pattern: /^docker\s+stop\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker restart', { pattern: /^docker\s+restart\s+[a-f0-9]{12,64}$/, risk: 'medium' }],
  ['docker rm', { pattern: /^docker\s+rm\s+[a-f0-9]{12,64}$/, risk: 'high' }],
  ['docker logs', { pattern: /^docker\s+logs\s+/, risk: 'low' }],

  // systemctl (high risk — service management)
  ['systemctl list-units', { pattern: /^systemctl\s+list-units/, risk: 'low' }],
  ['systemctl start', { pattern: /^(sudo\s+)?systemctl\s+start\s+[\w@.-]+\.service$/, risk: 'high' }],
  ['systemctl stop', { pattern: /^(sudo\s+)?systemctl\s+stop\s+[\w@.-]+\.service$/, risk: 'high' }],
  ['systemctl restart', { pattern: /^(sudo\s+)?systemctl\s+restart\s+[\w@.-]+\.service$/, risk: 'high' }],

  // Process management (high risk)
  ['kill', { pattern: /^kill\s+-\d{1,2}\s+\d{1,5}$/, risk: 'high' }],
]);

// Commands that are NEVER allowed, even via generic exec endpoint
const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\/\b/,          // rm -rf /
  /\bmkfs\b/,                     // format filesystem
  /\bdd\s+.*of=\/dev\//,         // write to raw device
  /\b>\s*\/dev\/sd/,             // redirect to disk
  /\bshutdown\b/,                // shutdown server
  /\breboot\b/,                  // reboot server
  /\bchmod\s+777\s+\//,         // recursive chmod 777 from root
  /\bcurl\b.*\|\s*bash/,        // pipe curl to bash
  /\bwget\b.*\|\s*bash/,        // pipe wget to bash
  /\b:()\{.*\};\s*:/,           // fork bomb
  /\bpasswd\b/,                  // change password
  /\buseradd\b/,                 // add user
  /\buserdel\b/,                 // delete user
];
```

### 4b. Agents: Typed Actions Only (ADR-024, EX9)

The allowlists above are for classic app routes, whose commands are written in our
code. **Agents never send command text.** They call actions from the catalog in
`server/src/agent/actions/`; the server validates parameters with strict Zod
schemas, builds argv in code and quotes every element. Inside an agent run,
`CommandPolicy` rejects any command the action runner did not build and grant, in
every policy mode. Actions that change a server wait for the owner's approval
(full command, server, login user, reason) and are logged to
`~/.headlessos/audit/actions.jsonl`. See [phases/phase-ex9.md](phases/phase-ex9.md).

Action output is treated as untrusted (EX9.5). Secrets are removed before the owner or
the model sees it (`agent/actions/redact.ts`). The model gets it inside
`<server_output>…</server_output>`, and both agents' prompts say text there is data,
never instructions. Redaction is pattern-based: it lowers the chance of a secret
reaching an LLM provider but does not guarantee it. A model still cannot run anything
outside the catalog, and changes still need approval.

### 5. File Operations: Always Use SFTP

For file operations (read, write, delete, rename), **always use SFTP API** instead of shell commands:

```typescript
// ❌ DANGEROUS: shell command for file operations
await ssh.exec(`cat ${filePath}`);
await ssh.exec(`rm ${filePath}`);
await ssh.exec(`mv ${oldPath} ${newPath}`);

// ✅ SAFE: SFTP API (no shell interpretation)
await sftp.readFile(validatedPath);
await sftp.unlink(validatedPath);
await sftp.rename(validatedOldPath, validatedNewPath);
```

SFTP does not go through a shell, so there's no command injection risk.

### 6. Credential Storage

SSH credentials stored in `~/.headlessos/servers.json`:

- **Passwords:** Encrypted using AES-256-GCM with a key derived from machine-specific data (`os.hostname()` + `os.userInfo().uid` + app-specific salt)
- **Private keys:** Referenced by path only (not stored, read at connection time)
- **API keys (LLM):** A key saved in Settings → AI is stored in `~/.headlessos/llm.json` (0600), AES-256-GCM encrypted like passwords (per-install secret in `~/.headlessos/enc-key` + machine facts); never returned by the API. It wins over `OPENAI_API_KEY` in `.env`, which stays plaintext. Choosing None deletes it (EX8.22).
- **File permissions:** `~/.headlessos/` directory is `0700` (owner only)

**Note:** This is baseline security for a local tool. It's not bulletproof against a determined local attacker with root access, but it prevents casual reading of credentials.

### 7. XSS Prevention

Terminal output could contain malicious content designed to be rendered as HTML:

```typescript
// When displaying terminal output in React:
// React auto-escapes by default — but be careful with:
// - dangerouslySetInnerHTML (NEVER use with terminal output)
// - xterm.js (renders ANSI escapes safely — this is fine)
// - Custom renderers that inject HTML

// Rule: Terminal output goes through xterm.js ONLY.
// Parsed data goes through React components ONLY (which auto-escape).
// Never render raw terminal output as HTML.
```

### 8. Network Security

- Backend listens on `localhost:3001` ONLY (not `0.0.0.0`)
- No external network access except:
  - SSH connections to configured servers (port 22)
  - LLM API calls (api.openai.com, etc.)
  - Ollama (localhost:11434, if configured)
- CORS: allow `localhost:3000` only

```typescript
// Fastify configuration
fastify.register(cors, {
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// Listen on localhost only
await fastify.listen({ port: 3001, host: '127.0.0.1' });
```

### 9. Rate Limiting

Prevent runaway command execution:

| Endpoint | Limit |
|----------|-------|
| `POST /api/servers/:id/exec` | 30 requests/minute |
| `POST /api/servers/:id/docker/*/stop` | 10 requests/minute |
| `DELETE /api/servers/:id/files` | 20 requests/minute |
| `POST /api/servers/:id/processes/:pid/kill` | 10 requests/minute |

### 10. Audit Logging

Log every command executed on a server:

```typescript
interface AuditEntry {
  timestamp: string;
  serverId: string;
  command: string;
  source: 'app' | 'terminal' | 'action';  // who initiated
  exitCode: number;
  durationMs: number;
  userId?: string;    // for future multi-user support
}

// Stored in: ~/.headlessos/logs/audit.jsonl
// One JSON object per line (JSONL format)
```

---

## Security Checklist

Before releasing any feature:

- [ ] All user inputs validated before use in commands
- [ ] No string interpolation in shell commands without validation
- [ ] File operations use SFTP, not shell commands
- [ ] File paths normalized via `validateAndSanitizePath` and operated on as normalized (null-byte-free, absolute, `BLOCKED_PATHS` enforced). NOTE: the file manager intentionally allows any absolute path the SSH account can reach — access is bounded by the server's own Unix permissions, not by path confinement. See `docs/SECURITY_AUDIT.md`.
- [ ] Destructive actions require confirmation
- [ ] Command allowlist covers the new feature
- [ ] Audit logging covers the new endpoints
- [ ] No `dangerouslySetInnerHTML` with untrusted data
- [ ] Backend only listens on localhost

## Future: Multi-User & Remote Access

If HeadlessOS is ever exposed beyond localhost (e.g., as a web service):
- Add authentication (session tokens, OAuth)
- Add RBAC (role-based access control): admin, operator, viewer
- Add CSRF protection
- Use TLS/HTTPS
- Add per-user audit trails
- Add per-user server access permissions

**This is NOT in scope for MVP.** The current security model assumes single-user, localhost access only.
