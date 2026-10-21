# Architecture Decision Records (ADRs)

> Every significant technical decision is recorded here with context, options considered, and rationale.
>
> **Format:** ADR-NNN: Title / Status / Date / Context / Decision / Consequences

---

## ADR-001: Local-Only Architecture (No Server Install)

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Existing tools like Cockpit and Webmin install on the server, increasing image size and attack surface. For lightweight VPS instances ($5/month, 50MB base), adding a management UI bloats the server.

**Options Considered:**
1. **Server-installed backend** (like Cockpit) — direct API access to system, no parsing needed
2. **Local app with SSH** — zero server footprint, all intelligence on client

**Decision:** Option 2 — local app connected via SSH.

**Consequences:**
- (+) Zero server footprint — VPS stays unchanged
- (+) Works with any existing server — no setup required
- (+) Security: no additional exposed ports on server
- (-) Must parse terminal output instead of calling system APIs directly
- (-) Higher latency (SSH round-trip + parsing)
- (-) No real-time kernel-level events (would need polling)

---

## ADR-002: LLM-First Parsing, Then Deterministic

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Terminal output parsing is the core technical challenge. Options range from "write regex for everything" to "let LLM handle everything."

**Options Considered:**
1. **Deterministic-only** — regex parsers for all commands from day one
2. **LLM-only** — send everything to GPT/Claude
3. **LLM-first, then migrate** — start with LLM for rapid prototyping, progressively add deterministic parsers for cost/speed

**Decision:** Option 3 — LLM-first, migrate to deterministic for known commands.

**Rationale:**
- LLM-first allows rapid prototyping — ship features without writing parsers for every output format
- Deterministic parsers are tedious to write but essential for production (cost, latency, reliability)
- Progressive migration lets us prioritize: build deterministic parsers for the most-used commands first
- LLM remains as permanent fallback for unknown/complex output

**Consequences:**
- (+) Ship faster — one LLM call handles any command output
- (+) Can measure real-world usage before deciding what to optimize
- (-) Prototype will have 1-3s latency per data panel (LLM round-trip)
- (-) Prototype will incur LLM API costs during development
- (-) Must track which commands still use LLM vs deterministic (transparency)

---

## ADR-003: Node.js + Fastify Backend

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Backend needs to handle SSH connections, WebSocket terminals, HTTP API, and LLM API calls.

**Options Considered:**
1. **Python + FastAPI** — user's initial plan
2. **Node.js + Express** — most popular Node framework
3. **Node.js + Fastify** — faster, native WebSocket, TypeScript-first
4. **Go** — single binary, great for system tools

**Decision:** Option 3 — Node.js + Fastify.

**Rationale:**
- `ssh2` library is Node.js only and is the best SSH client library in any language for this use case
- xterm.js is JavaScript — shared WebSocket protocol understanding
- Fastify has native WebSocket plugin (no socket.io dependency needed)
- TypeScript end-to-end (shared types between server and client)
- Zod schemas work in both Node.js and browser
- User chose Node.js over Python

**Consequences:**
- (+) Single language (TypeScript) for entire stack
- (+) Shared types between server and client
- (+) ssh2 library is mature (5.8k stars, 6.6M weekly downloads)
- (-) Node.js is single-threaded (but all work is I/O-bound, so this is fine)
- (-) No existing server management frameworks in Node.js to build on

---

## ADR-004: Localhost Web App (Not Electron)

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
The UI needs to be interactive and responsive. Options: desktop app framework vs web app in browser.

**Options Considered:**
1. **Electron** — full desktop app, ssh2 works natively
2. **Tauri** — small binary, but ssh2 requires Node.js sidecar
3. **Localhost web app** — Node.js server + browser UI
4. **VS Code extension** — integrate into existing tool

**Decision:** Option 3 — localhost web app for MVP.

**Rationale:**
- Simplest to build and iterate on
- No Electron overhead (150-300MB bundle size)
- Works on any OS with a browser
- Can wrap in Electron later if desktop features needed
- User confirmed this choice

**Consequences:**
- (+) Zero packaging complexity — just `npm run dev`
- (+) Hot reload for frontend — fast iteration
- (+) Accessible from any browser
- (-) No system tray icon, native notifications, or global shortcuts
- (-) User must open terminal + browser separately
- (-) Can upgrade to Electron later (architecturally compatible)

---

## ADR-005: ssh2 Library Directly (Not Wrappers)

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Need SSH client in Node.js. Several options available.

**Options Considered:**
1. **ssh2** (direct) — full control, all SSH features
2. **node-ssh** — Promise wrapper around ssh2, simpler API
3. **ssh2-promise** — auto-reconnect, connection caching

**Decision:** Option 1 — ssh2 directly.

**Rationale:**
- Need multi-channel support: one shell (terminal) + multiple exec (data collection) + SFTP — over one connection
- node-ssh hides channel management — we need it
- ssh2-promise is unmaintained (last publish 4 years ago)
- Direct use gives full control over PTY options, window resize, stream piping

**Consequences:**
- (+) Full control over SSH channels, PTY, streams
- (+) Can implement custom reconnection logic
- (-) More boilerplate than wrapper libraries
- (-) Must handle connection lifecycle manually

---

## ADR-006: Zod for Schema Definition

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Need schema definitions that serve three purposes:
1. TypeScript type generation
2. Runtime validation of parsed data
3. LLM structured output schema (JSON Schema)

**Options Considered:**
1. **TypeScript interfaces only** — no runtime validation
2. **JSON Schema + ts-json-schema** — standard but verbose
3. **Zod** — TypeScript-first, runtime validation, converts to JSON Schema
4. **io-ts** — functional programming style, powerful but complex

**Decision:** Option 3 — Zod.

**Rationale:**
- One schema definition serves all three purposes
- `zodResponseFormat()` in OpenAI SDK converts Zod → JSON Schema for Structured Outputs
- `z.infer<typeof Schema>` generates TypeScript types
- `.parse()` validates at runtime — catches LLM hallucinations
- Most popular TypeScript schema library (31M weekly downloads)

**Consequences:**
- (+) Single source of truth for types, validation, and LLM schemas
- (+) Excellent TypeScript integration
- (+) OpenAI SDK has first-class Zod support
- (-) Bundle size in client (but we primarily use it on server)
- (-) Zod v3 → v4 migration may be needed (v4 released but still settling)

---

## ADR-007: SFTP for File Operations (Not Shell Commands)

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
File operations (read, write, delete, rename) can be done via shell commands (`cat`, `rm`, `mv`) or via SFTP protocol.

**Options Considered:**
1. **Shell commands** — `exec('cat /path')`, `exec('rm /path')`
2. **SFTP** — `sftp.readFile()`, `sftp.unlink()`

**Decision:** Option 2 — SFTP for all file operations.

**Rationale:**
- **Security:** Shell commands are vulnerable to injection (`exec('cat ' + userPath)` is dangerous). SFTP API takes path as a parameter, not part of a shell command — no injection possible.
- **Reliability:** SFTP handles binary files, character encoding, large files with streaming
- **Bonus:** `sftp.readdir()` returns structured data (filename, size, permissions, timestamps) — no parsing needed for file listings
- Shell commands still used for system commands that have no SFTP equivalent

**Consequences:**
- (+) No command injection risk for file operations
- (+) Structured file listings without LLM
- (+) Binary file support, proper streaming
- (-) SFTP session must be managed (lazy init, reconnect)
- (-) Some operations (e.g., `chmod`, `chown`) may still need shell commands

---

## ADR-008: Provider-Agnostic LLM Layer

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
LLM landscape changes rapidly. Users may prefer different providers based on cost, speed, privacy, or availability.

**Decision:** Abstract LLM behind a `LLMProvider` interface. Ship with OpenAI implementation. Add Anthropic and Ollama as stubs.

**Consequences:**
- (+) Users can switch providers via config
- (+) Ollama provides free, offline, low-latency option
- (+) Not locked to any single vendor
- (-) Structured output guarantees differ by provider (OpenAI is strictest)
- (-) Must handle per-provider quirks in implementations

---

## ADR-009: Zustand for Frontend State

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Need state management for: active server, connection states, open tabs, terminal visibility.

**Options Considered:**
1. **React Context + useReducer** — built-in, no dependency
2. **Zustand** — minimal, no boilerplate, great TypeScript support
3. **Redux Toolkit** — powerful but heavy for this use case
4. **Jotai** — atomic state, good for derived state

