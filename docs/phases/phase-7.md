# Phase 7: System Settings

> **Milestone:** M7 | **Est. Effort:** Medium | **Depends on:** M1 (SSH, ConfigStore), M6.4 (Theme)
>
> Extends the existing `SettingsView.tsx` (macOS System Settings-style) with 6 new functional pages.
> All settings persist via Zustand + localStorage (client) or `~/.headlessos/config.json` (server).

---

## Overview

HeadlessOS currently has a Settings window with 3 pages (Wallpaper, Appearance, About), but most options are non-functional placeholders. This phase adds **real, functional settings** that affect app behavior, organized into 6 tasks.

### Architecture

```
Client (Zustand stores + localStorage)        Server (ConfigStore + JSON file)
─────────────────────────────────────         ────────────────────────────────
preferences-store.ts                          ~/.headlessos/config.json
  → terminal: font, cursor, scrollback         → llm: provider, model, apiKey
  → appearance: accent color, icon size         → general: defaultShell, timeout
  → general: autoRefresh, notifications         → (servers already in servers.json)
                                               
theme-store.ts                                REST API:
  → theme: dark | light | auto                  GET  /api/settings
                                                PUT  /api/settings
app-store.ts                                    POST /api/settings/test-llm
  → servers[] (CRUD via API)                    GET  /api/settings/llm-stats
```

### Design Principles

1. **macOS System Settings layout** — sidebar + content pane (already established)
2. **Grouped cards** — related settings in bordered card groups (existing `GroupedCard` pattern)
3. **Immediate apply** — changes take effect instantly, no "Save" button needed
4. **Safe defaults** — every setting has a sensible default; missing config = default behavior
5. **Input validation** — Zod schemas for all settings, both client and server
6. **No secrets in localStorage** — API keys stored server-side only, masked in UI

---

## M7.1: Terminal Settings

**Priority: HIGH** — Users interact with terminal constantly.

### Settings

| Setting | Type | Default | Options | Storage |
|---------|------|---------|---------|---------|
| Font Size | number | 14 | 10–24 (slider) | localStorage |
| Font Family | enum | `'JetBrains Mono'` | JetBrains Mono, Fira Code, Source Code Pro, Menlo, Monaco, monospace | localStorage |
| Cursor Style | enum | `'block'` | block, underline, bar | localStorage |
| Scrollback Lines | enum | `5000` | 1000, 5000, 10000, Unlimited (-1) | localStorage |
| Copy on Select | boolean | `true` | on/off | localStorage |

### Implementation

1. **Add to `preferences-store.ts`:**
   ```typescript
   terminalFontSize: number;       // 14
   terminalFontFamily: string;     // 'JetBrains Mono'
   terminalCursorStyle: 'block' | 'underline' | 'bar'; // 'block'
   terminalScrollback: number;     // 5000 (-1 = unlimited)
   terminalCopyOnSelect: boolean;  // true
   ```

2. **Add sidebar entry** in `SettingsView.tsx`: `{ id: 'terminal', label: 'Terminal', icon: <TerminalSquare>, iconBg: 'bg-gray-800' }`

3. **TerminalPage component:**
   - Font size slider with live preview number
   - Font family dropdown (GroupedRow with select)
   - Cursor style: 3 visual buttons (block/underline/bar icons)
   - Scrollback: dropdown (1000/5000/10000/Unlimited)
   - Copy on Select: toggle switch

4. **Wire to Terminal component:** `usePreferencesStore` selectors in the xterm.js component to apply font/cursor/scrollback options.

### Files Modified
- `client/src/store/preferences-store.ts` — new terminal fields
- `client/src/components/Desktop/SettingsView.tsx` — TerminalPage + sidebar entry
- `client/src/components/Terminal/TerminalView.tsx` — read preferences, apply to xterm

### Verification
- [ ] Changing font size immediately resizes terminal text
- [ ] Cursor style change reflected in terminal
- [ ] Settings persist across browser refresh

---

## M7.2: Server Admin App

