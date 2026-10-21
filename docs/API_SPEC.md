# API Specification

> Complete REST + WebSocket API reference for HeadlessOS backend.

## Base Configuration

| Property | Value |
|----------|-------|
| Base URL | `http://localhost:3001` |
| WebSocket URL | `ws://localhost:3001` |
| Content Type | `application/json` |
| Auth | None (localhost only — see SECURITY.md) |

## Response Envelope

All REST responses follow this shape:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    parsedBy: 'deterministic' | 'llm' | 'json' | 'sftp';
    latencyMs: number;
    cached: boolean;
  };
}
```

Errors return HTTP status codes:
- `400` — Bad request (invalid params, path traversal attempt)
- `404` — Server not found, resource not found
- `409` — Conflict (server not connected)
- `500` — Internal error (SSH failure, LLM failure)
- `504` — Command timeout

---

## Health

### `GET /health`

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600
}
```

---

## Server Management

### `GET /api/servers`

List all configured servers.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "srv_abc123",
      "name": "My VPS",
      "host": "203.0.113.10",
      "port": 22,
      "username": "root",
      "authMethod": "privateKey",
      "status": "connected",
      "detectedTools": ["docker", "git", "systemctl"]
    }
  ]
}
```

### `POST /api/servers`

Add a new server configuration.

**Request:**
```json
{
  "name": "My VPS",
  "host": "203.0.113.10",
  "port": 22,
  "username": "root",
  "authMethod": "privateKey",
  "privateKeyPath": "~/.ssh/id_rsa"
}
```

**Response:** `201 Created` with the created server (including generated `id`).

### `PUT /api/servers/:id`

Update server configuration. Partial update (only send fields to change).

**Request:**
```json
{
  "name": "Production VPS"
}
```

### `DELETE /api/servers/:id`

Remove server configuration. Disconnects if currently connected.

**Response:** `204 No Content`

### `POST /api/servers/:id/connect`

Initiate SSH connection to the server.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "connected",
    "detectedTools": ["docker", "git", "systemctl", "nginx"]
  }
}
```

**Error (auth failure):**
```json
{
  "success": false,
  "error": "Authentication failed: All configured authentication methods failed"
}
```

### `POST /api/servers/:id/disconnect`

Close SSH connection.

**Response:**
```json
{
  "success": true,
  "data": { "status": "disconnected" }
}
```

### `GET /api/servers/:id/status`

Get current connection state.

**Response:**
```json
{
  "success": true,
  "data": {
    "serverId": "srv_abc123",
    "status": "connected",
    "connectedAt": "2026-04-04T10:30:00Z",
    "detectedTools": ["docker", "git", "systemctl"]
  }
}
```

### `GET /api/servers/:id/apps`

