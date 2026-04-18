# Phase EX5: CLI App Generation with Sandbox Discovery

> **Milestone:** EX5  
> **Goal:** Enable the UIAgent to introspect any CLI tool installed on a server, generate a full management UI as a DynamicView, and allow users to save it as a reusable "app" — with an optional sandbox mode that runs discovery commands inside an ephemeral Docker container for safety.  
> **Architecture:** Builds on EX1 (Dynamic UI Engine), EX2 (UI Generation Agent), and the existing Docker management routes.  
> **ADR:** ADR-019 (Sandbox CLI Discovery)

---

## Motivation

HeadlessOS can already generate dynamic UIs from terminal output (EX1) using an AI agent (EX2). However:

1. **CLI discovery is blocked** — The agent can't run `--help`, `which`, or `man` because the command allowlist doesn't include them
2. **No sandbox** — Discovery commands run directly on the production server, which is risky for unknown tools
3. **Forms don't execute** — The FormWidget renders but `onSubmit` isn't wired to actually compose and run CLI commands
4. **No save/reuse** — Generated UIs are ephemeral; users can't save them as permanent "apps"
5. **No app launcher** — Saved apps don't appear in the start menu or command palette

This phase addresses all five gaps in a phased approach.

---

## Architecture Overview

```
User: "Build me a UI for restic"  →  [🔒 Sandbox Mode toggle]
    ↓
Phase 1: SANDBOX DISCOVERY (ephemeral Docker container)
  ┌──────────────────────────────────────────────┐
  │ Target Server                                 │
  │ ┌──────────────────────────────────────────┐ │
  │ │ Docker: headlessos-sandbox-{uuid}        │ │
  │ │   --network=none --memory=256m --cpus=0.5│ │
  │ │   apt install restic → restic --help     │ │
  │ │   restic backup --help → parse flags     │ │
  │ │   restic snapshots --help → parse flags  │ │
  │ └──────────────────────────────────────────┘ │
  │             ↓ destroy after discovery         │
  │                                               │
  │ Phase 2: APPLY (real server)                  │
  │   restic snapshots --json → table widget      │
  │   restic backup /data → form triggers command │
  └───────────────────────────────────────────────┘
         ↑ SSH (single connection, docker exec for sandbox)
    HeadlessOS Backend (UIAgent)
```

### Key Design Decisions

- **`docker exec` (not SSH-into-container)** — No sshd needed in sandbox, simpler, faster
- **`--network=none`** — Sandbox can't reach internet during discovery (install happens before network isolation, or tool is pre-installed)
- **`--memory=256m --cpus=0.5`** — Resource-capped
- **5-minute TTL** — Auto-cleanup timer + orphan reaper on service start
- **OS-matched base image** — `get_server_context` detects OS, sandbox uses matching image
- **Two-phase agent flow** — Discovery (sandbox) → Apply (real server)

---

## Sub-Phase EX5-A: Foundation — Allowlist & Form Wiring

### EX5-A.1: CLI Discovery Command Allowlist

**Goal:** Open the command allowlist to support CLI introspection patterns.

**File:** `server/src/agent/command-allowlist.ts`

**New patterns in `AGENT_READ_ONLY_ALLOWLIST`:**

```typescript
// CLI Discovery (EX5-A.1)
/^which\s+[a-zA-Z0-9_.-]+$/,                          // which restic
/^command\s+-v\s+[a-zA-Z0-9_.-]+$/,                   // command -v restic
/^type\s+[a-zA-Z0-9_.-]+$/,                           // type restic
/^[a-zA-Z0-9_.\/-]+\s+--help$/,                       // restic --help
/^[a-zA-Z0-9_.\/-]+\s+-h$/,                           // restic -h
/^[a-zA-Z0-9_.\/-]+\s+help(\s+[a-zA-Z0-9_.-]+)?$/,   // restic help backup
/^[a-zA-Z0-9_.\/-]+\s+[a-zA-Z0-9_.-]+\s+--help$/,    // restic backup --help
/^[a-zA-Z0-9_.\/-]+\s+--version$/,                    // restic --version
/^[a-zA-Z0-9_.\/-]+\s+-v$/,                           // restic -v (version)
/^[a-zA-Z0-9_.\/-]+\s+version$/,                      // docker version
/^man\s+[a-zA-Z0-9_.-]+$/,                            // man restic
/^apropos\s+[a-zA-Z0-9_.-]+$/,                        // apropos backup
/^dpkg\s+-l(\s+[a-zA-Z0-9_.*-]+)?$/,                  // dpkg -l restic
/^rpm\s+-qa(\s+\|\s+grep\s+\S+)?$/,                   // rpm -qa | grep restic
/^apt\s+list\s+--installed/,                           // apt list --installed
```

