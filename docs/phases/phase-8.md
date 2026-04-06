# Phase 8: Server Admin CRUD Operations

> **Milestone:** M8  
> **Goal:** Extend the read-only Server Admin app (M7.2) with full management capabilities — CRUD for each section.  
> **Approach:** One section at a time. Each task adds backend endpoints + frontend UI + tests + security validation.  
> **Architecture:** All write operations go through the existing SSH `exec()` pipeline with command allowlist validation (M5.1).

---

## Current State (from M7.2)

| Section | Read | Create | Update | Delete | Notes |
|---------|------|--------|--------|--------|-------|
| Network | ✅ | - | - | - | Read-only |
| Firewall | ✅ | ✅ | ✅ | ✅ | Simple port/proto rules only |
| Security | ✅ | - | - | - | Read-only |
| Web Server | ✅ | - | - | - | Read-only |
| Packages | ✅ | - | - | - | Read-only |
| Cron | ✅ | - | - | - | Read-only |
| Logs | ✅ | - | - | - | Read with query filters |
| Storage | ✅ | - | - | - | Read-only |

---

## M8.1: Fail2ban Management

**Extends:** Security section → Fail2ban tab  
**Priority:** High (user specifically requested this)

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| GET | `/api/servers/:id/admin/fail2ban/jails/:jail` | Jail detail (banned IPs, stats) | `sudo fail2ban-client status <jail>` |
| POST | `/api/servers/:id/admin/fail2ban/ban` | Ban an IP in a jail | `sudo fail2ban-client set <jail> banip <ip>` |
| POST | `/api/servers/:id/admin/fail2ban/unban` | Unban an IP from a jail | `sudo fail2ban-client set <jail> unbanip <ip>` |
| POST | `/api/servers/:id/admin/fail2ban/reload` | Reload fail2ban config | `sudo fail2ban-client reload` |

### Frontend Changes

- Jail list becomes **clickable** → opens jail detail view
- Jail detail: banned IP table with "Unban" button per row
- "Ban IP" form: IP input + jail selector
- Jail stats: currently banned count, total banned, currently failed
- Reload button in toolbar

### Parsers Needed

- `parseFail2banJailStatus(raw: string)` — parses `sudo fail2ban-client status <jail>` output
  - Extracts: currently failed, total failed, currently banned, total banned, banned IP list, file list, filter

### Zod Schemas

```typescript
Fail2banJailDetailSchema = z.object({
  jail: z.string(),
  currentlyFailed: z.number(),
  totalFailed: z.number(),
  currentlyBanned: z.number(),
  totalBanned: z.number(),
  bannedIps: z.array(z.string()),
  fileList: z.array(z.string()),
  filter: z.string(),
});
```

### Security

- Validate IP format (`validateIpAddress()` — new validator)
- Validate jail name (alphanumeric + hyphen only)
- All commands on allowlist
- No user input interpolated into commands without validation

---

## M8.2: Firewall Advanced Rules

**Extends:** Firewall section (already has basic CRUD)

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/firewall/advanced` | Add complex rule | `sudo ufw allow from <ip> to any port <port> proto <proto>` |
| GET | `/api/servers/:id/admin/firewall/apps` | List app profiles | `sudo ufw app list` |
| POST | `/api/servers/:id/admin/firewall/app` | Allow/deny app profile | `sudo ufw allow <app>` |

### Frontend Changes

- "Advanced Rule" tab in add-rule form: source IP, dest IP, port range, comment
- App profiles dropdown
- Rule table: add comment column, source/dest columns

### Security

- Validate CIDR notation
- Validate port ranges (e.g., `8000:9000`)

---

## M8.3: Nginx Site Management

**Extends:** Web Server section

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/nginx/sites/:site/enable` | Enable site | `sudo ln -sf /etc/nginx/sites-available/<site> /etc/nginx/sites-enabled/<site>` |
| POST | `/api/servers/:id/admin/nginx/sites/:site/disable` | Disable site | `sudo rm /etc/nginx/sites-enabled/<site>` |
| POST | `/api/servers/:id/admin/nginx/reload` | Reload nginx | `sudo nginx -s reload` |
| POST | `/api/servers/:id/admin/nginx/restart` | Restart nginx | `sudo systemctl restart nginx` |
| GET | `/api/servers/:id/admin/nginx/sites/:site/config` | Read site config | `sudo cat /etc/nginx/sites-available/<site>` via SFTP |
| POST | `/api/servers/:id/admin/nginx/test` | Test config | `sudo nginx -t 2>&1` |

### Frontend Changes

- Sites table: add Enable/Disable toggle buttons per row
- Reload / Restart buttons in nginx toolbar
- Config viewer (read-only code view with syntax highlighting concept — monospace pre block)
- "Test Config" button with inline result display

### Security

- Site name validation: alphanumeric + hyphen + dot only, no path traversal
- Use SFTP for file reads where possible

---

## M8.4: Package Management