Get available apps for this server (based on detected tools).

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "system", "name": "System", "icon": "monitor", "available": true },
    { "id": "files", "name": "Files", "icon": "folder", "available": true },
    { "id": "docker", "name": "Docker", "icon": "container", "available": true },
    { "id": "processes", "name": "Processes", "icon": "activity", "available": true },
    { "id": "services", "name": "Services", "icon": "settings", "available": true },
    { "id": "git", "name": "Git", "icon": "git-branch", "available": false }
  ]
}
```

---

## System Dashboard

### `GET /api/servers/:id/system`

Full system dashboard data (runs multiple commands in parallel).

**Response:**
```json
{
  "success": true,
  "data": {
    "system": {
      "hostname": "vps-prod-01",
      "uptime": "45 days, 3:22",
      "os": "Ubuntu 24.04 LTS",
      "kernel": "6.8.0-45-generic",
      "architecture": "x86_64"
    },
    "disks": [
      {
        "filesystem": "/dev/sda1",
        "size": "50G",
        "used": "23G",
        "available": "25G",
        "usePercent": 48,
        "mountPoint": "/"
      }
    ],
    "memory": {
      "totalMb": 4096,
      "usedMb": 2800,
      "freeMb": 300,
      "availableMb": 1296,
      "swapTotalMb": 2048,
      "swapUsedMb": 100
    },
    "network": [
      {
        "name": "eth0",
        "status": "UP",
        "ipAddresses": ["10.0.0.5/24", "fe80::1/64"]
      }
    ]
  },
  "meta": {
    "parsedBy": "llm",
    "latencyMs": 2340,
    "cached": false
  }
}
```

### `GET /api/servers/:id/system/disk`

Disk usage only.

### `GET /api/servers/:id/system/memory`

Memory info only.

---

## File Explorer

### `GET /api/servers/:id/files`

List directory contents.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | `/` | Absolute path to list |
| `showHidden` | boolean | `true` | Include dotfiles |

**Response:**
```json
{
  "success": true,
  "data": {
    "currentPath": "/var/log",
    "parentPath": "/var",
    "entries": [
      {
        "name": "syslog",
        "type": "file",
        "permissions": "rw-r-----",
        "owner": "syslog",
        "group": "adm",
        "size": 1048576,
        "modified": "2026-04-04T08:30:00Z"
      },
      {
        "name": "nginx",
        "type": "directory",
        "permissions": "rwxr-xr-x",
        "owner": "root",
        "group": "root",
        "size": 4096,
        "modified": "2026-04-03T12:00:00Z"
      }
    ]
  }
}
```

### `GET /api/servers/:id/files/read`

Read file content.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | required | Absolute file path |
| `maxSize` | number | `1048576` | Max bytes to read (default 1MB) |
| `encoding` | string | `utf-8` | File encoding |

**Response:**
```json
{
  "success": true,
  "data": {
    "path": "/etc/nginx/nginx.conf",
    "content": "worker_processes auto;\nevents {\n...",
    "size": 2048,
    "encoding": "utf-8",
    "truncated": false
  }
}
```

### `POST /api/servers/:id/files/write`

Write/create a file.

**Request:**
```json
{
  "path": "/tmp/test.txt",
  "content": "Hello, world!",
  "createDirectories": false
}
```

### `POST /api/servers/:id/files/mkdir`

Create a directory.

**Request:**
```json
{
  "path": "/var/data/myapp",
  "recursive": true
}
```

### `POST /api/servers/:id/files/rename`

Rename or move a file/directory.

**Request:**
```json
{
  "oldPath": "/tmp/old-name.txt",
  "newPath": "/tmp/new-name.txt"
}
```

### `DELETE /api/servers/:id/files`

Delete a file or directory.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | required | Path to delete |
| `recursive` | boolean | `false` | Required for non-empty directories |

### `POST /api/servers/:id/files/upload`

Upload a file. Uses `multipart/form-data`.

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | The file to upload |
| `path` | string | Destination directory path |

### `GET /api/servers/:id/files/download`

Download a file.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `path` | string | Absolute file path |

**Response:** Binary file content with appropriate `Content-Type` and `Content-Disposition` headers.

---

## Docker

### `GET /api/servers/:id/docker/containers`

List all containers.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `all` | boolean | `true` | Include stopped containers |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123def456",
      "name": "nginx-proxy",
      "image": "nginx:latest",
      "status": "Up 3 days",
      "state": "running",
      "ports": "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp",
      "created": "2026-04-01T10:00:00Z"
    }
  ],
  "meta": { "parsedBy": "json", "latencyMs": 120, "cached": false }
}
```

### `POST /api/servers/:id/docker/containers/:containerId/start`
### `POST /api/servers/:id/docker/containers/:containerId/stop`
### `POST /api/servers/:id/docker/containers/:containerId/restart`

Container lifecycle actions. No request body needed.

**Response:**
```json
{ "success": true, "data": { "containerId": "abc123def456", "action": "stop" } }
```

### `DELETE /api/servers/:id/docker/containers/:containerId`

Remove a container.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `force` | boolean | `false` | Force remove running container |

### `GET /api/servers/:id/docker/images`

List Docker images.

### `DELETE /api/servers/:id/docker/images/:imageId`

Remove a Docker image.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `force` | boolean | `false` | Force remove |

---

## Processes

### `GET /api/servers/:id/processes`

List running processes.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sortBy` | string | `mem` | Sort field: `mem`, `cpu`, `pid` |
| `limit` | number | `50` | Max processes to return |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "pid": 1234,
      "user": "root",
      "cpuPercent": 2.5,
      "memPercent": 15.3,
      "vsz": 524288,
      "rss": 131072,
      "tty": "?",
      "stat": "Ssl",
      "startTime": "Mar28",
      "command": "/usr/bin/dockerd"
    }
  ]
}
```

### `POST /api/servers/:id/processes/:pid/kill`

Kill a process.

**Request:**
```json
{
  "signal": 9
}
```

**Validation:** `pid` must be a positive integer. Signal must be 1-31.

---

