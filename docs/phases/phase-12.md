# Phase 12: Backend Architecture Refactor

**Status:** ✅ Complete
**Target:** Beta (post-M11)
**Spec authority:** This file + [ADR-023](../DECISIONS.md#adr-023-domain-service-layer--command-policy-chokepoint)

---

## Overview

Restructure the Fastify backend so HTTP routes are thin wrappers over a typed **domain service layer**, and so every shell command crossing SSH passes through a single **CommandPolicy** chokepoint. No new user-facing features — this is a structural refactor for safety, testability, and reusability.

### Goals
- Eliminate the three "fat" route files (`serveradmin.ts` 1,655 lines, `files.ts`, `docker.ts`) by relocating business logic to domain services.
- Enforce `ALLOWED_COMMANDS` / `BLOCKED_COMMANDS` at one point: `ConnectionManager.exec()`.
- Make domain logic reusable by future ReAct agent / cron / CLI surfaces (not coupled to Fastify).
- Preserve every existing API response shape — frontend changes zero lines.

### Non-Goals
- New endpoints or new app surfaces.
- Refactoring SFTP/file routes (deferred — SFTP already validates per-call and bypasses shell entirely).
- Replacing `CommandOrchestrator` or the parsing pipeline (kept as-is).

### Design Principles
1. **Single chokepoint** — every command crossing SSH passes `CommandPolicy.assertAllowed()`.
2. **Domain services own command building + validator calls + parsing**; routes only translate HTTP ↔ `ServiceResult`.
3. **Audit before enforce** — `HEADLESS_POLICY_MODE=audit` (dev default) records decisions without blocking, so the allowlist can be tightened against real traffic.
4. **Dual defense** — validators (`validatePath`, `validateContainerId`, …) at parameter entry + `CommandPolicy` at exec time. Both must pass.
5. **No frontend churn** — response shapes preserved exactly, including legacy quirks (e.g. `{ success: true, data: containers, dockerAvailable }` un-flattening).

---

## M12.1: CommandPolicy Chokepoint

`CommandPolicy` wraps `ALLOWED_COMMANDS` + `BLOCKED_COMMANDS` from `security/validators.ts` and is evaluated inside `ConnectionManager.exec()` before ssh2 dispatch.

### Modes (env `HEADLESS_POLICY_MODE`)
| Mode | Behavior | When to use |
|------|----------|-------------|
| `enforce` | Disallowed commands throw before ssh2 receives them | Production / hardened beta |
| `audit` | Disallowed commands logged + allowed through | Development; iterating allowlist |
| `off` | Bypass policy entirely | Tests, emergency only |

`BLOCKED_COMMANDS` (e.g. `rm -rf /`, `:(){:|:&};:`) always blocks regardless of mode.

### Files
- `server/src/services/policy/command-policy.ts` — `CommandPolicy` class: `evaluate`, `assertAllowed`, `isAllowed`, `getRiskLevel`, `getAuditLog` (cap 500), `getStats`, `setMode`, `getMode`.
- `server/src/ssh/connection-manager.ts` — `_init()` resolves `command-policy` from container (optional); `exec()` calls `this.policy?.assertAllowed(command, serverId)` before ssh2.
- `server/src/index.ts` — registers `command-policy` **before** `ssh` so `ConnectionManager._init()` can wire it.
- `server/tests/services/policy/command-policy.test.ts` — 29 tests covering allowlist, blocklist, modes, audit log, risk levels.

---

## M12.2: DockerService

Owns container/image listing, lifecycle actions, and log retrieval. Detects Docker absence by inspecting stderr (`command not found`) and returns `{ dockerAvailable: false }` instead of throwing.

### Files
- `server/src/services/domain/base.ts` — `DomainService`, `ServiceResult<T>`, `ServiceError`, `ok()`, `fail()`, `sendResult()`, `tryRoute()`. Helpers: `requireConnected`, `exec`, `safeExec`, `execAction`.
- `server/src/services/domain/docker-service.ts` — `listContainers`, `listImages`, `containerAction` (start/stop/restart/pause/unpause), `runContainer`, `removeContainer`, `removeImage`, `getLogs`, `inspectContainer`. Validates container/image IDs (12–64 hex chars).

### Tests
- `server/tests/services/domain/docker-service.test.ts` — 6 tests: missing-Docker handling, JSON parsing, action validation, ID validation, command construction, `ServiceError` on disconnected.

---

## M12.3: FilesService — Deferred

**Status:** ⏭️ Skipped with rationale.

`routes/files.ts` already uses SFTP (`readdir`, `readFile`, `writeFile`, `rename`, `unlink`), which **bypasses `CommandPolicy` by design** (ADR-007: SFTP for file ops, not shell). `validatePath()` is called at every entry. Wrapping SFTP in a domain service would add an indirection layer without adding a policy gate or eliminating duplication. Revisit if SFTP grows orchestration logic (e.g. multi-step copy with progress).

---

## M12.4: Admin Domain Services

Eight services covering the eight Server Admin sections from M7.2. All extend `DomainService`, return `ServiceResult<T>`, and validate inputs via `security/validators.ts`.

| Service | File | Surface |
|---------|------|---------|
| Network | `network-admin-service.ts` | `getNetworkInfo` (parallel 6 cmds), `setHostname`, `setDns`, `interfaceUp/Down` |
| Firewall | `firewall-admin-service.ts` | `getStatus`, `addRule` (basic), `addAdvancedRule` (IP/CIDR/portRange validated), `deleteRule`, `toggle`, `listApps`, `allowDenyApp` |
| Security | `security-admin-service.ts` | `getSecurityInfo` (parallel passwd/who/last/sshd/fail2ban), `getJailDetail`, `banIp`, `unbanIp`, `reloadFail2ban`, `createUser` (PROTECTED_USERS guard), `deleteUser` (refuses root), `setPassword`, `addToGroup`, `killSession` |
| Web Server | `webserver-admin-service.ts` | `getWebServerInfo` (Nginx detection → sites + certs), `enableSite`, `disableSite`, `reloadNginx`, `restartNginx`, `readSiteConfig`, `testNginxConfig` |
| Packages | `packages-admin-service.ts` | `getPackageInfo`, `aptUpdate` (120s), `upgradeAll` (300s), `install`, `remove`, `upgradeOne`, `search` |
| Cron | `cron-admin-service.ts` | `getCronInfo`, `addJob` (with optional `# description`), `deleteJobByIndex`, `editJobByIndex` |
| Logs | `logs-admin-service.ts` | `getLogs` (cap 1000), `exportLogs` (cap 5000) — journalctl/dmesg/tail with regex grep fallback |
| Storage | `storage-admin-service.ts` | `getStorageInfo` (parallel du/findmnt/swapon) |

### Files
- `server/src/services/domain/admin/{network,firewall,security,webserver,packages,cron,logs,storage}-admin-service.ts`
- `server/src/services/domain/admin/index.ts` — barrel export.
- All registered in `server/src/index.ts` after `orchestrator` and `parser`, and passed to `serverAdminRoutes`.

---

## M12.5: Slim Routes

### `routes/docker.ts`
Reduced to thin HTTP wrappers calling `DockerService` methods. Preserves legacy response shape `{ success: true, data: containers[], dockerAvailable }` via the `send()` helper which un-flattens `{ containers, dockerAvailable }`.

### `routes/serveradmin.ts`
Rewritten end-to-end: 1,655 → ~520 lines. Single file, eight section groups matching the original layout, each delegating to its admin service.

**Helpers in the route file:**
- `async send<T>(reply, promise)` — awaits `Promise<ServiceResult<T>>`, catches `ServiceError` → `reply.code(err.statusCode)`, maps successful results to `{ success: true, ...data }`. Action results whose `data` is exactly `{ message: string }` flatten to `{ success: true, message }` for shape compatibility.
- `parseBody<T>(schema, req, reply)` — Zod `safeParse`; returns parsed body or `null` after `reply.code(400)`.

The `/api/serveradmin/:serverId/logs/export` endpoint sets `Content-Type: text/plain; charset=utf-8` and `Content-Disposition: attachment; filename="logs-{source}-{timestamp}.txt"` and returns raw text (not JSON).

---

## M12.6: Tests

- `server/tests/services/policy/command-policy.test.ts` — 29 tests (M12.1).
- `server/tests/services/domain/admin-services.test.ts` — 39 tests covering command construction, validator rejection, `ServiceResult` mapping, status code mapping (404/409/400), parallel exec count, edge cases (out-of-range cron index, "already exists" → 409, exit 1 = success for `killSession`).
- `server/tests/services/domain/docker-service.test.ts` — 6 tests covering Docker-missing detection, JSON parsing, action validation, ID validation, `ServiceError` on disconnected.
- All existing route/parser/integration tests pass unchanged: **1895/1895**.

### Test Helpers
- `bootService<T>()` / `bootDocker()` — instantiate `ServiceContainer` with `MockConnection` (vi.fn'd `exec`), stub orchestrator/parser, register service-under-test, boot.
- `MockConnection` extends `BaseService` so the container's two-phase boot succeeds.

---

## M12.7: Documentation

- ADR-023 added to `docs/DECISIONS.md`.
- `docs/PROGRESS.md` — milestone row + changelog entry.
- `docs/TRACEABILITY.md` — M12.1–M12.7 file mappings.
- `docs/ARCHITECTURE.md` — domain layer note + updated request-flow diagram.
- This file (`docs/phases/phase-12.md`).

---

## Verification Gates

```bash
cd server && npx tsc --noEmit       # only the 3 known pre-existing errors
cd server && npx vitest run         # all green
HEADLESS_POLICY_MODE=audit npm run dev   # smoke against Lima VM
```

## Architecture After

```
HTTP route (thin wrapper, ~3 lines)
  └─ send(reply, domainService.method(args))
       │
DomainService                                            Service Container
  ├─ requireConnected()                                    │
  ├─ build command (with validators)                       │
  ├─ exec / safeExec / execAction                          │
  └─ Zod parse → ServiceResult<T>                          │
       │                                                   │
ConnectionManager.exec()                                   │
  └─ CommandPolicy.assertAllowed()  ← single chokepoint    │
       │
ssh2 → remote VPS
```