**Extends:** Packages section

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/packages/update` | Update package lists | `sudo apt update` |
| POST | `/api/servers/:id/admin/packages/upgrade` | Upgrade specific package | `sudo apt install -y <package>` |
| POST | `/api/servers/:id/admin/packages/upgrade-all` | Upgrade all packages | `sudo apt upgrade -y` |
| POST | `/api/servers/:id/admin/packages/install` | Install a package | `sudo apt install -y <package>` |
| POST | `/api/servers/:id/admin/packages/remove` | Remove a package | `sudo apt remove -y <package>` |
| GET | `/api/servers/:id/admin/packages/search` | Search packages | `apt search <query> 2>/dev/null \| head -50` |

### Frontend Changes

- "Update" button (apt update) with progress indicator
- Per-package "Upgrade" button in upgradable list
- "Upgrade All" bulk button
- Package search: input field + results list with "Install" buttons
- Installed packages: "Remove" button per package (with confirmation)

### Parsers Needed

- `parseAptSearchResults(raw: string)` — parses apt search output

### Security

- Package name validation: alphanumeric + hyphen + dot + colon + plus only
- Search query: alphanumeric + hyphen only, max 100 chars
- Confirmation required for remove/upgrade-all

---

## M8.5: Cron Job Management

**Extends:** Cron section

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/cron` | Add cron job | Append to `crontab -l` via `(crontab -l; echo "<entry>") \| crontab -` |
| DELETE | `/api/servers/:id/admin/cron/:index` | Delete cron job by index | Read crontab, remove line, rewrite |
| PUT | `/api/servers/:id/admin/cron/:index` | Edit cron job | Read crontab, replace line, rewrite |

### Frontend Changes

- "Add Job" form: schedule fields (minute, hour, day, month, weekday) + command input
- Preset schedules: "Every minute", "Hourly", "Daily", "Weekly", "Monthly"
- Per-job: Edit button (opens form pre-filled), Delete button (with confirmation)
- Human-readable schedule display (e.g., "Every day at 3:00 AM")

### Security

- Cron command validation: no pipes to dangerous commands
- Schedule field validation: valid cron syntax
- Index validation: integer, within bounds

---

## M8.6: User & Session Management

**Extends:** Security section → Users tab and Active Sessions tab

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/users` | Create user | `sudo useradd -m -s /bin/bash <username>` |
| DELETE | `/api/servers/:id/admin/users/:username` | Delete user | `sudo userdel -r <username>` |
| POST | `/api/servers/:id/admin/users/:username/password` | Set password | `echo '<username>:<password>' \| sudo chpasswd` |
| POST | `/api/servers/:id/admin/sessions/kill` | Kill session | `sudo pkill -KILL -t <tty>` |
| POST | `/api/servers/:id/admin/users/:username/groups` | Add to group | `sudo usermod -aG <group> <username>` |

### Frontend Changes

- Users tab: "Add User" button → form (username, shell, create home)
- Per-user: dropdown menu → Delete (confirm), Set Password, Manage Groups
- Active Sessions: "Kill Session" button per row
- Groups column in users table

### Security

- Username validation: lowercase alphanumeric + hyphen + underscore, 1-32 chars
- Password: never logged, never stored, sent over SSH only
- TTY validation: alphanumeric pattern (pts/0 format)
- Prevent deleting root or current user

---

## M8.7: Network Management

**Extends:** Network section

### Backend — New Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| POST | `/api/servers/:id/admin/network/hostname` | Set hostname | `sudo hostnamectl set-hostname <name>` |
| POST | `/api/servers/:id/admin/network/dns` | Set DNS | Write to `/etc/resolv.conf` via SFTP |
| POST | `/api/servers/:id/admin/network/interface/:name/up` | Bring interface up | `sudo ip link set <name> up` |
| POST | `/api/servers/:id/admin/network/interface/:name/down` | Bring interface down | `sudo ip link set <name> down` |

### Frontend Changes

- Hostname display becomes editable (pencil icon → inline edit)
- DNS: editable nameserver list (add/remove entries)
- Interface table: up/down toggle per interface (with confirmation for active connections)

### Security

- Hostname validation: RFC 1123 (alphanumeric + hyphen, 1-253 chars)
- Interface name validation: alphanumeric + hyphen + dot
- DNS IP validation: valid IPv4/IPv6

---

## M8.8: Log Enhancements

**Extends:** Logs section

### Backend — New/Modified Endpoints

| Method | Endpoint | Description | Command |
|--------|----------|-------------|---------|
| GET | `/api/servers/:id/admin/logs` | Enhanced query | Add `priority`, `since`, `until`, `grep` params |
| GET | `/api/servers/:id/admin/logs/follow` | WebSocket tail | `journalctl -f` via shell channel |
| GET | `/api/servers/:id/admin/logs/export` | Download logs | Stream log output as file download |

### Frontend Changes

- Real-time tail toggle (WebSocket-based, auto-scroll)
- Search/filter bar: regex text search within displayed logs
- Priority filter chips: Emergency, Alert, Critical, Error, Warning, Notice, Info, Debug
- Date range picker (since/until)
- Export button: download current filtered view as .txt

### Security

- Grep pattern validation: no command injection via grep params
- Date validation: ISO format only
- Priority validation: 0-7 integer

---

## Implementation Order

Recommended order based on user request and complexity:

1. **M8.1** — Fail2ban (user specifically asked for this)
2. **M8.2** — Firewall Advanced (extends existing CRUD)
3. **M8.3** — Nginx Management (high value)
4. **M8.4** — Package Management (high value)
5. **M8.5** — Cron Management (medium complexity)
6. **M8.6** — User Management (medium complexity, security-sensitive)
7. **M8.7** — Network Management (careful — can break connectivity)
8. **M8.8** — Log Enhancements (can be incremental)

---

## Security Notes

All M8 tasks involve **write operations on live servers**. Extra care required:

1. Every command MUST be on the allowlist (`server/src/security/validators.ts`)
2. Every user input MUST be validated with dedicated validators
3. Dangerous operations (delete user, remove package, bring interface down) MUST have confirmation dialogs
4. All new commands added to allowlist must be documented
5. Test with the Lima VM (`./dev/vm.sh`) before marking complete
6. Never interpolate raw user input — always use validators + shellEscape
