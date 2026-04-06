# GitHub Copilot Custom Instructions for HeadlessOS

> These instructions apply to ALL Copilot interactions in this project.
> For the full AI assistant ruleset, see `AGENTS.md` in the project root.

## Document-Driven Development (MANDATORY)

This project follows strict DDD. **Code is NEVER written before documentation is verified and updated.**

### The DDD Loop (every task)

1. **READ** docs first → understand what exists (`docs/CONTEXT.md`, `docs/PROGRESS.md`)
2. **UPDATE** docs → plan the change in documentation before coding
3. **WRITE** code → implement what the docs describe
4. **VERIFY** → code matches docs exactly
5. **UPDATE** `docs/PROGRESS.md` → mark task complete

### Before Writing ANY Code
- Read `docs/CONTEXT.md` — understand the project
- Read `docs/PROGRESS.md` — find the current Task ID (e.g., `M1.4`)
- Read the relevant phase doc: `docs/phases/phase-{n}.md` — get the detailed spec
- Check `docs/TRACEABILITY.md` — see what files already exist for this area
- If documentation doesn't describe what you need to build → update the phase doc FIRST
- New architectural decisions → add an ADR to `docs/DECISIONS.md` BEFORE coding

### After Completing a Task
- Update `docs/PROGRESS.md` — mark task ✅
- Update `docs/TRACEABILITY.md` — record files created, commits, verification
- Use Task ID in git commits: `feat(M1.4): description`
- Add header comment to primary files: `// M1.4: Task Title`

## Project Architecture

A **localhost web app** that connects to Linux VPS servers via SSH, runs commands, parses terminal output using LLMs, and renders visual UI. **Nothing is installed on the server.**

```
Browser (React 19, localhost:3000)
    ↕ HTTP REST + WebSocket
Fastify Backend (Node.js, localhost:3001)
    ↕ SSH (ssh2 library)
Remote VPS (unchanged, standard sshd)
```

Pipeline: Command Orchestrator → SSH exec → ANSI strip → deterministic parser / LLM → Zod validate → typed JSON

## Tech Stack

- Backend: Node.js + Fastify 5 + TypeScript strict
- SSH: `ssh2` directly (NOT node-ssh or wrappers)
- LLM: OpenAI SDK with `zodResponseFormat()`, provider-agnostic `LLMProvider` interface
- Frontend: React 19 + Vite + TailwindCSS 4 + Zustand
- Terminal: xterm.js via WebSocket
- Schema: Zod (types + validation + LLM JSON schema)
- Testing: Vitest

## Key Patterns

1. **Service Container** — all backend modules are services in `ServiceContainer` (ADR-011)
2. **Command Orchestrator** — multi-command parallel exec, retry with error context, fallback chains (ADR-013)
3. **Parsing Pipeline** — ANSI strip → deterministic parser → LLM fallback → Zod validate
4. **Plugin-Ready App Registry** — each app is a self-contained module (ADR-012)
5. **Output Cache** — hash-based cache prevents re-parsing when terminal output unchanged (M4.7)
6. **LLM Usage Tracking** — token/cost/latency tracking per LLM call, exposed via `GET /api/stats/llm` (M4.8)

## Critical Rules

1. **TypeScript strict** — no `any` types
2. **Fastify** patterns (not Express) — `fastify.register()`, `fastify.get()`, etc.
3. **NEVER** interpolate user input into shell commands without validation
4. **SFTP** for all file operations — never `exec('cat ...')`
5. **NEVER** use `dangerouslySetInnerHTML` with terminal output
6. **Zod schemas** for all data crossing boundaries
7. **Deterministic parsers** preferred over LLM when available
8. **Backend only** listens on localhost
9. **Don't poll** from frontend — backend handles intervals/caching
10. **Functional React** components with hooks — no class components

## Common Mistakes to Avoid

1. Don't install anything on the server — this is a client-only app
2. Don't use Express patterns — this is Fastify
3. Don't bypass the parsing pipeline — all output goes through `ParsingPipeline.parse()`
4. Don't hardcode LLM provider — use the `LLMProvider` interface
5. Don't use node-ssh or other ssh2 wrappers — we use ssh2 directly
6. Don't create a single SSH channel for everything — use `exec()` for data, `shell()` for terminal
7. Don't send ANSI codes to the LLM — strip ANSI first via `strip-ansi`

## Task ID System

Every task has an ID: **`M{milestone}.{task}`** (e.g., `M1.4`)