**Tests:** 15+ patterns validated in allowlist tests

**Verification:** `isReadCommandAllowed('restic --help')` returns `true`

---

### EX5-A.2: Form CommandTemplate & Submit Wiring

**Goal:** Allow FormWidget to compose and execute CLI commands from form values.

**Schema change** in `shared/schemas/dynamic-view.ts`:

```typescript
export const FormWidgetSchema = z.object({
  type: z.literal('form'),
  title: z.string().nullable().optional(),
  fields: z.array(FormFieldSchema),
  groups: z.array(FormFieldGroupSchema).nullable().optional(),
  submitLabel: z.string().default('Save'),
  readOnly: z.boolean().default(false),
  dataSource: DataSourceSchema.nullable().optional(),
  // NEW: Command composition for CLI tools
  commandTemplate: z.string().nullable().optional()
    .describe('CLI command template with {fieldName} placeholders, e.g. "restic backup {--repo} {--exclude} {path}"'),
  confirmSubmit: z.boolean().default(false)
    .describe('Show confirmation dialog before executing command'),
  confirmMessage: z.string().nullable().optional()
    .describe('Custom confirmation message'),
});
```

**Frontend wiring** in `client/src/components/DynamicUI/WidgetRenderer.tsx`:
- Pass `onSubmit` handler to FormWidget when `commandTemplate` is defined
- Handler composes CLI command by substituting `{fieldName}` → `shellEscape(value)`
- Calls existing `POST /api/servers/:id/dynamic-ui/execute-action` endpoint
- Shows toast on success/failure

**Tests:** 8+ tests for command composition, escaping, submission

---

### EX5-A.3: CLI Introspection Prompt Engineering

**Goal:** Enhance the UIAgent's Planner and Executor system prompts to handle "build UI for X tool" requests.

**Planner enhancement:**
- Recognize requests like "Build UI for restic", "Create management UI for nginx", "Generate app for docker"
- Output `PlannerHints` with:
  - `intent: "CLI tool management UI"`
  - `interactivityLevel: 'full-management'`
  - `estimatedComplexity: 'complex'`
  - `dataSourceHints: ['cli-introspection']`

**Executor enhancement (system prompt):**
- When hints indicate CLI introspection, follow structured pattern:
  1. Check binary exists (`which <tool>`)
  2. Get version (`<tool> --version`)
  3. Parse top-level help (`<tool> --help`)
  4. Iterate key subcommands (`<tool> <subcmd> --help`)
  5. Map flags to form fields, subcommands to sidebar sections
  6. Build table views for list-type subcommands, form views for action subcommands
- Use `update_view` to show progressive results

**Tests:** Prompt structure tests (not LLM integration tests)

---

## Sub-Phase EX5-B: Sandbox Execution Environment

### EX5-B.1: SandboxManager Service

**Goal:** Manage lifecycle of ephemeral Docker containers for safe CLI discovery.

**File:** `server/src/agent/sandbox-manager.ts`

```typescript
interface SandboxInfo {
  id: string;               // UUID
  serverId: string;          // Target server where container runs
  containerId: string;       // Docker container ID
  containerName: string;     // headlessos-sandbox-{uuid}
  baseImage: string;         // e.g. ubuntu:22.04
  toolName: string;          // CLI tool being inspected
  createdAt: Date;
  ttlMs: number;             // Default 300000 (5 min)
  status: 'creating' | 'ready' | 'destroying' | 'destroyed';
}

class SandboxManager extends BaseService {
  create(serverId: string, toolName: string, opts?: SandboxOptions): Promise<SandboxInfo>;
  exec(sandboxId: string, command: string, timeout?: number): Promise<string>;
  install(sandboxId: string, packages: string[]): Promise<string>;
  destroy(sandboxId: string): Promise<void>;
  destroyAll(serverId: string): Promise<void>;   // Orphan reaper
  getSandbox(sandboxId: string): SandboxInfo | undefined;
  listActive(): SandboxInfo[];
}
```

**Container launch command:**
```bash
docker run --rm -d \
  --name headlessos-sandbox-{uuid} \
  --memory=256m --cpus=0.5 \
  --network=none \
  --pids-limit=100 \
  {baseImage} sleep 300
```

**OS detection → base image mapping:**

| Detected OS | Base Image |
|------------|-----------|
| Ubuntu 22.04 | `ubuntu:22.04` |
| Ubuntu 24.04 | `ubuntu:24.04` |
| Debian 12 | `debian:12` |
| CentOS/RHEL 8+ | `rockylinux:9` |
| Alpine | `alpine:3.19` |
| Default | `ubuntu:22.04` |

**Lifecycle:**
1. `create()` → `docker run` → poll until container is running → return `SandboxInfo`
2. `install()` → `docker exec {id} sh -c "apt-get update -qq && apt-get install -y -qq {packages}"`
   - Requires temporary network: `docker network connect bridge {id}` → install → `docker network disconnect bridge {id}`