**Priority: HIGH** — A standalone desktop app for managing the connected server itself (like IIS/Windows Server Manager). NOT multi-server CRUD (that's the Login screen).

> **Subsumes backlog items:** B.5 (Nginx config viewer), B.7 (Log viewer)

### Overview

A standalone desktop window (same pattern as Docker, Task Manager) with **sidebar navigation** for 8 server administration sections. Each section queries the connected server via SSH, parses output with deterministic parsers, and renders a rich UI.

**Graceful degradation:** If a tool isn't installed (e.g., no UFW, no nginx), the section shows a "Not detected" message with install instructions — NOT an error.

### Sections

#### 1. Network

| Command | Purpose |
|---------|---------|
| `ss -tlnp` | Listening ports (protocol, address, port, process) |
| `ip route show` | Routing table |
| `cat /etc/resolv.conf` | DNS configuration |
| `ss -tunap` | All active connections |

**UI:** Tabbed view — Listening Ports (table), Routes (table), DNS (key-value), Connections (table with state badges).

#### 2. Firewall

| Command | Purpose |
|---------|---------|
| `ufw status numbered` | Current UFW rules + status |
| `ufw allow <port>/<proto>` | Add allow rule (action) |
| `ufw deny <port>/<proto>` | Add deny rule (action) |
| `ufw delete <num>` | Delete rule by number (action) |
| `ufw enable` / `ufw disable` | Toggle firewall (action) |

**UI:** Status badge (active/inactive), rules table with delete buttons, "Add Rule" form (port, protocol, action), enable/disable toggle.
**Detection:** If `ufw` not found → show "UFW not installed. Install with `sudo apt install ufw`."

#### 3. Security

| Command | Purpose |
|---------|---------|
| `cat /etc/passwd` | System user accounts |
| `who` | Currently logged-in sessions |
| `last -n 30` | Recent login history |
| `cat /etc/ssh/sshd_config` | SSH daemon configuration (key directives) |
| `fail2ban-client status` | Fail2ban jails (if installed) |

**UI:** User accounts table (username, UID, shell, home), active sessions table, login history table, SSH config summary cards (PermitRootLogin, PasswordAuthentication, Port, etc.).

#### 4. Web Server (Nginx)

| Command | Purpose |
|---------|---------|
| `nginx -T` | Full nginx configuration dump |
| `ls /etc/nginx/sites-enabled/` | Enabled sites |
| `ls /etc/nginx/sites-available/` | Available sites |
| `nginx -t` | Config syntax test |
| `certbot certificates` | SSL certificate status (if certbot installed) |

**UI:** Sites table (name, enabled status), config test result badge, SSL certificates table (domain, expiry, issuer).
**Detection:** If `nginx` not found → show "Nginx not detected."

#### 5. Packages

| Command | Purpose |
|---------|---------|
| `apt list --upgradable 2>/dev/null` | Upgradable packages |
| `dpkg -l \| wc -l` | Total installed package count |

**UI:** Summary card (total installed, upgradable count), upgradable packages table (name, current version, new version).
**Detection:** If `apt` not found → show "APT not available (non-Debian system)."

#### 6. Cron Jobs

| Command | Purpose |
|---------|---------|
| `crontab -l` | Current user's cron jobs |
| `ls /etc/cron.d/` | System cron jobs |
| `cat /etc/crontab` | System crontab |

**UI:** Cron jobs table (schedule, command, source), human-readable schedule descriptions.

#### 7. Logs

| Command | Purpose |
|---------|---------|
| `journalctl -u <unit> -n <lines> --no-pager` | Systemd journal logs |
| `dmesg --time-format iso \| tail -n <lines>` | Kernel ring buffer |
| `tail -n <lines> /var/log/syslog` | System log (fallback) |

**UI:** Unit filter dropdown, line count selector (50/100/200/500), log output in monospace scroll area with auto-scroll. Refresh button.

#### 8. Storage

| Command | Purpose |
|---------|---------|
| `du -sh /home/* /var/* /tmp 2>/dev/null` | Directory sizes |
| `findmnt --json` | Mount points |
| `swapon --show` | Swap devices |

**UI:** Directory sizes table (path, size), mount points table (target, source, fstype, options), swap info card.

### Architecture

```
client/src/components/ServerAdmin/
  ServerAdminView.tsx       ← Main shell with sidebar nav
  NetworkSection.tsx        ← Listening ports, routes, DNS, connections
  FirewallSection.tsx       ← UFW rules, add/delete, enable/disable
  SecuritySection.tsx       ← Users, sessions, logins, SSH config
  WebServerSection.tsx      ← Nginx sites, config test, SSL certs
  PackagesSection.tsx       ← Installed/upgradable packages
  CronSection.tsx           ← Cron jobs viewer
  LogsSection.tsx           ← Journal/dmesg/syslog viewer
  StorageSection.tsx        ← Dir sizes, mounts, swap

server/src/routes/serveradmin.ts         ← All admin endpoints (prefix: /admin)
server/src/parsers/schemas/serveradmin.ts ← All Zod schemas
server/src/parsers/deterministic/
  ss.ts, ufw.ts, etc-passwd.ts, who.ts, sshd-config.ts,
  nginx.ts, apt.ts, crontab.ts, du.ts, findmnt.ts
```

### API Endpoints

```
GET  /api/servers/:id/admin/network     → { ports, routes, dns, connections }
GET  /api/servers/:id/admin/firewall    → { status, rules }
POST /api/servers/:id/admin/firewall/rules   → add rule (port, proto, action)
DELETE /api/servers/:id/admin/firewall/rules/:num → delete rule
POST /api/servers/:id/admin/firewall/toggle  → enable/disable
GET  /api/servers/:id/admin/security    → { users, sessions, logins, sshConfig }
GET  /api/servers/:id/admin/webserver   → { sites, configTest, sslCerts }
GET  /api/servers/:id/admin/packages    → { totalInstalled, upgradable[] }
GET  /api/servers/:id/admin/cron        → { jobs[] }
GET  /api/servers/:id/admin/logs?unit=&lines=&source= → { entries[] }
GET  /api/servers/:id/admin/storage     → { dirSizes, mounts, swap }
```

### Files Created
- `server/src/parsers/schemas/serveradmin.ts` — ~18 Zod schemas
- `server/src/parsers/deterministic/ss.ts` — ss output parser
- `server/src/parsers/deterministic/ufw.ts` — ufw status parser
- `server/src/parsers/deterministic/etc-passwd.ts` — /etc/passwd parser
- `server/src/parsers/deterministic/who.ts` — who + last output parser
- `server/src/parsers/deterministic/sshd-config.ts` — sshd_config key directives
- `server/src/parsers/deterministic/nginx.ts` — nginx -T / sites / certbot parser
- `server/src/parsers/deterministic/apt.ts` — apt upgradable / dpkg count parser
- `server/src/parsers/deterministic/crontab.ts` — crontab -l parser
- `server/src/parsers/deterministic/du.ts` — du -sh parser
- `server/src/parsers/deterministic/findmnt.ts` — findmnt --json parser
- `server/src/routes/serveradmin.ts` — all admin route handlers
- `client/src/components/ServerAdmin/ServerAdminView.tsx` — main shell
- `client/src/components/ServerAdmin/NetworkSection.tsx`
- `client/src/components/ServerAdmin/FirewallSection.tsx`
- `client/src/components/ServerAdmin/SecuritySection.tsx`
- `client/src/components/ServerAdmin/WebServerSection.tsx`
- `client/src/components/ServerAdmin/PackagesSection.tsx`
- `client/src/components/ServerAdmin/CronSection.tsx`
- `client/src/components/ServerAdmin/LogsSection.tsx`
- `client/src/components/ServerAdmin/StorageSection.tsx`

### Files Modified
- `client/src/lib/apps.ts` — add `serveradmin` to APPS array
- `client/src/lib/api.ts` — add admin API functions
- `client/src/components/ui/FileIcon.tsx` — Server Admin icon (shield/gear SVG)
- `client/src/components/Desktop/WindowManager.tsx` — add `serveradmin` case
- `client/src/store/window-store.ts` — add default size + single-instance entry
- `client/src/components/Desktop/Desktop.tsx` — add desktop icon / context menu entry
- `server/src/index.ts` — register serveradmin routes
- `server/src/parsers/deterministic/index.ts` — export new parsers

### Verification
- [ ] Server Admin opens as standalone desktop window
- [ ] Sidebar navigation switches between 8 sections
- [ ] Network section shows listening ports, routes, DNS, connections
- [ ] Firewall section shows UFW rules; can add/delete rules, toggle on/off
- [ ] Security section shows users, active sessions, login history, SSH config
- [ ] Web Server section shows nginx sites, config test, SSL certs (or "Not detected")
- [ ] Packages section shows installed count, upgradable list (or "APT not available")
- [ ] Cron section shows cron jobs
- [ ] Logs section shows journal/dmesg logs with unit filter
- [ ] Storage section shows dir sizes, mounts, swap
- [ ] Sections with missing tools show graceful "Not detected" message
- [ ] All deterministic parsers have fixture-driven tests

---

## M7.3: LLM / AI Configuration

**Priority: HIGH** — Controls cost and behavior.

### Settings

| Setting | Type | Default | Options | Storage |
|---------|------|---------|---------|---------|
| Provider | enum | `'openai'` | OpenAI, Anthropic, Ollama (local) | server config |
| API Key | string (masked) | `''` | free text (masked) | server config |
| Model | enum | `'gpt-4o-mini'` | Per provider: gpt-4o-mini, gpt-4o / claude-sonnet / llama3 | server config |
| LLM Enabled | boolean | `true` | on/off (off = deterministic only) | server config |
| Temperature | number | `0.1` | 0.0–1.0 (slider) | server config |

### Implementation

1. **Backend: App Config Store** — new `server/src/config/app-config.ts`:
   ```typescript
   interface AppConfig {
     llm: {
       provider: 'openai' | 'anthropic' | 'ollama';
       apiKey: string;          // encrypted at rest (or env var)
       model: string;
       enabled: boolean;
       temperature: number;
       ollamaUrl?: string;      // for local Ollama
     };
     general: {
       defaultShell: string;
       sessionTimeout: number;
       autoReconnect: boolean;
     };
   }
   ```
   Persisted to `~/.headlessos/config.json`.

2. **Backend: Settings API routes** — new `server/src/routes/settings.ts`:
   ```
   GET  /api/settings          → returns config (API key masked as '***')
   PUT  /api/settings          → update config (validates with Zod)
   POST /api/settings/test-llm → sends test prompt, returns success/error + latency
   ```

3. **Frontend: LLMPage component:**
   - Provider selector (3 radio cards with logos)
   - API Key input (password type, shows '•••••' if set, "Change" button)
   - Model dropdown (options change based on provider)
   - LLM Enabled toggle
   - Temperature slider (0.0–1.0)
   - "Test LLM" button → calls test endpoint → shows response time + status
   - Usage stats section (if M4.8 is done): calls made, tokens, estimated cost

4. **Security:**
   - API key NEVER sent to frontend (masked as `***` in GET response)
   - PUT accepts new key or empty string (keep existing)
   - Zod validation on all inputs
   - Provider-specific model validation

### Files Created
- `server/src/config/app-config.ts` — AppConfigStore service
- `server/src/routes/settings.ts` — Settings API routes

### Files Modified
- `server/src/index.ts` — register settings routes + AppConfigStore
- `client/src/lib/api.ts` — settings API functions
- `client/src/components/Desktop/SettingsView.tsx` — LLMPage + sidebar entry

### Verification
- [ ] Can select LLM provider and model
- [ ] API key stored server-side only, masked in UI
- [ ] Test LLM button returns success with latency
- [ ] Disabling LLM falls back to deterministic parsers only
- [ ] Config persists across server restart

---

## M7.4: Appearance (Expand)

**Priority: MEDIUM** — Polish existing placeholder options.

### Settings to Wire Up

| Setting | Current State | Action |
|---------|--------------|--------|
| Accent Color | Visual-only (8 circles) | Wire to CSS `--primary` variable via oklch |
| Theme | Works but uses local state | Wire to `useThemeStore` properly + "Auto" support |
| Desktop Icon Size | Not implemented | Add: small (36px) / medium (44px) / large (56px) |
| Sidebar Icon Size | Placeholder "Default" | Remove or implement (low priority) |
| Show Scroll Bars | Placeholder "Automatic" | Remove placeholder (CSS handles this) |
| Wallpaper Tinting | Placeholder "On" | Remove placeholder |

### Implementation

1. **Accent color → CSS vars:**
   - Each accent color has an oklch value
   - On select: update `document.documentElement.style.setProperty('--primary', value)`
   - Persist choice to `preferences-store.ts`
   - All `bg-primary`, `text-primary`, `ring-primary` update automatically

2. **Theme → wire to `useThemeStore`:**
   - Replace local `useState` with `useThemeStore`
   - Add "Auto" support: listen to `prefers-color-scheme` media query

3. **Desktop icon size:**
   - Add `desktopIconSize: 'small' | 'medium' | 'large'` to preferences store
   - Wire to Desktop.tsx icon rendering

4. **Remove non-functional placeholders** (Sidebar Icon Size, Show Scroll Bars, Wallpaper Tinting)

### Files Modified
- `client/src/store/preferences-store.ts` — accentColor, desktopIconSize
- `client/src/components/Desktop/SettingsView.tsx` — AppearancePage rewrite
- `client/src/styles.css` — accent color CSS variable mapping
- `client/src/components/Desktop/Desktop.tsx` — read desktopIconSize

### Verification
- [ ] Accent color changes reflected across entire UI
- [ ] Theme toggle persists via useThemeStore
- [ ] Desktop icon size changes visible immediately
- [ ] No non-functional placeholder rows remain

---

## M7.5: General Settings

**Priority: MEDIUM** — System-wide behavior settings.

### Settings

| Setting | Type | Default | Options | Storage |
|---------|------|---------|---------|---------|
| Default Shell | enum | `'/bin/bash'` | /bin/bash, /bin/zsh, /bin/sh, custom | server config |
| Auto-Reconnect | boolean | `true` | on/off | server config |
| Max Reconnect Attempts | number | `3` | 1–10 | server config |
| Session Timeout | enum | `0` (never) | 5min, 15min, 30min, 1hr, never | server config |
| Auto-Refresh Interval | enum | `30` | 15s, 30s, 60s, 120s, off (0) | localStorage |
| Date Format | enum | `'12h'` | 12-hour, 24-hour | localStorage |

### Implementation

1. **Server-side settings** stored in `AppConfig.general` (from M7.3's `app-config.ts`)
2. **Client-side settings** in `preferences-store.ts` (autoRefreshInterval, dateFormat)
3. **GeneralPage component:** grouped cards for each category
4. Default shell sent to terminal WebSocket on new session creation

### Files Modified
- `server/src/config/app-config.ts` — general settings fields
- `client/src/store/preferences-store.ts` — autoRefreshInterval, dateFormat
- `client/src/components/Desktop/SettingsView.tsx` — GeneralPage + sidebar entry
- `client/src/components/Desktop/Taskbar.tsx` — read dateFormat for clock

### Verification
- [ ] Default shell used when opening new terminal
- [ ] Auto-refresh interval change affects dashboard/file explorer
- [ ] 12h/24h clock format reflected in taskbar

---

## M7.6: Notifications & Data

**Priority: LOW** — Nice-to-have polish.

### Settings

| Setting | Type | Default | Options | Storage |
|---------|------|---------|---------|---------|
| Show Toast Notifications | boolean | `true` | on/off | localStorage |
| Notification Position | enum | `'bottom-right'` | bottom-right, top-right | localStorage |
| Clear Cached Data | action | — | Button → clears localStorage | — |
| Reset All Settings | action | — | Button → resets to defaults + confirm | — |

### Implementation

1. **NotificationsPage component:**
   - Toast toggle and position selector
   - "Clear Cached Data" button with confirmation
   - "Reset All Settings" button with destructive ConfirmDialog
   - Storage usage display (approximate localStorage size)

### Files Modified
- `client/src/store/preferences-store.ts` — notification preferences
- `client/src/components/Desktop/SettingsView.tsx` — NotificationsPage + sidebar entry

### Verification
- [ ] Toast toggle suppresses/shows notifications
- [ ] Clear cache removes localStorage data
- [ ] Reset All restores defaults with confirmation

---

## Sidebar Order (Final)

After all tasks, the Settings sidebar will have:

```
 🖥  General
 🎨  Appearance
 📁  Wallpaper
 ⬛  Terminal
 🤖  AI / LLM
 🔔  Notifications
 ℹ️  About
```

> **Note:** "Servers" was removed — server administration is now a standalone desktop app (M7.2), not a Settings page.

---

## Task Dependency Graph

```
M7.3 (LLM) ─────→ creates app-config.ts + settings API
                          ↓
M7.5 (General) ──→ extends app-config.ts (general section)
                          
M7.1 (Terminal) ──→ standalone (preferences-store only) ✅
M7.2 (Server Admin) → standalone desktop app (new parsers + routes + components)
M7.4 (Appearance) → standalone (preferences-store + CSS vars)
M7.6 (Notifications) → standalone (preferences-store only)
```

**Recommended order:** M7.1 ✅ → M7.2 → M7.3 → M7.4 → M7.5 → M7.6

---

## Security Considerations

1. **API keys** — stored in `~/.headlessos/config.json` server-side only, never in localStorage
2. **Server Admin commands** — all exec commands use hardcoded templates, never user-interpolated; `ufw` rule parameters validated (port: integer 1-65535, proto: tcp/udp only)
3. **Settings API** — Zod validation on all PUT body fields; reject unknown fields
4. **Shell injection** — default shell setting validated against allowlist (`/bin/bash`, `/bin/zsh`, `/bin/sh`)
5. **LLM test endpoint** — rate limited; sends a fixed test prompt, not user input