## Services (systemd)

### `GET /api/servers/:id/services`

List systemd services.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filter` | string | `all` | Filter: `all`, `active`, `inactive`, `failed` |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "nginx.service",
      "loadState": "loaded",
      "activeState": "active",
      "subState": "running",
      "description": "A high performance web server"
    }
  ]
}
```

### `POST /api/servers/:id/services/:serviceName/start`
### `POST /api/servers/:id/services/:serviceName/stop`
### `POST /api/servers/:id/services/:serviceName/restart`
### `POST /api/servers/:id/services/:serviceName/enable`
### `POST /api/servers/:id/services/:serviceName/disable`

Service lifecycle actions.

**Validation:** `serviceName` must match pattern `^[a-zA-Z0-9_@.-]+\.service$`.

---

## Generic Command Execution

### `POST /api/servers/:id/exec`

Execute an arbitrary command (with safety constraints).

**Request:**
```json
{
  "command": "cat /etc/os-release",
  "timeout": 10000,
  "parseSchema": "auto"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "stdout": "PRETTY_NAME=\"Ubuntu 24.04 LTS\"\n...",
    "stderr": "",
    "exitCode": 0,
    "parsed": null
  },
  "meta": { "latencyMs": 85, "cached": false }
}
```

**Security:** This endpoint has a command allowlist. See [SECURITY.md](SECURITY.md). Dangerous commands (`rm -rf /`, `mkfs`, etc.) are blocked.

---

## Server Admin

All Server Admin endpoints use the prefix `/api/servers/:id/admin/`. Each section degrades gracefully — if a tool isn't installed (exit code 127), the response includes `{ available: false, message: "..." }` instead of an error.

### `GET /api/servers/:id/admin/network`

Network information: listening ports, routes, DNS, active connections.

**Response:**
```json
{
  "success": true,
  "data": {
    "ports": [
      { "protocol": "tcp", "localAddress": "0.0.0.0", "localPort": 22, "process": "sshd", "pid": 1234 },
      { "protocol": "tcp", "localAddress": "0.0.0.0", "localPort": 80, "process": "nginx", "pid": 5678 }
    ],
    "routes": [
      { "destination": "default", "gateway": "10.0.0.1", "interface": "eth0", "metric": 100 }
    ],
    "dns": {
      "nameservers": ["1.1.1.1", "8.8.8.8"],
      "searchDomains": ["example.com"]
    },
    "connections": [
      { "protocol": "tcp", "localAddress": "10.0.0.5", "localPort": 22, "remoteAddress": "192.168.1.100", "remotePort": 54321, "state": "ESTAB", "process": "sshd", "pid": 1234 }
    ]
  }
}
```

### `GET /api/servers/:id/admin/firewall`

UFW firewall status and rules.

**Response:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "active": true,
    "rules": [
      { "number": 1, "to": "22/tcp", "action": "ALLOW IN", "from": "Anywhere" },
      { "number": 2, "to": "80/tcp", "action": "ALLOW IN", "from": "Anywhere" },
      { "number": 3, "to": "443/tcp", "action": "ALLOW IN", "from": "Anywhere" }
    ]
  }
}
```

**Not installed response:**
```json
{
  "success": true,
  "data": {
    "available": false,
    "active": false,
    "rules": [],
    "message": "UFW is not installed. Install with: sudo apt install ufw"
  }
}
```

### `POST /api/servers/:id/admin/firewall/rules`

Add a firewall rule.

**Request:**
```json
{
  "port": 8080,
  "protocol": "tcp",
  "action": "allow"
}
```

**Validation:** `port` must be 1-65535, `protocol` must be `tcp` or `udp`, `action` must be `allow` or `deny`.

### `DELETE /api/servers/:id/admin/firewall/rules/:num`

Delete a firewall rule by number.

**Validation:** `num` must be a positive integer matching a rule number from `ufw status numbered`.

### `POST /api/servers/:id/admin/firewall/toggle`

Enable or disable the firewall.

**Request:**
```json
{
  "enable": true
}
```

### `GET /api/servers/:id/admin/security`

Security overview: users, active sessions, login history, SSH config.

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      { "username": "root", "uid": 0, "gid": 0, "home": "/root", "shell": "/bin/bash" },
      { "username": "testuser", "uid": 1000, "gid": 1000, "home": "/home/testuser", "shell": "/bin/bash" }
    ],
    "sessions": [
      { "user": "testuser", "terminal": "pts/0", "loginTime": "2026-04-05 10:30", "remoteHost": "192.168.1.100" }
    ],
    "loginHistory": [
      { "user": "testuser", "terminal": "pts/0", "remoteHost": "192.168.1.100", "loginTime": "Sat Apr  5 10:30", "logoutTime": "still logged in", "duration": "" }
    ],
    "sshConfig": {
      "port": "22",
      "permitRootLogin": "prohibit-password",
      "passwordAuthentication": "yes",
      "pubkeyAuthentication": "yes",
      "maxAuthTries": "6",
      "x11Forwarding": "yes"
    },
    "fail2ban": { "available": false, "message": "fail2ban not installed" }
  }
}
```

