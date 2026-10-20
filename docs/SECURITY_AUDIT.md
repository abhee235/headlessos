# Security Audit — Pre-Open-Source Review

> **Date:** 2026-10-20
> **Scope:** `server/src` (backend attack surface), Electron shell, network exposure model.
> **Method:** static review of every command-execution and input-validation path, plus **dynamic exploitation** against a live backend (`localhost:3001`) connected to a throwaway Docker SSH container (`dev/docker-compose.yml`). Each injection was fired as a real HTTP request; "executed" means a benign sentinel file actually appeared on the target.
> **Threat model:** HeadlessOS holds SSH credentials and runs commands on the user's servers. The headline risk for open-sourcing is that a flaw lets a **third party (a website the user visits, or a network attacker) pivot through the localhost app into the connected servers** — i.e. the app becomes a backdoor.

---

## Summary

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| C1 | CRITICAL | `/dynamic-ui/refresh` passed raw request body to `exec()` (RCE) | ✅ **Fixed + verified** |
| C2 | CRITICAL | Set-password `chpasswd` double-wrapped `shellEscape` → command injection | ✅ **Fixed + verified** |
| C3 | CRITICAL | No API auth + permissive CORS (`Origin: null` + credentials) + no WS origin check → any website can drive SSH | ✅ **Fixed + verified** (per-session token + Host/WS-origin checks) |
| H1 | HIGH | Command allowlist is prefix-based; `find -exec`, `docker run --privileged`, unanchored prefixes bypass it | ✅ **Fixed + verified** |
| H2 | HIGH | Agent "read-only" guardrail bypassable (`find -exec`, `awk system()`) → host RCE | ✅ **Fixed** |
| H3 | HIGH | `GET /api/ssh-keys/:name` returns raw private-key contents | 🟡 **Mitigated by C3** (now token-gated); deeper refactor recommended |
| M1 | MEDIUM | Credential encryption key derived only from hostname+uid (no secret) | ✅ **Fixed** (random per-install secret + legacy fallback) |
| M2 | MEDIUM | Raw SSH/stderr returned to client; `sanitizeErrorMessage()` never called | 🟡 **Partial** (connect route sanitized; per-handler pass recommended) |
| M3 | MEDIUM | Agent write-back can write `~/.ssh/authorized_keys` / dotfiles (persistence) | ✅ **Fixed** |
| M4 | MEDIUM | Arbitrary SSH target (SSRF) — capped; covered by C3's auth | 🟡 **Mitigated by C3** |