Used consistently across:
- **Phase docs** — `docs/phases/phase-{n}.md` (detailed specs)
- **PROGRESS.md** — status dashboard
- **TRACEABILITY.md** — files + commits audit trail
- **Git commits** — `feat(M1.4): implement command orchestrator`
- **Code comments** — `// M1.4: Command Orchestrator` at top of primary files

## Documentation Map

| Doc | Purpose |
|-----|--------|
| `docs/CONTEXT.md` | 2-min AI briefing |
| `docs/ARCHITECTURE.md` | System design, data flow, patterns |
| `docs/IMPLEMENTATION_INDEX.md` | Phase overview + task ID system |
| `docs/phases/phase-{0-5}.md` | Detailed task specs per phase |
| `docs/TRACEABILITY.md` | Task → files → commits audit trail |
| `docs/PROGRESS.md` | Live task tracker |
| `docs/DECISIONS.md` | Architecture Decision Records (ADR-001 to ADR-014) |
| `docs/API_SPEC.md` | REST + WebSocket API reference |
| `docs/LLM_STRATEGY.md` | LLM integration, parsing, cost optimization |
| `docs/SECURITY.md` | Threat model, validation rules |
| `docs/TESTING.md` | Test strategy, fixtures |
| `docs/APP_REGISTRY.md` | App abstraction schema |
| `docs/UI_DESIGN.md` | UI design system, AppWindow patterns, icon/color/spacing conventions |

## Chrome DevTools MCP (Frontend Inspection)

Configured in `.vscode/mcp.json`. Launch Chrome with remote debugging:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-devtools-mcp http://localhost:3000
```
Or use the manual script: `python3 dev/inspect-frontend.py` → saves screenshot to `dev/screenshot.png`.

Use after modifying frontend to verify UI renders correctly.

## Local Dev SSH Server

Two options are available for local development. **Lima VM is recommended** because it runs a real Linux OS with its own Docker daemon — just like a real VPS.

### Option A: Lima VM (Recommended)

A real Ubuntu 22.04 VM with Docker Engine pre-installed. Docker containers inside the VM are completely isolated from your Mac.

```bash
./dev/vm.sh start     # Create & start (first run ~3min, downloads Ubuntu + Docker)
./dev/vm.sh stop      # Stop VM (preserves data)
./dev/vm.sh status    # Show status + running containers
./dev/vm.sh ssh       # SSH into VM as testuser
./dev/vm.sh destroy   # Delete VM completely
```

**Requires**: Lima (`brew install lima`), sshpass (`brew install hudochenkov/sshpass/sshpass`)

### Option B: Docker Container (Lightweight)

A Docker container with SSH. Faster to start but Docker commands inside it talk to your **host Mac's Docker daemon** (via socket mount), not an isolated Docker.

```bash
cd dev && docker compose up -d   # Start
cd dev && docker compose down     # Stop
```

> **Note**: Options A and B both use port 2222. Stop one before starting the other.

Host: `127.0.0.1`, Port: `2222`, User: `testuser`, Pass: `testpass`

## File Location Guide

| I need to... | Look in... |
|-------------|-----------|
| Add an API endpoint | `server/src/routes/` |
| Add a Zod schema | `server/src/parsers/schemas/` |
| Add a deterministic parser | `server/src/parsers/deterministic/` |
| Modify SSH connection | `server/src/ssh/connection-manager.ts` |
| Add/modify LLM provider | `server/src/llm/providers/` |
| Add UI component | `client/src/components/` |
| Add reusable UI primitive | `client/src/components/ui/` |
| Modify app state | `client/src/store/` |
| Add shared types | `shared/types.ts` |
| Add test fixtures | `server/tests/fixtures/terminal-outputs/` |
| Check project status | `docs/PROGRESS.md` |
| Get detailed task spec | `docs/phases/phase-{n}.md` |
| Track what files a task created | `docs/TRACEABILITY.md` |

## shadcn/ui Components

49 component files in `client/src/components/ui/`. All use CSS variable design tokens from `client/src/styles.css`. See `AGENTS.md` §19 for the full inventory. Key components: Button, ContextMenu, DropdownMenu, Dialog, AlertDialog, ConfirmDialog, Sheet, Drawer, Tooltip, Popover, Command, Tabs, Table, Card, Form, Input, Select, Checkbox, Switch, Badge, Accordion, Calendar, Chart, Sidebar, Resizable, ScrollArea, Skeleton, Progress, Carousel, FileIcon (custom SVG).