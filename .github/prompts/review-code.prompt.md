---
description: "Security-focused code review following project threat model"
mode: "agent"
---

# Security Code Review

Perform a security-focused review of the specified code, following the project's threat model in [docs/SECURITY.md](../../docs/SECURITY.md).

## Review checklist

### Command Injection
- [ ] No user input interpolated into shell commands (`exec(\`ls ${path}\`)` is FORBIDDEN)
- [ ] All paths validated with `validatePath()` — no traversal (`../`)
- [ ] Container IDs validated: hex only (`/^[a-f0-9]+$/`)
- [ ] PIDs validated: integer only (`/^\d+$/`)
- [ ] Service names validated: alphanumeric + hyphen + underscore only
- [ ] `shellEscape()` used on all dynamic command arguments

### File Operations
- [ ] All file read/write/delete/rename use SFTP — no `exec('cat ...')` or `exec('rm ...')`
- [ ] No SFTP path traversal possible

### SSH Channel Safety
- [ ] `exec()` channels have timeouts set
- [ ] Channels are closed after use — no leaks
- [ ] No channel reuse across requests

### API Route Security
- [ ] All request parameters validated with Zod schemas
- [ ] No raw SSH errors exposed to client — messages sanitized
- [ ] Fastify schema validation used

### Frontend Security
- [ ] No `dangerouslySetInnerHTML` with terminal/server output
- [ ] Terminal output rendered only via xterm.js
- [ ] No direct calls to remote servers from frontend

### LLM Safety
- [ ] ANSI codes stripped before sending to LLM
- [ ] LLM responses validated with Zod `.parse()`
- [ ] No LLM-suggested commands executed without allowlist check

### Command Orchestrator
- [ ] Retry limits enforced (max 2)
- [ ] No circular fallback chains
- [ ] Commands from registered builders only

## Code to review

{input}
