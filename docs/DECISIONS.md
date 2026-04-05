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

**Status:** Accepted
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