3. `exec()` → `docker exec {id} {command}` → return stdout
4. `destroy()` → `docker rm -f {id}`
5. Auto-destroy timer via `setTimeout` — calls `destroy()` on expiry
6. `_init()` → call `destroyAll()` to reap orphan `headlessos-sandbox-*` containers from previous runs

**Tests:** 20+ tests with mocked SSH

---

### EX5-B.2: sandbox_exec Agent Tool

**Goal:** New agent tool that routes commands to a sandbox container instead of the real server.

**File:** `server/src/agent/tools/sandbox-exec.ts`

```typescript
export const sandboxExecTool: AgentTool = {
  name: 'sandbox_exec',
  description: 'Execute a command inside the isolated sandbox container. Use this during CLI discovery (--help, --version, man) instead of exec_command for safety.',
  parameters: z.object({
    command: z.string().describe('Command to run inside the sandbox'),
  }),
  securityTier: 'read',
  execute: async (args, context) => { ... },
};
```

**Guardrails:**
- Same read-only allowlist validation applies (preventing RCE even inside sandbox)
- Sandbox-specific blocked patterns: no `apt install`, no `curl|bash` (installation is done via `SandboxManager.install()` only)

**Tests:** 10+ tests

---

### EX5-B.3: Two-Phase Agent Flow

**Goal:** UIAgent switches between sandbox and real server during generation.

**Changes to `UIAgent`:**

```typescript
export interface UIAgentOptions {
  maxPostReflections?: number;
  signal?: AbortSignal;
  // NEW
  sandboxMode?: boolean;  // Enable sandbox for discovery phase
}
```

**Flow when `sandboxMode=true`:**

1. **Pre-Discovery:** Get server context (OS, Docker availability)
2. **Sandbox Create:** `SandboxManager.create(serverId, toolName)`
3. **Sandbox Install:** `SandboxManager.install(sandboxId, [toolName])`
4. **Discovery Phase:** Register `sandbox_exec` tool. Executor uses it for `--help` / `man` / version commands
5. **Schema Generation:** Agent builds DynamicView JSON from discovery data
6. **Sandbox Destroy:** `SandboxManager.destroy(sandboxId)`
7. **Apply Phase:** Switch `ToolContext.serverId` back to real server. `dataSource` commands execute on real server.

**Events emitted during sandbox phase:**
- `{ type: 'thinking', content: 'Creating sandbox container...' }`
- `{ type: 'thinking', content: 'Installing restic in sandbox...' }`
- `{ type: 'thinking', content: 'Discovering CLI structure...' }`
- `{ type: 'thinking', content: 'Sandbox destroyed ✓' }`

**Tests:** 12+ integration tests with mocked SSH

---

### EX5-B.4: Frontend Sandbox Toggle

**Goal:** UI control for sandbox mode in the agent panel.

**Location:** Agent panel where the user enters prompts (existing component)

**UI:**
- Toggle switch with shield icon: "🛡️ Sandbox Mode"
- Tooltip: "Discovery commands run in an isolated Docker container on the server"
- Disabled (greyed out) when Docker not available on server, with tooltip: "Requires Docker on server"
- Status indicators during generation:
  - 📦 "Creating sandbox..." (spinner)
  - ⬇️ "Installing {tool}..." (spinner)
  - 🔍 "Discovering CLI..." (spinner)  
  - ✅ "Sandbox destroyed" (checkmark)

**Docker availability check:** Read from `get_server_context()` result which already detects Docker

**Tests:** 5+ component tests

---

## Sub-Phase EX5-C: Save & Reuse Apps

### EX5-C.1: User App Persistence

**Goal:** Allow users to save generated DynamicViews as reusable "apps."

**Backend:**

**New file:** `server/src/dynamic-ui/app-store.ts`

```typescript
interface SavedApp {
  id: string;               // UUID
  name: string;             // "Restic Backup Manager"
  icon: string;             // Lucide icon name
  cliTool: string;          // "restic"
  description: string;      // Short description
  tags: string[];           // ["backup", "restic", "storage"]
  view: DynamicView;        // Complete DynamicView JSON
  commandPatterns: string[];// Regex patterns for auto-matching
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
  serverId?: string;        // Optional: server-specific app
}
```

**Storage:** `~/.headlessos/user-apps/{id}.json` — one file per app