**Defenses that already work (do not re-flag):** command construction in `docker`, `services`, `taskmanager`, and most of `serveradmin` (nginx/users/groups/cron/DNS/firewall) validates then `shellEscape`s correctly. Live injection into apt install/remove, nginx site, username, and interface name was **rejected (HTTP 400)** with no execution. The Electron shell is hardened (`nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, nav + window-open guards, minimal preload). The server binds `127.0.0.1`, not `0.0.0.0`. **There is no tunnel/ngrok/remote-exposure feature** — the only `listen()` is loopback.

---

## Fixed in this pass (verified against the live container)

### C1 — RCE via `/dynamic-ui/refresh`  ·  `server/src/routes/dynamic-ui.ts`
The POST body `command` was passed straight to `connectionManager.exec()` with no validation.
- **Proof (before):** `POST …/dynamic-ui/refresh {"command":"id; touch /tmp/ho_c1"}` → `200`, ran `id`, created the sentinel.
- **Fix:** the handler now calls `validateCommand(command)` before exec (same allowlist as `/execute-action`) and maps `SecurityError → 403`.
- **Proof (after):** same payload → **403 "Command not in allowlist"**; `df -h` → 200; sentinel not created.

### C2 — command injection in set-password  ·  `server/src/routes/serveradmin.ts:745`
`echo '${shellEscape(user)}:${shellEscape(pass)}' | sudo chpasswd` — `shellEscape` already single-quotes, so the outer `echo '…'` left the password unquoted.
- **Proof (before):** password `x;touch /tmp/ho_c2;echo y` → HTTP 500 **but the `touch` executed** (sentinel appeared).
- **Fix:** escape the whole `user:pass` once — `echo ${shellEscape(\`${username}:${password}\`)} | sudo chpasswd` (the pattern the cron/DNS routes already use correctly).
- **Proof (after):** same payload → treated as a literal password, **no command executed**.

### C3 — per-session API token + anti-DNS-rebinding + WebSocket origin  ·  `server/src/index.ts`, client, Electron, Vite proxy
The `onRequest` hook now enforces three things:
- **Auth token:** a random per-install secret (`~/.headlessos/api-token`, 0600, also printed on stdout for the Electron shell) is required on every request via the `x-headlessos-token` header **or** a `?token=` query param (the query form is needed for `<img>` and WebSocket, which can't set headers). `/health` is the only exemption. A sandboxed cross-origin iframe cannot read the token file, so it can no longer drive the API.
- **Host-header allowlist** (loopback only) → blocks DNS rebinding.
- **WebSocket origin check** (loopback or `null`) → CORS doesn't apply to WS handshakes.
- **Token delivery:** dev — the Vite proxy injects the header on `/api` and `/ws`; Electron prod — the client attaches it (fetch patch for REST/direct fetches, `?token=` for `<img>`/WS).
- **Proof (live):** `/api/servers` no token → **401**; header or `?token=` → 200; wrong token → 401; `/health` → 200; `Host: evil.com` → 403; WS no token → handshake **rejected (401)**, WS with token/proxy → opens. Dev proxy and all four client WS endpoints updated and verified.

### Path handling  ·  `server/src/routes/files.ts`
`requireValidPath` validated with the boolean `validatePath` but returned the **raw** path, so the SFTP op ran on un-normalized input and `BLOCKED_PATHS` was only checked against the normalized form. Switched to `validateAndSanitizePath` (returns the normalized path).
- **Note:** whole-filesystem access, bounded by the SSH account's own Unix permissions, is **by design** for a file manager — this is not confinement, and `docs/SECURITY.md` was corrected to say so. Live proof that `/files/read?path=/home/testuser/../../../../etc/passwd` returns `/etc/passwd` is expected behavior; it only becomes dangerous combined with C3 (any website reading files off every connected server).

---

## Also fixed in this pass

- **H1 — allowlist hardening** (`security/validators.ts`): `validateCommand` now rejects chaining/substitution metacharacters (`;` backtick `$(` `${` `&&` `||`); `BLOCKED_COMMANDS` adds `-exec/-execdir`, `nsenter`, `tar --to-command`, pipe-to-shell, and dangerous `docker run` flags (`--privileged`, host namespaces, `-v /:`, docker.sock); the permissive `echo '…'` / `(crontab -l …` write-entries (only reachable via execute-action) were removed. **Live-verified:** `docker ps; id` -> 403, `docker run --privileged -v /:/host` -> 403, `docker ps` -> 200.
- **H2 — agent guardrail** (`agent/command-allowlist.ts`): same escalations blocked; `awk`/`sed` removed as "safe" pipe filters (both can exec).
- **M1 — encryption** (`security/encryption.ts`): key now derives from a random per-install secret (`~/.headlessos/enc-key`, 0600) plus machine facts; decrypt falls back to the legacy key so existing stored credentials still open and upgrade on next save.
- **M3 — write-back denylist** (`agent/command-allowlist.ts`): `.ssh/`, `authorized_keys`, shell rc/credential dotfiles, `sudoers`, `crontab` are refused even inside allowed roots.
- **M2 (partial)**: the SSH connect error is now run through `sanitizeErrorMessage()` and logged server-side only.

17 regression tests added in `server/tests/routes/security-regressions.test.ts`; full suite green.

## Remaining (recommended follow-ups, not blockers)

- **H3 (deeper fix):** `GET /api/ssh-keys/:name` still returns private-key contents (now token-gated by C3). Ideal: store the key *path* and have the backend read it at connect time so key material never crosses the API. Reworks the add-server flow, so left as a deliberate follow-up.
- **M2 (systematic):** many route handlers still `return { error: result.stderr }` directly. Apply `sanitizeErrorMessage()` across them (mechanical, but touches dozens of handlers and their tests).
- **CORS `Origin: null`:** still reflected (the Electron file:// app relies on it). Defanged by the auth token now; migrating Electron to a custom `app://` origin would let it be dropped entirely.

---

## Go-public recommendation

All CRITICAL and HIGH findings are fixed or mitigated and verified; the two RCEs (C1, C2) and the backdoor gate (C3) are closed and live-tested. The remaining items (H3 deeper refactor, M2 systematic sanitization) are hardening follow-ups, not blockers. **The repo is in a defensible state to open-source** once these changes are committed; schedule H3/M2 as fast follow-ups.