### `GET /api/servers/:id/admin/webserver`

Web server (nginx) information.

**Response:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "sites": [
      { "name": "default", "enabled": true },
      { "name": "my-app.conf", "enabled": true },
      { "name": "staging.conf", "enabled": false }
    ],
    "configTest": { "success": true, "output": "nginx: configuration file /etc/nginx/nginx.conf test is successful" },
    "sslCertificates": [
      { "domain": "example.com", "expiry": "2026-07-01", "issuer": "Let's Encrypt", "daysRemaining": 87 }
    ]
  }
}
```

### `GET /api/servers/:id/admin/packages`

Package information (APT/dpkg).

**Response:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "totalInstalled": 487,
    "upgradable": [
      { "name": "openssl", "currentVersion": "3.0.2-0ubuntu1.14", "newVersion": "3.0.2-0ubuntu1.15", "architecture": "amd64" }
    ]
  }
}
```

### `GET /api/servers/:id/admin/cron`

Cron jobs.

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      { "schedule": "0 2 * * *", "command": "/usr/local/bin/backup.sh", "source": "user:testuser", "description": "At 02:00 every day" },
      { "schedule": "*/5 * * * *", "command": "/usr/bin/healthcheck", "source": "system:/etc/cron.d/healthcheck", "description": "Every 5 minutes" }
    ]
  }
}
```

### `GET /api/servers/:id/admin/logs`

System logs with filtering.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `source` | string | `journal` | Log source: `journal`, `dmesg`, `syslog` |
| `unit` | string | `""` | Systemd unit filter (journal only), e.g. `nginx.service` |
| `lines` | number | `100` | Number of log lines to retrieve (max 500) |

**Response:**
```json
{
  "success": true,
  "data": {
    "source": "journal",
    "entries": [
      { "timestamp": "2026-04-05T10:30:15Z", "unit": "nginx.service", "priority": "info", "message": "Started A high performance web server." }
    ]
  }
}
```

### `GET /api/servers/:id/admin/storage`

Storage information: directory sizes, mount points, swap.

**Response:**
```json
{
  "success": true,
  "data": {
    "dirSizes": [
      { "path": "/home/testuser", "size": "2.3G" },
      { "path": "/var/log", "size": "456M" },
      { "path": "/tmp", "size": "12M" }
    ],
    "mounts": [
      { "target": "/", "source": "/dev/sda1", "fstype": "ext4", "options": "rw,relatime" }
    ],
    "swap": [
      { "name": "/swap.img", "type": "file", "size": "2G", "used": "128M", "priority": -2 }
    ]
  }
}
```

---

## Agent Actions & Approvals (EX9, ADR-024)

Agents and generated view buttons run typed **catalog actions**
(`server/src/agent/actions/`), never command text. Actions that change a server
(`risk: 'change'`) wait for the owner's approval; every asked / answered / ran
event is appended to `~/.headlessos/audit/actions.jsonl`.

### `POST /api/servers/:id/agent/investigate`

Body: `{ question, maxSteps?, sessionId?, readOnly? }`. `readOnly` defaults to
`true`; only an explicit `false` offers change actions, each of which pauses the
run with an approval card. Progress events on `/ws/agent/:id/:sessionId`:

```json
{ "kind": "thought", "step": 1, "thought": "…", "decision": "run_action", "action": "service_restart", "command": "sudo -n systemctl restart -- nginx" }
{ "kind": "approval", "step": 1, "request": { "approvalId": "…", "command": "…", "serverName": "web-1", "host": "10.0.0.5", "loginUser": "deploy", "reason": "…", "title": "Restart service", "expiresAt": "…" } }
{ "kind": "approval_resolved", "step": 1, "approvalId": "…", "decision": "allow", "by": "owner" }
{ "kind": "step", "step": 1, "data": { "stepNumber": 1, "action": "service_restart", "command": "…", "approval": { "decision": "allow", "by": "owner" } } }
```

### `POST /api/servers/:id/agent/approvals/:approvalId`

Body: `{ "decision": "allow" | "deny" }` → `{ success, approvalId, decision, by }`.
404 when the approval is unknown, already answered, expired (10 min) or for another
server. Stop (`POST /api/servers/:id/agent/:sessionId/abort`) denies every approval
the run is waiting on.

### `POST /api/servers/:id/actions/preview`

Body: `{ actionId, params, label? }` (generated view buttons; `{column}` placeholders
already filled by the client). Read action → `{ success, risk: "read", command }`.
Change action → records exactly what would run and returns the card:
`{ success, risk: "change", command, approval: { approvalId, … } }`. The reason is
the button label. 400 with a "field: expected …, you sent …" message on bad params.

### `POST /api/servers/:id/actions/run`

Body: `{ actionId, params }` for a read action, or `{ approvalId }` for an approved
change — the server runs the command it recorded at preview time, once. A change
action sent by id returns 409; a used/expired approval 404.

### `POST /api/servers/:id/actions/approvals/:approvalId/deny`

Drops a staged view approval. → `{ success, decision: "deny", by: "owner" }`.

### `GET /api/llm/config` · `PUT /api/llm/config` (EX9.3: Ollama)

`PUT` body for a local model: `{ "provider": "ollama", "ollama": { "baseUrl": "http://127.0.0.1:11434", "model": "qwen3:8b", "allowRemote"?: true } }`.
The server checks the URL (http/https, loopback unless `allowRemote`), that Ollama
answers and that the model is installed (`name` or `name:latest`), then reads its
context length. Response `data`: `{ provider: "ollama", model, hasApiKey: true, keySource: null, ollama: { baseUrl, model, contextWindow }, persisted }`.
Switching back to `{ provider: "openai", model }` needs no key while one is saved.

### `GET /api/llm/ollama/models?baseUrl=…&allowRemote=true`

Installed models (`/api/tags`): `[{ name, parameterSize?, family?, sizeBytes? }]`, or
`{ success: false, error }` when the URL is refused or Ollama does not answer.

### `POST /api/servers/:id/dynamic-ui/execute-action` (legacy)

Buttons generated before EX9 carry command text. The command must still match the
classic allowlist, and since EX9.2 only rules with risk `none`/`low` run; anything
that would change the server returns 403 ("regenerate the view").

---

## WebSocket Endpoints

### `ws://localhost:3001/ws/terminal/:serverId`