**API Routes:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dynamic-ui/apps` | List all saved apps |
| GET | `/api/dynamic-ui/apps/:id` | Get single app |
| POST | `/api/dynamic-ui/apps` | Save new app |
| PUT | `/api/dynamic-ui/apps/:id` | Update app (rename, edit tags) |
| DELETE | `/api/dynamic-ui/apps/:id` | Delete app |

**Boot-time loading:** On `_init()`, load all user apps and register them in `TemplateRegistry` so they're matched automatically for future generations.

**Tests:** 15+ CRUD tests

---

### EX5-C.2: Save As App UI

**Goal:** "Save as App" button in DynamicAppWindow toolbar.

**UI flow:**
1. User generates a UI via agent
2. Clicks "Save as App" button (floppy disk icon) in toolbar
3. Dialog appears with fields:
   - Name (pre-filled from agent's title)
   - Icon picker (grid of Lucide icons, pre-selected based on tool type)
   - Description (pre-filled from agent)
   - Tags (comma-separated, pre-filled from tool name + category)
   - CLI Tool name (auto-detected)
4. User clicks "Save"
5. App is persisted and immediately appears in app launcher
6. Toast: "App saved! You can find it in the Start Menu."

**Tests:** 6+ component tests

---

### EX5-C.3: App Launcher Integration

**Goal:** Saved apps appear in Start Menu, Command Palette, and desktop "See All Apps."

**Changes:**

1. **Start Menu:** Add "My Apps" section showing saved apps with their icons
2. **Command Palette (Ctrl+K):** Saved apps searchable by name/tag
3. **See All Apps:** Saved apps shown alongside built-in apps
4. **Opening a saved app:**
   - Load `DynamicView` JSON from disk (instant, no LLM cost)
   - Open in `DynamicUIWindow`
   - `dataSource` commands auto-refresh data from real server
   - Action buttons functional immediately

**Frontend store:**

```typescript
// client/src/store/app-store.ts or extend dynamic-ui-store.ts
interface SavedAppState {
  apps: SavedApp[];
  loading: boolean;
  fetchApps: () => Promise<void>;
  removeApp: (id: string) => void;
  openApp: (app: SavedApp, serverId: string) => void;
}
```

**Tests:** 8+ tests

---

## Task Summary

| Task ID | Task | Sub-Phase | Priority | Est. Tests |
|---------|------|-----------|----------|-----------|
| EX5-A.1 | CLI Discovery Command Allowlist | Foundation | P0 | 15 |
| EX5-A.2 | Form CommandTemplate & Submit Wiring | Foundation | P0 | 8 |
| EX5-A.3 | CLI Introspection Prompt Engineering | Foundation | P1 | 5 |
| EX5-B.1 | SandboxManager Service | Sandbox | P0 | 20 |
| EX5-B.2 | sandbox_exec Agent Tool | Sandbox | P0 | 10 |
| EX5-B.3 | Two-Phase Agent Flow | Sandbox | P1 | 12 |
| EX5-B.4 | Frontend Sandbox Toggle | Sandbox | P1 | 5 |
| EX5-C.1 | User App Persistence (Backend) | Save & Reuse | P0 | 15 |
| EX5-C.2 | Save As App UI (Frontend) | Save & Reuse | P1 | 6 |
| EX5-C.3 | App Launcher Integration | Save & Reuse | P1 | 8 |

**Total: 10 tasks, ~104 estimated tests**

---

## Dependencies

```
EX5-A.1 (Allowlist) ──────────────────────┐
EX5-A.2 (Form Wiring) ───────────────────┤
                                           ├── EX5-B.3 (Two-Phase Flow) ── EX5-B.4 (Frontend Toggle)
EX5-B.1 (SandboxManager) ─── EX5-B.2 ───┘
EX5-A.3 (Prompts) ──────────────────────── parallel with B.*

EX5-C.1 (App Store) ── EX5-C.2 (Save UI) ── EX5-C.3 (App Launcher)
```

Sub-phases A, B, and C can overlap:
- A.1 + A.2 + B.1 can start in parallel
- B.2 depends on B.1
- B.3 depends on A.1 + B.2
- C.* is independent of B.* (save/reuse works without sandbox)

---

## Verification Criteria

1. Agent can run `restic --help` in both sandbox and direct mode
2. Sandbox container verified with `--network=none`, `--memory=256m`
3. FormWidget submits values → CLI command composed → executed on server → toast result
4. Saved app loads instantly from disk (no LLM call)
5. Saved app appears in Start Menu and Command Palette
6. Orphan reaper cleans up stale sandbox containers on service restart
7. All existing 392+ tests still pass
8. ~104 new tests for this phase

---

## Future (not in this phase)

- **Pre-built sandbox images** — Docker images with popular tools pre-installed (faster startup)
- **Sandbox pool** — Keep 1-2 warm containers ready for instant discovery
- **App marketplace** — Export/import/share app schemas as JSON
- **Schema versioning** — Tag with CLI tool version, auto-regenerate on update
- **Community curation** — Ratings, verified schemas, popular templates