**Decision:** Zustand.

**Rationale:**
- Minimal boilerplate (no providers, no reducers)
- Excellent TypeScript support
- Easy to use outside React components (useful for WebSocket handlers)
- Tiny bundle size (~1KB)

---

## ADR-010: Hybrid Text + Vision Parsing

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Most terminal output is text-based, but some tools (htop, top, mc, ncurses apps) produce visual output that's meaningless as raw text.

**Decision:** Text-based parsing by default. Vision parsing as an optional fallback — detect ncurses/visual output, render in headless xterm, screenshot, send image to vision model.

**Consequences:**
- (+) Handles any terminal output
- (-) Vision pipeline is expensive and slow
- (-) Requires headless Chromium (Playwright) for screenshots — heavy dependency
- Defer vision implementation to backlog unless specifically needed

---

## ADR-011: Service Container Pattern

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Backend has multiple independent modules (SSH Connection Manager, LLM Provider, Parsing Pipeline, Config Store, App Registry) that need to reference each other. The naive approach — direct imports — creates tight coupling, makes testing hard (can't mock), and gives no control over boot/shutdown order.

Analysis of the Puter project (v2.5.1) revealed a mature Service Container pattern: every backend capability is a `BaseService` with lifecycle hooks (`construct → init → activate`), and services discover each other through a `Container` via `this.services.get('service-name')`.

**Options Considered:**
1. **Direct imports** — each module imports others directly. Simple but tightly coupled.
2. **Dependency injection framework** (tsyringe, inversify) — overkill for this project size.
3. **Service container** — lightweight container with two-phase boot (construct, then init). Services get a reference to the container.

**Decision:** Option 3 — lightweight Service Container with two-phase boot.

**Rationale (informed by Puter's architecture):**
- Puter has 60+ services all managed through one `Container` class — proves the pattern scales
- Two-phase boot (construct then init) solves circular dependency: all services exist before any of them wire together
- `services.get('name')` is explicit — easy to find all usages, easy to mock in tests
- Clean shutdown sequencing (reverse order of boot)
- No external dependency needed — ~50 lines of code for the container

**Consequences:**
- (+) Testing: swap any service with a mock via the container
- (+) Boot ordering: config loads first, then SSH, then LLM, then parsers that depend on both
- (+) Shutdown: close SSH connections before config saves
- (+) Future extensions/plugins can register additional services
- (-) Slight indirection — must look up services by string name instead of direct import
- (-) No compile-time guarantee that `get('ssh')` returns the right type (mitigate with generics)

**Reference:** See [ARCHITECTURE.md § Design Patterns — Pattern 1](ARCHITECTURE.md#pattern-1-service-container-adopt-in-phase-0-1) for the implementation template.

---

## ADR-012: Plugin-Ready App Registry

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
HeadlessOS ships with built-in apps (Dashboard, Files, Docker, Processes, Services). But users will want to add custom management views for specific software (nginx, PostgreSQL, Redis, PM2, etc.).

Puter's extension system shows a clean pattern: extensions register capabilities (services, routes, filesystem backends) through a typed registry. A single `register(typeKey, name, implementation)` method handles named and anonymous registrations.

**Options Considered:**
1. **Hardcoded apps only** — simpler, no plugin API overhead
2. **Plugin system from day 1** — design for extensibility upfront
3. **Plugin-ready structure** — build built-in apps as if they were plugins, but don't expose the plugin API until needed

**Decision:** Option 3 — build all apps as self-contained modules that register through the App Registry. Don't build a public plugin API yet, but follow the pattern so it's trivial to add later.

**Rationale:**
- Forces good architecture: each app declares its commands, schemas, parsers, and UI components in one place
- Adding a new app (e.g., nginx manager) = create one directory with manifest + parser + component
- Can expose as a plugin API later without refactoring core apps
- Puter proves this pattern works at scale (multiple extensions, file system backends, AI providers)

**Consequences:**
- (+) Each app is self-contained and testable in isolation
- (+) Easy to add or remove apps per server (based on `detectedTools`)
- (+) Natural extension point for community contributions
- (-) Slight over-engineering for MVP (only 5 apps)
- (-) Must maintain the registry interface even as internals evolve

---

## ADR-013: Command Orchestrator (Not Frontend Agent)

**Status:** Accepted
**Date:** 2026-04-04

**Context:**
Our parsing pipeline is single-shot: one command → one parse → one result. But real UI views need:
- **Multi-command execution:** Dashboard requires 5-6 commands run in parallel
- **Parse failure recovery:** Zod validation fails → need intelligent retry with error context
- **Command fallback:** `docker` not found → try `podman`. `ip` not found → try `ifconfig`
- **Open-ended investigation:** "Why is disk full?" → chain multiple commands iteratively

The question: where should this orchestration logic live?

**Options Considered:**
1. **Frontend agent (React)** — frontend drives the loop: call API, check result, call next API
2. **Backend orchestrator** — backend handles multi-command, retry, fallback; frontend gets one clean response
3. **Full autonomous agent** — LLM decides every command via tool-calling from the start
4. **Two-layer approach** — backend orchestrator for structured views (Mode 1), optional ReAct agent for investigation (Mode 2)

**Decision:** Option 4 — two-layer approach, backend only. No frontend agent logic.

**Rationale:**
- **Frontend must stay dumb:** If the frontend drives command loops, it needs SSH knowledge, retry logic, parse awareness. This violates separation of concerns and makes the UI fragile.
- **Mode 1 (Execution Plans) covers 90%:** Dashboard, file listing, Docker containers — all are "run these N commands, parse, return." No LLM decision-making needed.
- **Mode 2 (ReAct Agent) is expensive and rare:** Open-ended investigations make multiple LLM calls. Needs robust security (command allowlists). Put in backlog, not Phase 1.
- **Retry with error context is the biggest win:** When Zod rejects an LLM parse, re-sending the error message to the LLM ("expected number, got string for cpuPercent") yields a correct fix >80% of the time.

**Consequences:**
- (+) Route handlers become trivially simple: "execute this plan, return result"
- (+) Parse retry is automatic and intelligent (includes Zod error in re-prompt)
- (+) Multi-command views (dashboard) are fast (parallel SSH exec)
- (+) Command fallback makes the app work across different distros
- (-) Execution plans must be pre-defined per view (can't dynamically choose commands)
- (-) Mode 2 (investigation agent) deferred — won't ship in MVP

**Reference:** See [ARCHITECTURE.md § Command Orchestrator](ARCHITECTURE.md) for the implementation design.

---

## ADR-014: Agent Tool Safety (Command Allowlists for Agent Mode)

**Status:** Accepted — command allowlist and write commands superseded by [ADR-024](#adr-024-agents-run-typed-actions-not-shell-commands) (EX9)
**Date:** 2026-04-04

**Context:**
When the ReAct agent (Mode 2, backlog) is eventually built, the LLM will dynamically choose which commands to execute on the user's server. This is powerful but dangerous — the LLM could hallucinate destructive commands (`rm -rf /`, `mkfs`, `shutdown`).

**Decision:** The investigation agent will have:
1. **Read-only tool set by default** — `exec_command` only runs commands from a read-only allowlist
2. **Explicit user opt-in for write commands** — investigation cannot modify the system unless user specifically enables it
3. **Step limit** — max 10 commands per investigation (prevents runaway loops)
4. **Token budget** — max token spend per investigation (prevents cost explosion)
5. **Live progress streaming** — user sees what the agent is doing and can abort

**Read-only allowlist (for agent `exec_command` tool):**
```
cat, head, tail, less, wc, grep, find, ls, stat, file,
df, du, free, vmstat, iostat, top -bn1, ps, uptime, hostname,
uname, lsblk, mount, ip, ss, netstat, nslookup, dig, ping -c3,
docker ps, docker images, docker inspect, docker logs,
systemctl status, systemctl list-units, journalctl,
nginx -t, apache2ctl -t, git log, git status
```

**Blocked patterns (never allowed, even with opt-in):**
```
rm -rf /, mkfs, dd if=, shutdown, reboot, init 0,
:(){ :|:& };:, chmod -R 777 /, > /dev/sda
```

**Consequences:**
- (+) LLM cannot destroy the server even if it hallucinates
- (+) User has full visibility into what agent does
- (+) Cost is bounded per investigation
- (-) Agent can't fix problems it finds (read-only by default)
- (-) Allowlist must be maintained as new commands are needed

---

## ADR-015: Dynamic UI Engine — JSON Schema → LLM-Generated Interfaces

**Status:** Accepted
**Date:** 2026-04-11

**Context:**
HeadlessOS currently has hardcoded React components for every view (Dashboard, Docker, Files, etc.). Adding a new tool requires creating a complete React component, backend route, parser, and schema — significant effort even for simple data displays.

The "core differentiator" vision for HeadlessOS is **dynamic UI generation**: an LLM analyzes terminal output and produces a JSON schema that describes widgets (tables, charts, badges, key-value pairs, etc.), and a generic renderer turns that schema into a live visual interface. This eliminates the need for per-tool hardcoded UIs and allows HeadlessOS to visually represent **any** command output without developer effort.

**Options Considered:**

1. **Full LLM generation (LLM invents layout every time)** — Maximum flexibility, but slow (2-5s), expensive, and inconsistent layouts between runs.
2. **Template-only (pre-built JSON templates, no LLM)** — Fast, free, consistent, but requires a template for every tool (back to square one).
3. **Hybrid: Template Library + LLM Customization** — LLM picks from a curated template library, customizes fields/labels/colors for the specific data. Falls back to pure generation for unknown tools.

**Decision:** Option 3 — Hybrid Template + LLM.

### Core Architecture

```
User triggers (Command Palette / Agent)
    │
    ▼
DynamicUIGenerator (backend service)
    ├── Template Library (15-20 JSON templates for common patterns)
    ├── LLM Generation (streaming) — picks template OR generates from scratch
    └── Zod Validation (DynamicViewSchema)
    │
    ▼ (WebSocket — incremental JSON chunks)
    │
DynamicViewRenderer (React)
    ├── Renders widgets progressively as JSON arrives
    ├── Widget components: Table, KV, Badge, Chart, StatCard, CodeBlock, Alert, Progress, Tree, LogViewer
    └── Layout components: Tabs, Sidebar, Grid
```

### Key Sub-Decisions

**1. Streaming / Incremental Rendering (CRITICAL)**
- The LLM generates JSON **incrementally** via streaming (not waiting for full response)
- Backend streams partial `DynamicViewSchema` chunks to the frontend via WebSocket
- Frontend `DynamicViewRenderer` renders each widget **as it arrives** in the JSON stream
- This creates a "magical" progressive build effect — the user sees the UI assembling in real-time
- Partial schemas are valid: `{ widgets: [widget1] }` renders immediately, then `widget2` appears when it arrives
- Similar pattern to agent step streaming (M11.6) but for UI elements instead of investigation steps

**2. DynamicViewSchema (Zod)**
- Single Zod schema defines all possible widget types and layouts
- Serves dual purpose: runtime validation + `zodResponseFormat()` for LLM structured output
- Widget types: `table`, `key-value`, `badge-grid`, `stat-card`, `progress-bar`, `code-block`, `alert`, `chart`, `tree`, `log-viewer`, `form`
- Layout types: `stack` (vertical), `grid`, `tabs`, `sidebar`
- Each widget has optional `dataSource` for live refresh

**3. DynamicViewRenderer (React)**
- Generic renderer that maps widget types → React components
- All widget components use existing shadcn/ui primitives (Table, Card, Badge, Progress, etc.)
- Handles partial schemas gracefully (renders what's available, shows skeleton for pending)
- Wrapped in `AppWindow` for overlay display; can also embed in desktop tabs

**4. Template Library**
- JSON templates for common patterns: system overview, package list, log viewer, config file, port table, user list, etc.
- Templates are parameterized: `{{ fieldName }}` placeholders filled by LLM or data
- LLM can select a template and customize it, or generate entirely new JSON for unknown tools
- Templates live in `server/src/dynamic-ui/templates/`

**5. Trigger Mechanism**
- Phase 1: Command Palette (user explicitly types tool/package name)
- Phase 2: Agent integration (investigation agent generates dynamic UIs for its findings)
- Phase 3: Terminal buffer capture (auto-detect interesting output, offer dynamic view)

**6. Experimental Track**
- This feature uses task IDs `EX1.1` through `EX1.14` — separate from main milestones
- Won't disrupt existing hardcoded views — Dynamic UI is additive
- Hardcoded views remain for core apps (Dashboard, Docker, Files) — dynamic UI extends to new tools

**Consequences:**
- (+) Any CLI tool gets a visual UI without writing React components
- (+) Template library ensures consistency for common patterns
- (+) Streaming makes generation feel instant and "magical" — no loading spinner, just progressive build
- (+) Zod schema is single source of truth for both validation and LLM generation
- (+) Experimental track doesn't risk breaking existing functionality
- (+) Reuses existing infrastructure: shadcn/ui components, WebSocket streaming, LLM provider, Zod pipeline
- (-) Streaming JSON parsing adds complexity (must handle partial/incomplete structures)
- (-) Template library needs ongoing curation as new tools are discovered
- (-) LLM-generated layouts may occasionally be suboptimal (mitigated by templates)
- (-) Cost per dynamic UI generation (mitigated by caching + template reuse)

**Reference:** See [phases/phase-ex1.md](phases/phase-ex1.md) for the full implementation spec.

---

## ADR-016: Multi-Model UI Generation Agent (Plan → Reactive Execute → Reflect)

**Status:** Accepted (revised 2026-04-08 based on agent architecture research)
**Date:** 2026-04-07 (revised 2026-04-08)

**Context:**
The Dynamic UI Engine (ADR-015) generates `DynamicViewSchema` JSON from terminal output. The current `InvestigationAgent` (M11.5) is a simple single-model, single-loop ReAct agent designed only for read-only server diagnosis. It cannot:
- Generate structured UI schemas (only produces text answers)
- Use multiple models for different tasks (reasoning vs structured output)
- Self-correct on Zod validation failures with deep analysis
- Perform write operations (edit configs, restart services)
- Plan multi-step tasks before executing them
- Reflect on output quality and iterate

We need a **UI Generation Agent** — a robust, multi-model agent specialized in generating interactive `DynamicViewSchema` UIs.

**Research (2026-04-08):** Deep-analyzed three production coding agents — **Roo Code**, **Continue**, and **Aider** — to learn battle-tested agentic AI patterns. Key findings documented in [AGENT_RESEARCH_EX2.md](phases/AGENT_RESEARCH_EX2.md).

**Critical insight from research:** All three agents use **reactive tool-calling loops** where the LLM decides tools dynamically via native function calling — NOT rigid pre-planned step sequences. The original "Planner produces a step-by-step tool list → Executor runs them in order" design was replaced with "Planner produces high-level hints → Executor runs a reactive loop with native function calling."

**Options Considered:**

1. **Extend InvestigationAgent** — Add model routing and schema generation to the existing agent.
2. **New agent class with rigid Plan→Execute→Reflect** — Original design (pre-research).
3. **New agent class with reactive Plan→Loop→Reflect** — Research-informed design.
4. **Agent framework (LangChain, AutoGen, CrewAI)** — Use an existing agent framework.

**Decision:** Option 3 — New `UIAgent` class with reactive tool-calling loop, informed by Roo Code/Continue/Aider patterns.

**Rationale:**
- Option 1 rejected: InvestigationAgent is fundamentally read-only with a flat ReAct loop. Retrofitting adds complexity.
- Option 2 revised: The rigid plan-then-execute approach fails when commands return unexpected results. Real agents need to react dynamically.
- Option 3 chosen: Reactive loop with native function calling matches how all successful coding agents work. The LLM decides tools based on observed results, self-corrects on errors inline, and produces output when ready.
- Option 4 rejected: Massive dependency trees, abstraction overhead, and vendor lock-in.

### Core Architecture: Plan → Reactive Execute → optional Post-Reflect

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Agent Pipeline (v2)                    │
│                                                              │
│  ┌──────────────┐    ┌─────────────────────┐    ┌────────┐ │
│  │   PLANNER    │───▶│  REACTIVE EXECUTOR  │───▶│REFLECT │ │
│  │ (Reasoning)  │    │  (Structured Output) │    │(opt.)  │ │
│  │ o3 / o4-mini │    │  GPT-4.1 + fn call  │    │o4-mini │ │
│  └──────┬───────┘    └──────┬───────────────┘    └────┬───┘ │
│         │                   │                         │      │
│  • Parse intent      • Native function calling  • Quality   │
│  • Expected widgets  • LLM decides tools        • Semantic   │
│  • Template hint     • Inline Zod validation    • Optional   │
│  • Skip-reflect?     • Self-corrects errors     • for complex│
│         │                   │                         │      │
│         │              Stack-based loop               │      │
│         │              (from Roo Code)                │      │
│         │              Safety rails:                  │      │
│         │              • consecutiveMistakeCount      │      │
│         │              • toolRepetitionDetector       │      │
│         │              • maxSteps (20)                │      │
│         │              • contextCompaction (80%)      │      │
│         └───────────────────┴─────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns from Research

| Pattern | Source | Our Implementation |
|---------|--------|--------------------|
| Native function calling | Roo Code + Continue | Tools as `ChatCompletionTool[]`, `tool_choice: auto` |
| Stack-based loop | Roo Code `Task.ts` | Explicit `StackItem[]` in UIAgent orchestrator |
| Tool-result-per-tool-use | Roo Code | Every tool_call gets a result (even when blocked) |
| Consecutive mistake detection | Roo Code | 3 turns without tools → abort |
| Tool repetition detection | Roo Code `ToolRepetitionDetector` | Same tool+args 5x → warning |
| Error-as-context-item | Continue | Tool failures become tool results for self-correction |
| Architect → Editor delegation | Aider `ArchitectCoder` | Planner (reasoning) → Executor (structured output) |
| Typed reflection errors | Aider `reflected_message` | `actualData` + `didYouMean` in reflection issues |
| Weak model for cheap ops | Aider (main/editor/weak) | `weak` model role for summarization, classification |
| Context compaction at 80% | Continue `compaction.ts` | ContextManager summarizes history with weak model |
| Exponential backoff | Roo Code `backoffAndAnnounce` | Rate limit → countdown event → retry with doubling delay |
| Inline Zod "linting" | Aider auto-lint pattern | Zod failures fed as tool results → LLM fixes inline |

### Key Sub-Decisions

**1. Four Model Roles (OpenAI Only)**
- **Reasoning model** (o3, o4-mini): Planning, post-reflection, error analysis, CoT thinking
- **Structured output model** (GPT-4.1, GPT-4o): DynamicViewSchema generation via native function calling + `zodResponseFormat()`
- **Fast model** (GPT-4.1-mini, GPT-4o-mini): Quick decisions, streaming, cheap UI generation
- **Weak model** (GPT-4.1-nano): Context compaction/summarization, classification — maximum cost savings
- Model selection is per-phase, not per-request — the agent controls routing

**2. Reactive Execution with Native Function Calling**
- Executor uses `tools` parameter with `tool_choice: "auto"` — the LLM decides which tools to call
- No rigid pre-planned step list — the LLM observes tool results and decides next action dynamically
- `generate_schema` tool is the terminal action — when the LLM calls it, execution ends successfully
- Every `tool_call` gets a corresponding `tool` message result (even when blocked by security)

**3. Three-Tier Command Security**
- **READ tier** (always allowed): All `AGENT_READ_ONLY_ALLOWLIST` commands
- **WRITE tier** (allowlisted, auto-approved): Config edits via SFTP, service management (`systemctl restart/reload`)
- **DENY tier** (always blocked): `rm -rf /`, `mkfs`, `dd if=`, `shutdown`, pipe-to-shell. Hardcoded, cannot be bypassed.

**4. Inline Self-Correction (Zod-as-Linter)**
- When the `generate_schema` tool is called, output is validated with Zod immediately
- If Zod fails → error is returned as the tool result → LLM fixes inline in the same loop
- This replaces the old design where validation failures required a separate reflection phase
- Post-generation reflection is optional — only for complex interactive UIs (forms, multi-tab)

**5. Safety Rails (from Roo Code)**
- `consecutiveMistakeCount`: 3 turns without tool calls → abort with explanation
- `ToolRepetitionDetector`: Same tool+args called 5x → warning injected
- `maxSteps`: Hard limit (default 20) prevents infinite loops
- `didToolFailInCurrentTurn`: Prevents retry flood after tool failure

**6. Context Management (from Continue)**
- `ContextManager` tracks token usage across the conversation
- At 80% of model context window → compact history using weak model
- Prevents context overflow errors in long agent sessions

**Consequences:**
- (+) Reactive loop produces higher quality output than rigid pre-planned execution
- (+) Native function calling leverages LLM training — models are optimized for tool use
- (+) Inline Zod validation reduces LLM calls (no separate reflection for syntax errors)
- (+) Four model roles optimize cost (weak model for cheap ops, reasoning only when needed)
- (+) Safety rails prevent infinite loops and runaway costs (battle-tested in Roo Code)
- (+) Context compaction allows long agent sessions without context window overflow
- (+) Self-correcting: errors become tool results → LLM fixes inline
- (+) Dynamic UIs become interactive — config editing, service management
- (-) More complex than InvestigationAgent (but solves a harder problem)
- (-) Multiple LLM calls per generation increases cost (mitigated by caching + weak model)
- (-) Write tier allowlist needs maintenance as new tools are supported
- (-) Post-reflection is optional, which may miss semantic quality issues in simple mode

**Reference:** See [phases/phase-ex2.md](phases/phase-ex2.md) for the full implementation spec and [phases/AGENT_RESEARCH_EX2.md](phases/AGENT_RESEARCH_EX2.md) for research synthesis.

---

## ADR-017: Two-Pass Design Classifier & Smart Layout Engine

**Status:** Accepted
**Date:** 2026-04-12

**Context:**
The Dynamic UI Engine (EX1) and UI Agent (EX2) generate views from terminal output, but layouts default to vertical stacking — stat-cards stacked instead of gridded, multiple related tables stacked instead of tabbed, no visual hierarchy. The LLM makes layout decisions in the same pass as data extraction, leading to poor design choices. The system is a server management tool, not a visualization/charting platform, but charts were being overused.

**Options Considered:**
1. **Single-pass with better prompts** — Add more layout rules to the existing system prompt and hope the LLM follows them
2. **Two-pass design classifier** — A fast, cheap classifier determines content type and layout pattern before the main generator runs, constraining its output
3. **Template-only approach** — Remove LLM layout decisions entirely, use strict template matching based on command/tool name

**Decision:** Option 2 — Two-pass design classifier with layout pattern library

**Rationale:**
- Single-pass prompts are unreliable — the LLM's layout choices are inconsistent and degrade with complex output
- Template-only is too rigid — novel commands or atypical output produce poor results
- Two-pass combines the best of both: fast classification (< 500ms, cheap model) constrains the generator to follow proven layout patterns while retaining LLM flexibility for data extraction and widget population
- The classifier also gates chart/gauge usage via `useVisualization` flag, enforcing "widgets first, charts second" philosophy

**Key Design Decisions:**
- **10 content types** (metrics-overview, data-table, multi-dataset, config-review, status-board, log-analysis, tree-hierarchy, audit-report, comparison, detail-view)
- **10 layout patterns** (dashboard-metrics, single-table, tabbed-detail, config-viewer, status-overview, log-viewer, tree-explorer, audit-report, comparison-grid, detail-overview)
- **Responsive auto-fit grid** via CSS `repeat(auto-fit, minmax(Xpx, 1fr))` — stat-cards reflow automatically
- **Charts/gauges gated** — only used when classifier sets `useVisualization: true` with justification
- **Progressive assembly** — skeleton first, widgets stream in via `layout_update` events

**Consequences:**
- (+) Consistent, professional layouts across all content types
- (+) Fast first visual (< 1.5s skeleton) via early classification
- (+) Chart/gauge usage properly constrained — not overused
- (+) Layout patterns are reusable and testable independently of LLM
- (+) FakeLLM generator enables template QA without LLM costs
- (-) Two LLM calls per generation (classifier + generator) — mitigated by cheap classifier model
- (-) 10 patterns may not cover every edge case — need escape hatch for novel layouts
- (-) Pattern library requires maintenance as new widget types are added

**Reference:** See [phases/phase-ex3.md](phases/phase-ex3.md) for the full implementation spec.

---

## ADR-018: Embedded LLM Observatory — In-Process Trace & Span Debugger

**Status:** Accepted
**Date:** 2026-04-13

**Context:**
HeadlessOS makes extensive LLM calls — the UI Agent pipeline alone makes 5-20+ calls per session (plan → reactive executor → reflect), the DynamicUIGenerator makes 2 per view (classify + generate), and the InvestigationAgent makes 3-15 per investigation. Debugging these pipelines is currently impossible: the only observability is `GET /api/stats/llm` which returns flat aggregates (total tokens, cost, calls-by-model). There is no way to see:

- What the planner's prompt looked like and what it returned
- Which tools the executor called and in what order
- Why the reflector requested a re-execution
- Token/cost breakdown per-phase (plan vs execute vs reflect)
- What went wrong when an agent session produces a bad UI

Python has [Arize Phoenix](https://github.com/Arize-AI/phoenix) — a self-hosted LLM observability tool with trace trees, span details, and token tracking. **Nothing equivalent exists in the JavaScript/Node.js ecosystem.** All JS options (Langfuse, Helicone, OpenLLMetry, Braintrust, Lunary) require external cloud services or heavy infrastructure (PostgreSQL + ClickHouse for self-hosted Langfuse).

Since HeadlessOS is a localhost app with no external dependencies, we need an embedded solution.

**Options Considered:**

1. **Integrate Langfuse self-hosted** — Requires PostgreSQL + ClickHouse. Massive infrastructure for a localhost app.
2. **Use OpenTelemetry + Jaeger** — OTLP export to Jaeger. Requires running Jaeger as a separate service. Generic tracing, not LLM-aware.
3. **Build custom, Phoenix-inspired, in-process Observatory** — In-memory TraceStore with ring buffer, AsyncLocalStorage context propagation, REST + WebSocket API, custom React UI.
4. **Just improve the existing stats endpoint** — Add per-model and per-command breakdowns to `GET /api/stats/llm`. No hierarchy, no content, no tree.

**Decision:** Option 3 — Custom embedded LLM Observatory, inspired by Phoenix's architecture.

**Rationale:**
- Option 1 rejected: Unacceptable infrastructure requirements for a localhost app. PostgreSQL + ClickHouse just for trace storage.
- Option 2 rejected: OTLP/Jaeger is designed for distributed systems, not in-process LLM debugging. Generic spans lack LLM-specific abstractions (model, role, tokens, cost, prompt/response).
- Option 3 chosen: Lightweight, zero-dependency, in-memory. Uses patterns proven by Phoenix (trace→span tree, cumulative token rollup, lazy content serialization) but implemented as a simple Map-based store with AsyncLocalStorage context.
- Option 4 rejected: Flat stats can't answer "why did the agent produce a bad UI?" — need per-call content and hierarchy.

### Key Design Decisions

**1. In-Memory Ring Buffer (Not Database)**
- 200-trace ring buffer — oldest evicted when full
- All storage is `Map<string, Trace/Span>` — O(1) read/write
- No persistence across server restarts (traces are debugging data, not business data)
- Memory bounded: ~10-20MB for 200 traces (controlled by lazy serialization)

**2. AsyncLocalStorage for Context Propagation**
- Node.js native `AsyncLocalStorage` carries `{ traceId, spanId }` through async call stacks
- `withTrace()` / `withSpan()` wrappers automatically link parent↔child spans
- Near-zero overhead (~0.01ms, used by Next.js/Fastify for request context)
- No manual parent tracking needed in instrumented code

**3. Cumulative Token Rollup at Write Time (Phoenix Pattern)**
- When a span ends, walk up the parent chain to root, updating `cumulative.tokenUsage` and `cumulative.costUsd` at each ancestor
- This means trace-level totals are always up-to-date without querying all descendant spans
- Computed at write time (endSpan), not read time (API request) — keeps API responses fast

**4. REST + WebSocket (Not GraphQL)**
- Phoenix uses Strawberry GraphQL + Relay — overkill for embedded use
- Simple REST endpoints for list/detail/stats + WebSocket for live updates
- Matches HeadlessOS's existing API pattern (Fastify REST + WS)

**5. Lazy Content Serialization**
- Span `input`/`output` stored as JavaScript object references (not JSON strings)
- Serialized to JSON only when the detail API endpoint is called
- List and tree endpoints return spans without content (set to `null`)
- Prevents serialization of large prompts on every API call

**6. Four Span Kinds (Simplified from Phoenix)**
- Phoenix has 9+ span kinds (LLM, CHAIN, TOOL, AGENT, RETRIEVER, EMBEDDING, EVALUATOR, GUARDRAIL, RERANKER)
- HeadlessOS needs only 4: **LLM** (individual call), **AGENT** (root session), **CHAIN** (pipeline phase), **TOOL** (tool execution)
- Fewer kinds = simpler UI, less code, still covers all use cases

**Consequences:**
- (+) Debug any LLM pipeline by clicking through the trace tree
- (+) Zero external dependencies — nothing to install, configure, or maintain
- (+) Near-zero performance overhead (< 1ms per span, ~0.01ms typical)
- (+) Bounded memory (ring buffer evicts old traces)
- (+) Live debugging — watch agent spans appear in real-time via WebSocket
- (+) Reuses existing infrastructure (Fastify REST/WS, shadcn/ui, Zustand, recharts)
- (-) No persistence — traces are lost on server restart (acceptable for debugging tool)
- (-) 200-trace limit may miss historical data (can increase if memory allows)
- (-) Custom UI effort — no existing JS trace viewer to reuse
- (-) Ring buffer eviction is FIFO, not LRU (could evict actively-referenced traces if 200+ traces generated without clearing)

**Reference:** See [phases/phase-ex4.md](phases/phase-ex4.md) for the full implementation spec.

---

## ADR-019: Sandbox CLI Discovery for Agent App Generation

**Status:** Accepted
**Date:** 2026-04-12

**Context:**
HeadlessOS's UIAgent (EX2) can generate dynamic UIs from terminal output, but to create management UIs for arbitrary CLI tools (restic, nginx, redis-cli, etc.), the agent needs to run discovery commands like `--help`, `--version`, and `man`. Running unknown commands directly on a production server carries risk — a malformed flag or unexpected side-effect could cause harm. We need a safe environment for CLI introspection while still generating schemas that work against the real server.

**Options Considered:**

1. **Run discovery directly on the target server** — Simplest. Just open the allowlist for `--help` patterns. Risk: unexpected tool behavior, resource consumption, or side effects.
2. **Docker container on target server** — Spin up an ephemeral container matching the server's OS, install the tool, run discovery inside it, then destroy it. Schema applies to the real server.
3. **Docker container locally (Mac/desktop)** — Run discovery on the user's machine. Zero server impact but different OS/arch may produce different `--help` output.
4. **firejail/bubblewrap on server** — Kernel-level sandboxing. Not universally available, complex setup.

**Decision:** Option 2 — Ephemeral Docker container on the target server, with Option 1 as fallback when Docker isn't available.

**Rationale:**
- Option 2 provides real isolation (separate PID/network/filesystem namespace) while matching the server's OS/architecture so `--help` output, paths, and package names are accurate
- Resource-capped (`--memory=256m`, `--cpus=0.5`, `--pids-limit=100`) and network-isolated (`--network=none` during discovery)
- Automatic cleanup: 5-minute TTL + orphan reaper on service start
- HeadlessOS already has full Docker management routes (`docker run/exec/rm`) and multi-server SSH — minimal new infrastructure needed
- Option 1 (direct execution) remains available as fallback with a clear toggle — some users may prefer speed over isolation for trusted tools
- Option 3 rejected: Cross-platform differences make schemas unreliable (e.g., macOS `--help` vs Linux `--help` differ for many tools)
- Option 4 rejected: Not available on all servers, complex configuration

### Key Design Decisions

**1. `docker exec` (Not SSH-into-container)**
- No sshd needed inside the sandbox container
- Uses existing `connectionManager.exec()` with `docker exec {containerId} {command}`
- Simpler, faster, fewer attack vectors

**2. Network Toggle for Package Installation**
- Sandbox starts with `--network=none` for discovery safety
- Temporarily connects to bridge network for `apt install` via `docker network connect/disconnect`
- Alternatively: pre-install packages before applying network restrictions

**3. OS-Matched Base Image**
- `get_server_context()` already detects the server's OS (Ubuntu/Debian/CentOS/Alpine)
- Sandbox uses matching base image so discovery output matches reality
- Fallback: `ubuntu:22.04` if OS detection fails

**4. Two-Phase Agent Flow**
- Phase 1 (Discovery): All `--help` / `man` / `--version` commands routed to sandbox via `sandbox_exec` tool
- Phase 2 (Apply): Schema rendered against real server, `dataSource` commands and action buttons use real `exec_command`
- Clean separation: sandbox is for learning about the tool, real server is for using it

**5. SandboxManager as BaseService**
- Follows existing ServiceContainer pattern (ADR-011)
- Lifecycle: `_construct()` → `_init()` (reap orphans) → `_destroy()` (destroy all active sandboxes)
- Registered in `ServiceContainer` alongside existing services

**Consequences:**
- (+) Safe discovery — unknown CLI tools can't harm production server
- (+) Accurate schemas — same OS/arch as target server
- (+) Reuses existing infrastructure — Docker routes, SSH manager, agent tools
- (+) Optional — users can toggle sandbox off for trusted tools or servers without Docker
- (+) Bounded resources — memory/CPU/PID limits prevent resource exhaustion
- (+) Auto-cleanup — TTL + orphan reaper prevent container leaks
- (-) Requires Docker on target server (graceful fallback to direct mode)
- (-) ~10-15s overhead for container creation + package installation
- (-) Network toggle for install is a brief moment of connectivity (mitigated: only `apt install`, then disconnect)
- (-) Additional complexity in the agent flow (two-phase execution)

**Reference:** See [phases/phase-ex5.md](phases/phase-ex5.md) for the full implementation spec.

---

## ADR-020: Multi-Session Desktop Architecture (Citrix-Style)

**Status:** Accepted
**Date:** 2026-04-18

**Context:**
HeadlessOS today supports a **single active desktop**. `app-store.activeServerId` selects which server's windows are rendered; switching servers wipes the visible UI even though `window-store.windows` are tagged with `serverId`. Real users (per requirements: ~6 servers — app, db, logging, monitoring, etc.) need to keep multiple servers "open" at the same time the way Citrix Workspace / RDP keeps multiple sessions alive, and switch between them without losing state.

**Options Considered:**
1. **Status quo: single active server** — simple, but every server switch is jarring; no persistence
2. **Tabbed servers** — one server per browser tab; relies on the OS window manager. Loses unified UI, can't share clipboard or notifications
3. **Multi-session model (Citrix-style)** — N concurrent in-memory sessions, each with its own desktop state, switched via a top-edge hover bar. One session per server.
4. **N sessions per server (XenApp-style)** — multiple parallel sessions on the same server with explicit session IDs. Maximum flexibility, maximum complexity.

**Decision:** Option 3 — one session per server, multiple concurrent sessions, hover-reveal Session Switcher.

**Rationale:**
- Matches the user's mental model: "the DB server", "the logging server" — one persistent workspace per box
- Re-uses the existing `serverId` tagging on windows — windows just become session-scoped instead of globally filtered
- Single SSH connection per server is already the model (ADR-005 multi-channel) — no SSH topology change required
- Background sessions stay connected (no idle-hibernate); only explicit user action or app close hibernates a session — avoids constant reconnect churn for users who switch servers all day
- Hover-reveal switcher mirrors Citrix's familiar pattern and keeps screen real estate clean
- Per-session accent color is the **primary safety mechanism** against running destructive commands on the wrong server (more reliable than reading the title bar)
- N-per-server (Option 4) deferred indefinitely — adds session-IDs everywhere for a use case that isn't requested

**Consequences:**
- (+) Users can keep many servers "live" and switch instantly
- (+) Clear visual identity per server reduces cross-server mistakes
- (+) Cleanly separates "this server" (session-scoped state) from "across servers" (global state like Fleet, LLM Observatory)
- (+) Forces a clean refactor of stores into well-defined scopes (session vs global)
- (–) N parallel SSH connections — must throttle background polling for inactive sessions
- (–) Significant refactor: every store currently scoped to `activeServerId` must move into the session
- (–) `Fleet` view must move out of the desktop (it's a meta view) — see ADR-020 follow-on

**Reference:** See [phases/phase-ex6.md](phases/phase-ex6.md) for the implementation plan.

---

## ADR-021: Session Persistence & Hibernation

**Status:** Accepted
**Date:** 2026-04-18

**Context:**
Multi-session desktops (ADR-020) need a persistence story so closing the laptop or browser doesn't destroy work. Users want Windows-hibernation-style behavior: reopen the app, unlock once, find every server's windows back where they were.

**Options Considered:**
1. **Ephemeral only** — sessions live in memory, lost on refresh. Status quo for the existing single-desktop. Unacceptable for multi-session.
2. **Browser-only persistence** — IndexedDB / `localStorage`. Survives refresh but lost on browser data clear / new device.
3. **Backend-file persistence** — JSON per server in `~/.headlessos/sessions/{serverId}.json`, matching the existing `servers.json` pattern (ADR-001 / M1.6). Authoritative, survives browser, enables future multi-device sync.
4. **Three-tier (Hot / Warm / Cold)** — in-memory for active, debounced `localStorage` for refresh-safety, backend file for hibernation.

**Decision:** Option 4 — three-tier storage with backend file as the cold tier (authoritative).

**Storage Tiers:**

| Tier | Where | Survives | Latency | Purpose |
|------|-------|----------|---------|---------|
| Hot | `useSessionsStore` (Zustand, in-memory) | tab open | instant | active + background sessions |
| Warm | `localStorage` (debounced 500ms flush) | browser refresh | ~ms | crash recovery |
| Cold | `~/.headlessos/sessions/{serverId}.json` | browser close, multi-device | ~10–50ms | hibernation, app restart |

**Lifecycle States:**

| State | SSH | In-Memory | Persisted | Rendered |
|-------|-----|-----------|-----------|----------|
| `active` | connected | yes | warm + dirty-flag | foreground |
| `background` | connected | yes | warm + dirty-flag | hidden, throttled polling |
| `hibernated` | disconnected | no | cold | not rendered |
| `terminated` | — | no | none | not rendered |

**Hibernation triggers (auto-hibernate disabled by default):**
- Explicit user action (right-click tile → Hibernate, `Ctrl/Cmd+Shift+H`)
- App close / browser close (graceful flush via `beforeunload`)
- Backend graceful shutdown

**Wake flow:**
1. App load detects hibernated sessions
2. Single unified lock screen → unlock once → all sessions begin parallel reconnect
3. Each session shows status in switcher (connected / reconnecting / failed-click-to-retry / hibernated)
4. User lands on the last-active session

**Persisted Per Session (cold tier):**
- Window layout: positions, sizes, z-order, minimized/maximized, app id + per-window meta
- Open dynamic-ui pinned views (refs, not rendered HTML)
- Terminal references (cwd, app id) — process not restored, terminal re-spawns fresh
- Per-session preference overrides (ADR-022)
- Last-active app, last-focused window
- Clipboard (already per-server)
- Agent conversation history (cap: last 50 sessions per server)
- Notification badge counts

**Not Persisted:**
- SSH connection (recreated on wake)
- Live terminal scrollback
- In-flight agent generations (must restart)
- LLM Observatory traces (separate global persistence — see ADR-021 follow-on)

**Rationale:**
- Backend file matches the existing `servers.json` pattern users already trust
- Three tiers separate "instant" (hot) from "refresh-safe" (warm) from "device-safe" (cold) — each problem solved at the right layer
- Unified lock-screen wake is simpler than per-session locks and mirrors Windows hibernation UX
- No idle auto-hibernate avoids the daily-switcher pain point of constant SSH reconnects
- Capping agent history at 50 per server bounds disk usage (~5–50MB per server worst case)

**Consequences:**
- (+) Survives browser close, laptop shutdown, browser reinstall
- (+) Single auth gate on wake — fast for trusted environments, secure for shared machines
- (+) Reuses existing `~/.headlessos/` config dir convention
- (+) Authoritative source enables future multi-device sync without rewriting persistence
- (–) Adds backend write traffic on every dirty-flush (mitigated: warm tier debounces; cold tier only on hibernate / app close)
- (–) Schema migration burden — `SessionStateSchema` versioning needed for future changes
- (–) Need a sane handling of corrupted session files (graceful drop + warning, never block app load)

**Reference:** See [phases/phase-ex6.md](phases/phase-ex6.md) for the implementation plan.

---

## ADR-022: Per-Session Preference Layering

**Status:** Accepted
**Date:** 2026-04-18

**Context:**
With multi-session desktops (ADR-020), preferences like wallpaper, accent color, terminal font, polling interval, and pinned apps need to be **per-server**, not globally shared. A user's prod-DB session may want a red accent and high polling, while their logging server wants a blue accent and low polling. But forcing every preference per-server would force users to reconfigure each server they add — bad UX.

**Options Considered:**
1. **Global only (status quo)** — prefs apply everywhere. Simple but no per-server tuning.
2. **Per-server only** — every preference is owned by a session. Maximum flexibility, painful default.
3. **Layered: global defaults ⊕ per-session overrides** — global value is the default, per-session value overrides if set.

**Decision:** Option 3 — layered preferences with global defaults and per-session overrides.

**Resolution rule:** `effective[key] = sessionOverrides[key] ?? globalDefaults[key]`

**UI implication:** Settings dialog gets a scope toggle: **`Global / This Server`**. The "This Server" view shows only overrides; an explicit "Reset to global default" button clears an override. Most preferences default to inheriting the global value.

**Always Global (cannot be per-session):**
- Theme mode (light/dark/auto) — confusing if servers disagree on theme
- LLM provider config and API keys — shared across all sessions
- Account / sign-out behavior

**Per-session by default:**
- Accent color (drives session visual identity — ADR-020)
- Wallpaper (defer — EX6-D)
- Terminal font / size
- Auto-refresh polling interval
- Default app on launch
- Clock format (defer — keep global initially)

**Per-session optional override:**
- Pinned apps (default: global; can override per server for specialized servers)
- Notification preferences

**Rationale:**
- Layered model is the smallest change that enables per-server differentiation while keeping the "set once globally" workflow for common preferences
- Accent color being per-session-by-default forces visual differentiation — this is a safety feature, not a cosmetic one
- Theme being global avoids the "white desktop / dark window" jank when switching sessions
- Clear scope toggle in Settings makes the model legible to users without explaining "layering"

**Consequences:**
- (+) Sane defaults — adding a new server inherits all global preferences
- (+) Power users get full per-server control where it matters
- (+) Visual safety — per-session accent prevents wrong-server commands
- (–) Settings UI gets more complex (scope toggle, override indicators)
- (–) Must define the always-global allowlist carefully and document it
- (–) Migration: existing global preferences become defaults; no per-session overrides exist initially

**Reference:** See [phases/phase-ex6.md](phases/phase-ex6.md) for the implementation plan.

---

## ADR-023: Domain Service Layer + Command Policy Chokepoint

**Status:** Accepted
**Date:** 2026-05-04

**Context:**
Through M11 the backend grew three "fat" route files that mixed HTTP wiring with business logic, command building, validation, and parsing:

- `routes/serveradmin.ts` — 1,655 lines, 40+ endpoints
- `routes/files.ts` — 630 lines, inline SFTP
- `routes/docker.ts` — 615 lines, inline parsing/validation

There was no domain service layer between routes and infrastructure, so every endpoint duplicated the same shape: parse body → validate → build command → call orchestrator/exec → parse → return JSON. The security validators in `security/validators.ts` (95+ allowlist patterns, 30+ validators) were callable but **not enforced as a chokepoint** — it was up to each route author to remember to call them.

**Options Considered:**

1. **Status quo with linting** — Keep fat routes; add ESLint rules forcing validator calls. Doesn't address duplication and routes-as-business-logic.
2. **Per-route helpers** — Extract helpers per route file. Reduces duplication but keeps logic scoped to HTTP, makes services hard to reuse from agents/cron/CLI.
3. **Domain service layer + central policy** — One `DomainService` per concern (Docker, Network, Firewall, Security, WebServer, Packages, Cron, Logs, Storage). Routes become thin HTTP↔ServiceResult adapters. `CommandPolicy` enforced at `ConnectionManager.exec()` so every command crossing SSH passes a single gate.

**Decision:** Option 3.

### Domain Service Layer

```
server/src/services/
├── domain/
│   ├── base.ts                 # DomainService, ServiceResult<T>, ServiceError
│   ├── docker-service.ts       # M12.2
│   └── admin/                  # M12.4
│       ├── network-admin-service.ts
│       ├── firewall-admin-service.ts
│       ├── security-admin-service.ts
│       ├── webserver-admin-service.ts
│       ├── packages-admin-service.ts
│       ├── cron-admin-service.ts
│       ├── logs-admin-service.ts
│       └── storage-admin-service.ts
└── policy/
    └── command-policy.ts       # M12.1
```

**`DomainService` base** (`server/src/services/domain/base.ts`):
- Extends `BaseService`. In `_init()` auto-wires `this.ssh`, `this.orchestrator`, `this.pipeline` via `this.services.get<T>(name)`.
- Exposes `requireConnected(serverId)` (throws `ServiceError` 400 if not connected), `exec()`, `safeExec()`, `execAction()` helpers.
- Returns `ServiceResult<T> = { ok: true, data?: T } | { ok: false, error: string, statusCode?: number, data?: unknown }`.
- Helper `sendResult()` translates `ServiceResult` → Fastify reply, mapping `statusCode` to HTTP status. Action-style results whose data is exactly `{ message: string }` are flattened to `{ success: true, message }` for response-shape compatibility with the pre-refactor API.

**Routes become thin wrappers** (`routes/docker.ts`, `routes/serveradmin.ts`):
```typescript
fastify.get('/api/docker/:serverId/containers', async (req, reply) =>
  send(reply, dockerService.listContainers(req.params.serverId))
);
```

### Command Policy Chokepoint

`CommandPolicy` (`server/src/services/policy/command-policy.ts`) wraps the existing `ALLOWED_COMMANDS` and `BLOCKED_COMMANDS` patterns from `security/validators.ts`.

- `ConnectionManager.exec()` calls `policy.assertAllowed(command, serverId)` **before** the ssh2 call. This is the single gate every shell command must pass.
- Three modes via `HEADLESS_POLICY_MODE` env:
  - `enforce` (default for prod) — block disallowed commands, throw.
  - `audit` (default for dev/beta) — record decision, log warning, allow command. Use this to discover real-world commands before flipping to enforce.
  - `off` — bypass policy entirely. Tests + emergency only.
- `BLOCKED_COMMANDS` always wins regardless of mode.
- Audit log capped at 500 entries; `getStats()` and `getAuditLog()` exposed for inspection.
- `shell()` and `sftp()` channels do **not** pass through policy — they have their own constraints (interactive PTY limited to single channel, SFTP confined to file primitives) and would not benefit from regex matching against arbitrary user keystrokes / API calls.

### FilesService Deferred

A `FilesService` was scoped but **deferred**. Rationale: file routes already use SFTP (`readdir`, `readFile`, `writeFile`, `rename`, `unlink`) which **bypasses CommandPolicy** by design (ADR-007). Validation already happens via `validatePath()` at every entry. Wrapping SFTP in a domain service would add a layer without adding a policy gate. Revisit if SFTP grows complex orchestration.

**Rationale:**
- Single chokepoint is auditable. Reviewers can verify "every shell command passes policy" by inspecting one file.
- Audit mode lets us tighten the allowlist iteratively against real traffic instead of guessing.
- Domain services are reusable from future agents (M11 ReAct mode, ADR-014), cron jobs, CLI tools — not tied to HTTP.
- `ServiceResult` keeps error semantics inside the domain (statusCode, structured error) without coupling to Fastify.
- Dual defense: validators at parameter level + policy at exec level. A regression in either is caught by the other.

**Consequences:**
- (+) `serveradmin.ts` shrunk from 1,655 → ~520 lines; logic relocated to typed services.
- (+) Every command crossing SSH is auditable from a single chokepoint.
- (+) Domain services unit-testable without HTTP/Fastify boot.
- (+) New endpoints become 3-line wrappers around an existing service method.
- (–) Adding a new command requires updating `ALLOWED_COMMANDS` in addition to writing the service method; audit mode mitigates this for early development.
- (–) `ServiceError` thrown from `requireConnected()` requires `try/catch` at the route boundary (handled in the shared `send()` helper).
- (–) Slight indirection: route → service → orchestrator/exec → policy → ssh2.

**Reference:** See [phases/phase-12.md](phases/phase-12.md) for the implementation plan and detailed task breakdown.

---

## ADR-024: Agents Run Typed Actions, Not Shell Commands

**Status:** Accepted
**Date:** 2026-10-22
**Supersedes:** the free-form command parts of ADR-014 (the read-only regex allowlist for agent `exec_command`, and write commands without a human in the loop). ADR-014's step limit, token budget, live progress and abort stay.

**Context:**
Both agents send model-written command strings to the server. They pass a prefix-regex allowlist (`agent/command-allowlist.ts`) that does not parse the shell: `cat /var/log/$(touch /tmp/x)` matches `^cat\s+\/var\/log\/` and runs the substitution. The UI Agent also has `exec_write_command` and `sftp_write`, which change servers with no human approval. Generated view buttons carry model-written command templates checked against the classic `ALLOWED_COMMANDS`, which includes `docker rm` and `apt remove`. `CommandPolicy` (ADR-023) gates every exec but cannot tell an agent's command from a classic app's, and defaults to `audit`.

We also want agents to work with small local models (Ollama). Those models write malformed JSON, use the wrong argument names, and only use tools that are in their native tool list (an earlier agent project: qwen3.5:9b scored 88% with every tool listed natively, 40% with tools described as text, 23% when it had to search for tools; shorter descriptions did not help).

**Options Considered:**
1. **Harden the regexes** — reject `$(`, backticks, `;`, etc. in agent commands. Still a blocklist over free text; every new escape (`find -exec`, `awk system()`, `tar --to-command`, all found in H2) needs another rule, and model-written commands remain unreadable to an owner approving them.
2. **Run agent commands in a restricted shell / container on the server** — violates ADR-001 (nothing installed on the server) and doesn't stop reads of secrets.
3. **Typed action catalog** — the model picks an action id and parameters; the server validates the parameters with strict Zod schemas, builds argv in code, quotes every element, runs it, caps and parses the output. Change actions pause for the owner's approval.

**Decision:** Option 3.

- **Catalog** (`server/src/agent/actions/`): each action has an id, title, one-line description, risk (`read | change`), strict Zod params, an argv builder (or an SFTP read), an optional parser, a timeout and an output cap. Parameters that the shell could misread are rejected (names must start with an alphanumeric, paths must be normalized absolute paths under allowed roots and outside a secret-file deny list).
- **One runner** (`ActionRunner`) is the only way an agent reaches a server. Both agents use it.
- **Enforced at the chokepoint:** agent runs execute inside an `AsyncLocalStorage` agent scope. Inside it, `CommandPolicy.assertAllowed()` rejects any command that is not the one the runner just built and granted, and `getSftp()` needs an SFTP grant — in every policy mode. The blocklist still applies. Outside agent scope, ADR-023 is unchanged.
- **Actions are native tools**, one per action, chosen per run by keyword relevance and kept stable for the run (prompt caching). OpenAI models get up to 40; Ollama models get a budget of about 10% of the context window.
- **Approvals:** a change action parks the run on a promise (resolver stored before the event is sent) and shows the owner the full command, server, login user and the model's reason. Allow once or Deny; Stop denies everything pending; unanswered approvals expire after 10 minutes. No "always allow".
- **Audit:** every asked/answered/ran event for a change action is appended to `~/.headlessos/audit/actions.jsonl` (0o600). Entries are never rewritten.
- **Generated view buttons** reference actions by id; change actions go through a server-recorded preview (the server runs exactly the command it showed). Legacy free-form buttons only run low-risk classic commands.

**Rationale:**
- The shell never sees model text: it sees argv built by our code from values that passed a schema. Injection becomes a schema bug in one place, testable per action, instead of an open-ended regex race.
- An owner can approve `systemctl restart nginx` in two seconds; they cannot audit a model-written pipeline.
- Native tools with strict schemas, plus server-side repair of malformed arguments, are what small models need (an earlier agent project's repair/alias experience, an earlier agent project).
- The policy check makes "agents only run actions" a property of `ConnectionManager`, not of each tool's author.

**Consequences:**
- (+) No model-written string reaches the shell on the agent path.
- (+) Every server change by an agent or a generated button has a human decision and an audit line.
- (+) Same catalog and loop work with OpenAI and local models.
- (–) Agents can only do what the catalog offers; new questions may need new actions (each is ~15 lines plus a test).
- (–) The read allowlist's CLI-discovery patterns (EX5-A.1) are replaced by four `cli_*` actions; anything they covered beyond `--help`/`--version`/`man`/`which` is gone.
- (–) More tool definitions per call than the old single `exec_command` tool; mitigated by per-run selection and prompt caching.

**Reference:** See [phases/phase-ex9.md](phases/phase-ex9.md) for the design and task breakdown.

---

## ADR-025: One Context Plan per Model Window

**Status:** Accepted
**Date:** 2026-10-22
**Supersedes:** the context parts of EX9.4 (`historyBudget`, `trimHistory`, `MAX_OLLAMA_CONTEXT = 16384`) and the unused EX2.13 context manager.

**Context:**
Agent runs on a local model failed because the window filled up. The Ollama window was capped at 16,384 for a model trained for 262,144. The UI Agent executor never trimmed its history. A reply cut off at the output limit got a "please use tools" nudge, which made things worse. Token counts were `chars / 4`, never checked against what the provider reported. Each budget (offered actions, result caps, history) was sized on its own.

**Options Considered:**
1. **Raise the cap and keep EX9.4 trimming** — fixes this one model, leaves the executor, the planner and the reviewer unmanaged, and keeps four separate budget formulas.
2. **The earlier agent projects' precedence chain** — owner setting, else Modelfile `num_ctx`, else trained length capped at 32K, else a table. Proven, but an owner setting can exceed what the model was trained for.
3. **Minimum of all known limits, one plan derived from it** — window = min(owner setting or 64K auto cap, Modelfile `num_ctx`, trained length) for Ollama, a model table capped at 128K for hosted models; every budget, the prompt tier and the compaction thresholds come from one pure `planContext(window, maxOutput)`; one context manager per run in both agents.

**Decision:** Option 3, with an earlier agent project's plan formulas and compaction layers.

- Window: minimum of the limits we know (Ollama), table ∧ 128K (hosted). Free VRAM is not an input (Ollama does not report it); the KV-cache cost is estimated from `model_info` and shown, and `/api/ps` shows whether the model spilled to the CPU.
- Wire: `num_ctx = window`, `num_predict = min(max(window/8, 2048), 16384)`, `think: false` on every Ollama request.
- Plan: reserve, trigger, hard, keep-recent, stop point, mask size, result cap, action budget and prompt tier, all from the window and the output cap (constants from an earlier agent project's `compactionPlan.ts`).
- Compaction before every call, cheapest first: collapse superseded views, mask long old results, stub old action results, summarize (optional, with a 3-failure breaker), then drop. The system prompt, the request and the latest four tool calls always stay.
- Token estimates are corrected from the provider's real prompt-token count.
- Cut-off replies and overflow errors are handled explicitly (reminder + compaction, at most 3; forced compaction + retry, at most 2).

**Rationale:**
- One number drives every budget, so they cannot disagree (EX9 had separate formulas for actions, result caps and history).
- The minimum is the conservative reading of "what the model can do here": it never asks Ollama for more than the model was trained for, and the 64K auto cap keeps the KV cache to ~2 GiB on the model that failed.
- An earlier agent project's formulas are proven on the same class of local models, and its golden tests carry over.
- HeadlessOS-specific waste (resending and echoing whole views) is removed at the source and collapsed by the first compaction layer.

**Consequences:**
- (+) Local models get 4× the window they had, and runs that still fill it compact instead of failing.
- (+) The UI Agent executor, planner and reviewer are managed like the investigation agent.
- (+) Context use is visible per call in the Observatory.
- (–) Summarization is one more LLM call when it runs; it is skipped when cheaper layers suffice and stops after 3 failures.
- (–) A Modelfile `num_ctx` lower than the owner's setting wins; the owner changes the Modelfile to go higher.
- (–) The KV estimate is arithmetic, not a measurement; `/api/ps` is the check.

**Reference:** See [phases/phase-ex10.md](phases/phase-ex10.md) for the design and task breakdown.

---

## Template for New ADRs

```markdown
## ADR-NNN: [Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Date:** YYYY-MM-DD

**Context:**
[What is the issue? Why do we need to make this decision?]

**Options Considered:**
1. **Option A** — [description]
2. **Option B** — [description]
3. **Option C** — [description]

**Decision:** [Which option was chosen]

**Rationale:**
[Why this option over others]

**Consequences:**
- (+) [positive consequence]
- (-) [negative consequence / trade-off]
```