Interactive SSH terminal session.

**Protocol:**
- Client → Server: Raw terminal input (keystrokes)
- Client → Server: Resize events prefixed with `RESIZE:rows,cols`
- Server → Client: Raw terminal output (includes ANSI escape sequences)

**Connection lifecycle:**
1. Client opens WebSocket connection
2. Server creates SSH shell channel with PTY
3. Bidirectional stream begins
4. Close either side → both sides close

### `ws://localhost:3001/ws/docker/:serverId/logs/:containerId`

Stream Docker container logs in real-time.

**Protocol:**
- Server → Client: Log lines as they appear
- Client → Server: `{ "action": "stop" }` to stop streaming

**Implementation:** Runs `docker logs -f --tail 200 <containerId>` via SSH exec.

### `ws://localhost:3001/ws/events/:serverId`

Server-sent events channel for real-time updates.

**Messages (Server → Client):**
```json
{ "type": "connection", "data": { "status": "disconnected" } }
{ "type": "tool-detected", "data": { "tools": ["docker", "nginx"] } }
{ "type": "alert", "data": { "level": "warning", "message": "Disk usage above 90%" } }
```

---

## Configuration

### `GET /api/config`

Get application configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "llm": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "visionModel": "gpt-4o-mini"
    },
    "ui": {
      "theme": "dark",
      "terminalFontSize": 14,
      "defaultShell": "/bin/bash"
    },
    "polling": {
      "systemInterval": 30000,
      "dockerInterval": 10000,
      "processInterval": 15000
    }
  }
}
```

### `PUT /api/config`

Update application configuration. Partial update.

**Request:**
```json
{
  "llm": { "provider": "ollama", "model": "qwen3:8b" }
}
```
