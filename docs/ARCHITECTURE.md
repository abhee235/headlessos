# Architecture

> System design, component diagram, and data flow for HeadlessOS.

> **EX6 (Multi-Session Workspace)**: HeadlessOS now supports multiple concurrent server sessions in a single browser. The frontend has three top-level screens: **LockScreen** (workspace unlock), **ControlCenter** (Sessions / Fleet / Global Settings tabs — replaces the old LoginScreen, opened via `Ctrl/Cmd+Shift+Space`), and **DesktopLayout** (per-session desktop with hover `SessionSwitcher`). Session state lives in three tiers: hot (Zustand) → warm (localStorage, 500ms debounce) → cold (`PUT /api/sessions/:id`, 2s debounce, `~/.headlessos/sessions/{serverId}.json`). Lifecycle hooks (`onActivate / onBeforeHibernate / onHibernate / onTerminate`) coordinate window persistence. Fleet Overview was removed from the in-desktop app registry and is now reachable only via the ControlCenter Fleet tab. See [phases/phase-ex6.md](phases/phase-ex6.md).

## System Overview

HeadlessOS is a **client-only** application. Nothing is installed on the target server. The entire system runs on the user's local machine and communicates with remote servers exclusively via SSH.

```
┌─────────────────────────────── LOCAL MACHINE ───────────────────────────────┐
│                                                                             │
│  ┌─────────────────────────── Browser (localhost:3000) ──────────────────┐  │
│  │                                                                       │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐            │  │
│  │  │ Dashboard │ │   File    │ │  Docker   │ │  Process  │   ...apps  │  │
│  │  │  (cards)  │ │ Explorer  │ │  Manager  │ │  Manager  │            │  │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘            │  │
│  │        │              │              │              │                  │  │
│  │  ┌─────▼──────────────▼──────────────▼──────────────▼──────────────┐  │  │
│  │  │                    React UI Shell                                │  │  │
│  │  │  (Sidebar + Tabs + Terminal Panel + Reusable Renderers)        │  │  │
│  │  └──────────────────────────┬─────────────────────────────────────┘  │  │
│  │                             │                                        │  │
│  │  ┌──────────────────────────▼─────────────────────────────────────┐  │  │
│  │  │              xterm.js (Interactive Terminal)                     │  │  │
│  │  │              Connected via WebSocket to backend                 │  │  │
│  │  └──────────────────────────┬─────────────────────────────────────┘  │  │
│  └─────────────────────────────┼────────────────────────────────────────┘  │
│                                │                                           │
│                     HTTP REST + WebSocket                                  │
│                                │                                           │
│  ┌─────────────────────────────▼────────────────────────────────────────┐  │
│  │                    Fastify Backend (localhost:3001)                   │  │
│  │                                                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │  │
│  │  │   Routes     │  │    SSH       │  │   Parsing Pipeline       │   │  │
│  │  │              │  │  Connection  │  │                          │   │  │
│  │  │ /api/system  │  │   Manager   │  │  raw output              │   │  │
│  │  │ /api/files   │──▶│            │──▶│    │                     │   │  │
│  │  │ /api/docker  │  │ .exec()    │  │    ▼                     │   │  │
│  │  │ /api/process │  │ .shell()   │  │  ANSI strip              │   │  │
│  │  │ /ws/terminal │  │ .sftp()    │  │    │                     │   │  │
│  │  └──────────────┘  └──────┬───────┘  │    ▼                     │   │  │
│  │                           │          │  deterministic parser?   │   │  │
│  │                           │          │    ├─ yes → regex parse  │   │  │
│  │                           │          │    └─ no  → LLM parse   │   │  │
│  │                           │          │              │           │   │  │
│  │                           │          │              ▼           │   │  │
│  │                           │          │         Zod validate    │   │  │
│  │                           │          │              │           │   │  │
│  │                           │          │              ▼           │   │  │
│  │                           │          │         Typed JSON      │   │  │
│  │                           │          └──────────────────────────┘   │  │
│  │                           │                                         │  │
│  │  ┌────────────────────────▼──────────────────────────────────────┐  │  │
│  │  │                   LLM Provider Layer                          │  │  │
│  │  │                                                                │  │  │
│  │  │  ┌──────────┐  ┌──────────────┐  ┌─────────┐  ┌───────────┐ │  │  │
│  │  │  │ OpenAI   │  │  Anthropic   │  │ Ollama  │  │  Custom   │ │  │  │
│  │  │  │ (GPT-5)  │  │  (Claude)    │  │ (local) │  │ Provider  │ │  │  │
│  │  │  └──────────┘  └──────────────┘  └─────────┘  └───────────┘ │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────┬────────────────────────────────────────┘  │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │ SSH (port 22)
                                  │ (password or key-based auth)
                                  │
                    ┌─────────────▼─────────────┐
                    │                           │
                    │     Remote VPS Server     │
                    │     (no modifications)    │
                    │                           │
                    │  ┌─────────────────────┐  │
                    │  │  Standard SSH       │  │
                    │  │  daemon (sshd)      │  │
                    │  └─────────────────────┘  │
                    │                           │
                    │  Docker, systemd, fs,     │
                    │  processes — whatever is  │
                    │  already installed        │
                    │                           │
                    └───────────────────────────┘
```

## Core Components

### 1. SSH Connection Manager

**Location:** `server/src/ssh/connection-manager.ts`

**Responsibility:** Manage SSH connections to remote servers. One connection per server, multiple channels per connection.

```
                    SSH Connection (1 per server)
                    ┌─────────────────────────────────┐
                    │                                  │
                    │  Channel 1: Interactive Shell    │──▶ xterm.js (user terminal)
                    │  (PTY allocated, streams both    │
                    │   ways, stays open)              │
                    │                                  │
                    │  Channel 2: exec("df -h")        │──▶ Parse pipeline → UI
                    │  (one-shot, closes after output) │
                    │                                  │
                    │  Channel 3: exec("docker ps")    │──▶ Parse pipeline → UI
                    │  (one-shot, closes after output) │
                    │                                  │
                    │  Channel 4: SFTP subsystem       │──▶ File operations
                    │  (persistent, file read/write)   │
                    │                                  │
                    │  ...more exec channels as needed │
                    │                                  │
                    └─────────────────────────────────┘
```

**Key design:**
- Uses `ssh2` library directly (not wrappers) for full channel control
- `exec()` channels are created on-demand and destroyed after command completes
- `shell()` channel persists for the lifetime of the connection (user's terminal)
- SFTP channel is lazy-initialized on first file operation
- Reconnection logic with exponential backoff
- Connection state emitted via events: `connecting`, `connected`, `disconnected`, `error`

**Data model:**
```typescript
interface ServerConfig {
  id: string;                    // UUID
  name: string;                  // Display name ("My VPS")
  host: string;                  // IP or hostname
  port: number;                  // default 22
  username: string;
  authMethod: 'password' | 'privateKey' | 'agent';
  password?: string;             // encrypted at rest
  privateKeyPath?: string;       // path to key file
  passphrase?: string;           // for encrypted keys
}

interface ConnectionState {
  serverId: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: string;
  connectedAt?: Date;
  detectedTools?: string[];      // ['docker', 'git', 'python3', ...]
}
```

### 2. Parsing Pipeline

**Location:** `server/src/parsers/`

**Responsibility:** Convert raw terminal output into typed, structured JSON.

```
  Raw Terminal Output (string with ANSI codes)
         │
         ▼
  ┌──────────────┐
  │  ANSI Strip  │  Remove color codes, cursor movement, etc.
  └──────┬───────┘
         │ Clean text
         ▼
  ┌──────────────────┐
  │  Router          │  Decide which parser to use based on command
  │                  │
  │  Known command?  │
  │  ├─ "df -h"     │──▶ DeterministicParser (regex)
  │  ├─ "docker ps" │──▶ DeterministicParser (JSON flag available)
  │  ├─ "ls -la"    │──▶ DeterministicParser (regex)
  │  └─ unknown     │──▶ LLMParser
  └──────────────────┘
         │ Parsed result (unvalidated)
         ▼
  ┌──────────────┐
  │  Zod Schema  │  Validate parsed data matches expected shape
  │  Validation  │  Catch LLM hallucinations / parser bugs
  └──────┬───────┘
         │ Typed JSON (validated)
         ▼
  Return to route handler → send to client
```

**Two parser types:**

| Type | When Used | Speed | Cost | Reliability |
|------|-----------|-------|------|-------------|
| Deterministic | Command has known, stable output format | <1ms | Free | Very high |
| LLM | Unknown command, complex output, first-time parse | 1-3s | API cost | High (with validation) |

**Progressive migration:** Start with LLM for everything → measure which commands are most frequent → write deterministic parsers for those → LLM becomes fallback only.

### 3. LLM Provider Layer

**Location:** `server/src/llm/`

**Responsibility:** Abstract LLM API calls behind a common interface. Support text parsing and vision parsing.

```typescript
// The core interface every provider must implement
interface LLMProvider {
  name: string;

  // Text-based: send raw terminal text + schema, get structured JSON
  parseText<T>(input: {
    rawOutput: string;
    command: string;
    schema: ZodSchema<T>;
    systemPrompt?: string;
  }): Promise<T>;

  // Vision-based: send terminal screenshot + schema, get structured JSON
  parseImage<T>(input: {
    image: Buffer;           // PNG screenshot
    command: string;
    schema: ZodSchema<T>;
    systemPrompt?: string;
  }): Promise<T>;
}
```

**Provider implementations:**

| Provider | File | Status | Notes |
|----------|------|--------|-------|
| OpenAI | `providers/openai.ts` | Primary | Structured Outputs with `zodResponseFormat()` |
| Anthropic | `providers/anthropic.ts` | Stub | Via tool_use for structured output |
| Ollama | `providers/ollama.ts` | Stub | Local models, zero cost, fast TTFT |

**Vision pipeline** (for ncurses/visual tools like htop):
```
SSH output (raw bytes with escape sequences)
    │
    ▼
xterm-headless (Node.js, no DOM)
    │ renders terminal state in memory
    ▼
@xterm/addon-serialize → HTML string
    │
    ▼
Playwright/Puppeteer → PNG screenshot
    │
    ▼
LLMProvider.parseImage() → structured JSON
```

### 4. Command Orchestrator

**Location:** `server/src/orchestrator/`

**Responsibility:** Coordinate multi-command execution, handle parse failures intelligently, and provide a future extension point for agentic workflows. Sits **between** route handlers and the raw SSH + parsing pipeline.

> **Why this exists:** The parsing pipeline (§2) is single-shot: one command → one parse → one result.
> But real UI views need multiple commands, retry on failure, and fallback strategies.
> The orchestrator handles all of this so route handlers stay simple.
> See [ADR-013](DECISIONS.md) for the full decision.

```
  Route handler                          Command Orchestrator
  ┌──────────────┐    "get dashboard"    ┌──────────────────────────────────────┐
  │ GET /api/    │ ─────────────────────▶│                                      │
  │  system/     │                       │  1. Build execution plan:            │
  │  dashboard   │                       │     - hostname        ─┐             │
  │              │                       │     - uptime           │ parallel    │
  │              │                       │     - df -h            │ exec()      │
  │              │                       │     - free -m          │             │
  │              │                       │     - uname -a        ─┘             │
  │              │                       │     - ip -brief addr  ─┐ sequential │
  │              │                       │                        │ (needs net) │
  │              │                       │  2. Execute via SSH ConnectionManager│
  │              │                       │  3. Parse each through Pipeline      │
  │              │                       │  4. If parse fails → retry strategy  │
  │              │                       │  5. Aggregate results                │
  │              │  { dashboard: ... }   │  6. Return typed composite           │
  │              │ ◀─────────────────────│                                      │
  └──────────────┘                       └──────────────────────────────────────┘
```

**Two modes:**

#### Mode 1: Execution Plan (Phase 1 — build now)

Handles the 90% case: defined commands, known schemas, retry on failure.

```typescript
// server/src/orchestrator/orchestrator.ts
interface CommandStep {
  id: string;                    // e.g., "disk_usage"
  command: string;               // e.g., "df -h"
  schema: ZodSchema;             // expected output shape
  fallbackCommands?: string[];   // e.g., ["df"] if "df -h" fails
  optional?: boolean;            // if true, failure doesn't fail the whole plan
  dependsOn?: string[];          // run after these steps complete
  timeout?: number;              // per-command timeout (default 30s)
}

interface ExecutionPlan {
  steps: CommandStep[];
  parallel?: boolean;            // run independent steps in parallel (default true)
}

interface ExecutionResult<T> {
  data: T;
  meta: {
    totalLatencyMs: number;
    steps: {
      id: string;
      parsedBy: 'deterministic' | 'llm' | 'cache';
      latencyMs: number;
      retries: number;
      fallbackUsed?: string;     // which fallback command was used, if any
    }[];
    errors: {                    // non-fatal errors (from optional steps)
      stepId: string;
      error: string;
    }[];
  };
}

class CommandOrchestrator extends BaseService {
  /**
   * Execute a plan: run commands, parse outputs, retry on failure,
   * aggregate results into a single typed object.
   */
  async execute<T>(
    serverId: string,
    plan: ExecutionPlan,
    aggregator: (results: Map<string, unknown>) => T
  ): Promise<ExecutionResult<T>>;
}
```

**Retry strategy (built into the orchestrator):**

```
Parse attempt failed (Zod validation error)
    │
    ▼
Retry 1: Re-send to LLM with error context
    │       "Previous parse returned { ... } but Zod reported:
    │        'cpuPercent' expected number, received string.
    │        Please fix and return valid JSON."
    │
    ├─ success → ✅ return data
    │
    ▼
Retry 2: Try fallback command (if defined)
    │       e.g., "df" instead of "df -h", or "podman ps" instead of "docker ps"
    │
    ├─ success → ✅ return data
    │
    ▼
Give up: return error for this step
    │       If step was optional → continue with other steps
    │       If step was required → fail the whole plan
```

**Example: Dashboard execution plan:**
```typescript
const dashboardPlan: ExecutionPlan = {
  steps: [
    { id: 'hostname', command: 'hostname', schema: z.string() },
    { id: 'uptime', command: 'uptime -p', schema: z.string(), fallbackCommands: ['uptime'] },
    { id: 'disk', command: 'df -h', schema: DiskUsageArraySchema },
    { id: 'memory', command: 'free -m', schema: MemoryInfoSchema },
    { id: 'kernel', command: 'uname -a', schema: z.string() },
    { id: 'network', command: 'ip -brief addr', schema: NetworkArraySchema,
      fallbackCommands: ['ifconfig'], optional: true },
  ],
  parallel: true,  // all steps run simultaneously (no dependsOn)
};

// Route handler becomes simple:
fastify.get('/api/servers/:id/system/dashboard', async (req) => {
  const orchestrator = this.services.get<CommandOrchestrator>('orchestrator');
  return orchestrator.execute(serverId, dashboardPlan, aggregateDashboard);
});
```

#### Mode 2: ReAct Agent (Backlog — build later)

For **open-ended investigation** queries like "Why is my server slow?" or "What's using all the disk space?". Uses LLM tool-calling to let the model decide what commands to run next.

```
User: "Why is disk full?"
    │
    ▼
Agent receives tools: [exec_command, read_file, list_directory]
    │
    ▼
Agent thinks: "Let me check disk usage"
Agent calls: exec_command("df -h")
    │ result: /dev/sda1 95% used on /
    │
Agent thinks: "Root is almost full, let me find biggest directories"
Agent calls: exec_command("du -sh /* 2>/dev/null | sort -rh | head -10")
    │ result: 45G /var, 12G /home, ...
    │
Agent thinks: "/var is the culprit"
Agent calls: exec_command("du -sh /var/* | sort -rh | head -10")
    │ result: 40G /var/log, ...
    │
Agent concludes: "/var/log is 40GB — likely log rotation issue"
    │
    ▼
Return structured answer to frontend
```

```typescript
// server/src/orchestrator/agent.ts  (BACKLOG — not built in Phase 1)
interface AgentTool {
  name: string;
  description: string;
  parameters: ZodSchema;
  execute: (params: unknown) => Promise<string>;
}

class InvestigationAgent extends BaseService {
  private tools: AgentTool[] = [
    {
      name: 'exec_command',
      description: 'Execute a shell command on the server and return output',
      parameters: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        // Validate command against allowlist (SECURITY!)
        // Run through SSH exec
        // Return raw output (agent sees text, decides next step)
      },
    },
    {
      name: 'read_file',
      description: 'Read a file from the server (first 100 lines)',
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        // Validate path (no traversal!)
        // Read via SFTP
      },
    },
  ];

  /** Run an agentic investigation — LLM chooses commands iteratively */
  async investigate(
    serverId: string,
    question: string,
    maxSteps?: number         // safety limit, default 10
  ): Promise<{
    answer: string;
    commandsRun: { command: string; output: string }[];
    totalTokens: number;
  }>;
}
```

**Why Mode 2 is backlog, not Phase 1:**
- Mode 1 (execution plans) covers 90% of use cases
- Mode 2 requires robust security (command allowlists, rate limits per agent run)
- Mode 2 is expensive (multiple LLM calls per investigation)
- Mode 2 needs good UX (show user what agent is doing in real-time)

**Where the agent logic lives:** **Backend only.** The frontend never runs agent loops. It calls `POST /api/servers/:id/investigate` and streams the agent's progress via WebSocket.

### 5. App System

**Location:** Each app spans backend routes + frontend components.

An "app" in HeadlessOS is a **module** that:
1. Defines what **commands** to run on the server (as an `ExecutionPlan`)
2. Defines the **Zod schema** for the expected output
3. Provides a **React component** to render the parsed data
4. Defines **actions** (buttons that trigger commands)

```
┌────────────────────────────────────────────┐
│                   App                       │
│                                            │
│  ┌──────────┐    ┌──────────┐             │
│  │ Backend  │    │ Frontend │             │
│  │          │    │          │             │
│  │ Route    │    │ Component│             │
│  │ Commands │    │ Renderers│             │
│  │ Schema   │    │ Actions  │             │
│  │ Parser   │    │ Polling  │             │
│  └──────────┘    └──────────┘             │
│                                            │
│  Metadata:                                 │
│  - name, icon, description                │
│  - requiredTools: ["docker"]  ← only show │
│    app if tool exists on server            │
│  - refreshInterval: 10000     ← auto-poll │
└────────────────────────────────────────────┘
```

**Initial apps (Phase 1):**

| App | Commands | Parser Type | Priority |
|-----|----------|-------------|----------|
| System Dashboard | `hostname`, `uptime`, `df -h`, `free -m`, `uname -a`, `ip -brief addr` | LLM → Deterministic | P0 |
| File Explorer | `ls -la`, SFTP read/write | LLM → Deterministic | P0 |
| Terminal | Interactive SSH shell | N/A (raw passthrough) | P0 |
| Docker | `docker ps`, `docker images`, `docker logs` | Deterministic (JSON flag) | P1 |
| Processes | `ps aux --sort=-%mem` | LLM → Deterministic | P1 |
| Services | `systemctl list-units` | LLM → Deterministic | P2 |
| Server Admin | `ss`, `ufw`, `nginx -T`, `apt list`, `journalctl`, `who`, `crontab -l`, `findmnt` | Deterministic | P1 |

See [APP_REGISTRY.md](APP_REGISTRY.md) for the full app definition schema.

### 5b. Dynamic UI Engine (EX1)

**Location:** Backend: `server/src/dynamic-ui/`, Frontend: `client/src/components/DynamicUI/`, Schema: `shared/schemas/dynamic-view.ts`

The Dynamic UI Engine is HeadlessOS's **core differentiator**: it generates visual interfaces from **any** terminal output without writing custom React components. An LLM analyzes command output and produces a `DynamicViewSchema` JSON describing widgets and layouts. A generic renderer turns that JSON into live UI.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      DYNAMIC UI ENGINE PIPELINE                         │
│                                                                         │
│  Trigger (Command Palette / Agent / Terminal "Visualize" button)        │
│      │                                                                  │
│      ▼                                                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  DynamicUIGenerator (Backend Service)                              │  │
│  │                                                                     │  │
│  │  1. Search Template Library (15+ JSON templates)                   │  │
│  │  2. LLM Call (streaming) with zodResponseFormat(DynamicViewSchema) │  │
│  │  3. Stream partial JSON chunks via WebSocket                       │  │
│  │  4. Validate complete result with Zod                              │  │
│  │  5. Cache by (tool + command + outputHash)                         │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │ WebSocket (incremental JSON)             │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  DynamicViewRenderer (React)                                       │  │
│  │                                                                     │  │
│  │  Widget components (all use shadcn/ui primitives):                 │  │
│  │  ┌───────┐ ┌────────┐ ┌───────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ Table │ │  Chart │ │ Badge │ │ StatCard │ │ProgressBar   │  │  │
│  │  └───────┘ └────────┘ │ Grid  │ └──────────┘ │CodeBlock/Log │  │  │
│  │                       └───────┘               └───────────────┘  │  │
│  │                                                                     │  │
│  │  Layout components:                                                │  │
│  │  ┌───────┐ ┌──────┐ ┌──────┐ ┌─────────┐                        │  │
│  │  │ Stack │ │ Grid │ │ Tabs │ │ Sidebar │                        │  │
│  │  └───────┘ └──────┘ └──────┘ └─────────┘                        │  │
│  │                                                                     │  │
│  │  Renders widgets PROGRESSIVELY as JSON arrives (streaming).        │  │
│  │  Skeleton placeholders for pending widgets.                        │  │
│  │  Entrance animations (fade-in) for each new widget.               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  Displayed in: AppWindow overlay  OR  Desktop tab                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key design decisions (ADR-015):**
- **Streaming/incremental rendering** — LLM generates JSON incrementally, UI builds progressively (no loading spinner)
- **Hybrid template + LLM** — template library for consistency, LLM customizes or generates from scratch
- **Zod as single source of truth** — `DynamicViewSchema` used for both Zod validation and `zodResponseFormat()` LLM structured output
- **Existing infrastructure reuse** — WebSocket streaming (like M11.6 agent), shadcn/ui widgets, LLM provider, Zod pipeline

See [ADR-015](DECISIONS.md) for full rationale and [phase-ex1.md](phases/phase-ex1.md) for implementation spec.

### 5. Frontend Architecture

**Location:** `client/src/`

```
┌──────────────────────────────────────────────────────────┐
│                     App Shell                             │
│                                                          │
│  ┌─────────────┐  ┌──────────────────────────────────┐  │
│  │             │  │          Tab Container            │  │
│  │  Sidebar    │  │                                   │  │
│  │             │  │  ┌─────┐ ┌─────┐ ┌─────┐        │  │
│  │  Servers:   │  │  │ Tab │ │ Tab │ │ Tab │  ...    │  │
│  │  ├ My VPS   │  │  └──┬──┘ └──┬──┘ └──┬──┘        │  │
│  │  └ Dev Box  │  │     │       │       │            │  │
│  │             │  │  ┌──▼───────▼───────▼─────────┐  │  │
│  │  Apps:      │  │  │       Active Tab Content    │  │  │
│  │  ├ System   │  │  │                             │  │  │
│  │  ├ Files    │  │  │  Rendered by app component  │  │  │
│  │  ├ Docker   │  │  │  (Dashboard / FileExplorer  │  │  │
│  │  ├ Process  │  │  │   / Docker / Terminal)      │  │  │
│  │  └ Terminal │  │  │                             │  │  │
│  │             │  │  └─────────────────────────────┘  │  │
│  └─────────────┘  └──────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Terminal Panel (collapsible)           │  │
│  │              xterm.js ↔ WebSocket ↔ SSH shell     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Component hierarchy:**
```
App.tsx
├── Shell/
│   ├── Sidebar.tsx          # Server list + app navigation
│   ├── TabContainer.tsx     # Tab bar + active tab content
│   └── TerminalPanel.tsx    # Collapsible bottom terminal
├── Dashboard/
│   ├── DashboardView.tsx    # System overview (cards)
│   ├── DiskCard.tsx
│   ├── MemoryCard.tsx
│   ├── NetworkCard.tsx
│   └── UptimeCard.tsx
├── FileExplorer/
│   ├── FileExplorerView.tsx
│   ├── FileTree.tsx         # Left panel tree
│   ├── FileList.tsx         # Right panel detail view
│   └── FileActions.tsx      # Toolbar (create, delete, upload)
├── Docker/
│   ├── DockerView.tsx
│   ├── ContainerList.tsx
│   ├── ImageList.tsx
│   └── LogViewer.tsx
├── ServerAdmin/
│   ├── ServerAdminView.tsx  # Main shell with sidebar nav (8 sections)
│   ├── NetworkSection.tsx   # Ports, routes, DNS, connections
│   ├── FirewallSection.tsx  # UFW rules, add/delete, toggle
│   ├── SecuritySection.tsx  # Users, sessions, logins, SSH config
│   ├── WebServerSection.tsx # Nginx sites, config test, SSL certs
│   ├── PackagesSection.tsx  # Installed/upgradable packages
│   ├── CronSection.tsx      # Cron jobs viewer
│   ├── LogsSection.tsx      # Journal/dmesg/syslog viewer
│   └── StorageSection.tsx   # Dir sizes, mounts, swap
├── Processes/
│   ├── ProcessView.tsx
│   └── ProcessTable.tsx
├── Terminal/
│   └── TerminalView.tsx     # Full-tab terminal (xterm.js)
└── ui/                      # Reusable primitives
    ├── Table.tsx
    ├── Card.tsx
    ├── TreeView.tsx
    ├── Form.tsx
    ├── StatusBadge.tsx
    ├── ConfirmDialog.tsx
    └── LoadingSpinner.tsx
```

### 6. Communication Protocol

**Frontend ↔ Backend:**

| Endpoint Type | Protocol | Use Case |
|---------------|----------|----------|
| App data (read) | HTTP GET | Fetch server state, file listings, docker containers |
| App actions (write) | HTTP POST | Stop container, delete file, kill process |
| Server admin read | HTTP GET | Network info, firewall rules, security, packages, logs, storage |
| Server admin write | HTTP POST/DELETE | Add/delete firewall rules, toggle firewall |
| Terminal | WebSocket | Bidirectional stream for interactive SSH shell |
| Real-time data | WebSocket | Docker logs streaming, live process updates |

**Backend ↔ Server:**

| Channel Type | SSH Channel | Lifecycle |
|-------------|-------------|-----------|
| Interactive shell | `conn.shell()` | Persistent — one per connection |
| Data collection | `conn.exec(cmd)` | Ephemeral — created per command, destroyed on completion |
| File operations | `conn.sftp()` | Lazy persistent — created on first file op, reused |

### 7. Data Flow Examples

**Example: User opens File Explorer and navigates to `/var/log/`**

```
1. User clicks "/var/log/" in FileTree
2. Frontend: GET /api/servers/:id/files?path=/var/log/
3. Backend route handler:
   a. connectionManager.exec(serverId, 'ls -la /var/log/')
   b. SSH exec channel opens, command runs, output returned
   c. Raw output: "total 2048\ndrwxr-xr-x 2 root root 4096 ..."
   d. Pipeline.parse('ls -la /var/log/', rawOutput, FileListSchema)
      - Router: "ls" → DeterministicParser exists? (Phase 1: No → LLM)
      - LLM receives: text + FileListSchema (Zod → JSON Schema)
      - LLM returns: { files: [{ name: "syslog", size: "1.2M", ... }] }
      - Zod validates response against FileListSchema
   e. Return typed JSON to frontend
4. Frontend: FileList component renders table of files
```

**Example: User clicks "Stop" on a Docker container**

```
1. User clicks "Stop" button on container row
2. Frontend: POST /api/servers/:id/docker/containers/:containerId/stop
3. Backend:
   a. Validate containerId matches pattern [a-f0-9]{12,64}
   b. connectionManager.exec(serverId, `docker stop ${containerId}`)
   c. Check exit code (0 = success)
   d. Return { success: true }
4. Frontend: Refresh container list (triggers GET)
```

## Configuration Storage

All configuration is stored locally on the user's machine:

```
~/.headlessos/
├── config.json              # App settings, LLM provider config, API keys
├── servers.json             # Server connection configs
├── cache/                   # Cached parsed outputs (with TTL)
│   └── <serverId>/
│       ├── system.json
│       ├── files-<pathHash>.json
│       └── ...
└── logs/                    # App logs
    └── headlessos.log
```

**Config schema:**
```typescript
interface AppConfig {
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama';
    model: string;               // e.g., "gpt-5-nano"
    apiKey?: string;             // for cloud providers
    ollamaUrl?: string;          // for local, default "http://localhost:11434"
    visionModel?: string;        // for image parsing, e.g., "gpt-5-mini"
  };
  ui: {
    theme: 'dark' | 'light';
    terminalFontSize: number;
    defaultShell: string;        // e.g., "/bin/bash"
  };
  polling: {
    systemInterval: number;      // ms, default 30000
    dockerInterval: number;      // ms, default 10000
    processInterval: number;     // ms, default 15000
  };
}
```

## Concurrency Model

```
Fastify backend (single Node.js process)
    │
    ├─ HTTP request handlers (async, non-blocking)
    │
    ├─ WebSocket connections (one per terminal tab)
    │
    ├─ SSH connections (one per server, managed by ConnectionManager)
    │   ├─ Multiple exec() channels can run in parallel
    │   └─ One shell() channel per connection
    │
    └─ LLM API calls (async, can be parallelized per request)
        └─ OpenAI/Anthropic calls are I/O-bound, Node.js handles well
```

No worker threads needed. Everything is I/O-bound (SSH, HTTP to LLM API, WebSocket). Node.js event loop handles this naturally.

## Design Patterns (Reference from Puter Analysis)

> These patterns were extracted from analyzing the [Puter](https://github.com/HeyPuter/puter) project (v2.5.1, "Internet OS").
> Puter solves a **different problem** (cloud desktop environment, installed on server) but has mature architecture patterns we should adopt.
> See [ADR-011](DECISIONS.md#adr-011-service-container-pattern) and [ADR-012](DECISIONS.md#adr-012-plugin-ready-app-registry) for the formal decisions.

### Pattern 1: Service Container (adopt in Phase 0-1)

All backend modules (SSH manager, LLM provider, parsing pipeline, config store) should be **services** registered in a container. Services discover each other via the container, not direct imports.

**Why:** Makes testing trivial (mock the container), enables clean startup/shutdown sequencing, and decouples modules.

**Reference design (adapted from Puter's BaseService):**
```typescript
// server/src/services/base-service.ts
export abstract class BaseService {
  protected services!: ServiceContainer;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** Called once — set up data structures, config. No other services available yet. */
  async construct(services: ServiceContainer): Promise<void> {
    this.services = services;
    await this._construct();
  }

  /** Called after ALL services are constructed — can access other services. */
  async init(): Promise<void> {
    await this._init();
  }

  /** Called when shutting down — clean up connections, intervals. */
  async destroy(): Promise<void> {
    await this._destroy();
  }

  // Subclasses override these:
  protected async _construct(): Promise<void> {}
  protected async _init(): Promise<void> {}
  protected async _destroy(): Promise<void> {}
}

// server/src/services/container.ts
export class ServiceContainer {
  private instances = new Map<string, BaseService>();

  register(name: string, service: BaseService): void {
    this.instances.set(name, service);
  }

  get<T extends BaseService>(name: string): T {
    const service = this.instances.get(name);
    if (!service) throw new Error(`Service "${name}" not registered`);
    return service as T;
  }

  /** Boot sequence: construct all → init all (two-phase) */
  async boot(): Promise<void> {
    // Phase 1: construct (no cross-service deps)
    for (const svc of this.instances.values()) {
      await svc.construct(this);
    }
    // Phase 2: init (cross-service deps available)
    for (const svc of this.instances.values()) {
      await svc.init();
    }
  }

  async shutdown(): Promise<void> {
    // Reverse order
    const services = [...this.instances.values()].reverse();
    for (const svc of services) {
      await svc.destroy();
    }
  }
}
```

**Usage in our codebase:**
```typescript
// server/src/index.ts — during boot
const container = new ServiceContainer();
container.register('config', new ConfigService());
container.register('ssh', new SSHConnectionManager());
container.register('llm', new LLMProviderService());
container.register('parser', new ParsingPipelineService());
await container.boot();

// Inside any service:
const ssh = this.services.get<SSHConnectionManager>('ssh');
const result = await ssh.exec(serverId, 'df -h');
```

### Pattern 2: Extension/Plugin Registry (adopt in Phase 2+)

When building the App Registry, design it so future community "apps" (e.g., nginx-manager, postgres-dashboard) can be loaded as plugins.

**Reference design (adapted from Puter's Extension.register):**
```typescript
// server/src/apps/registry.ts
export class AppRegistry {
  private apps = new Map<string, AppManifest>();
  private parsers: { named: Record<string, DeterministicParser>; anonymous: DeterministicParser[] } = {
    named: {},
    anonymous: [],
  };

  /** Register an app with its manifest, routes, and parsers */
  register(manifest: AppManifest): void {
    this.apps.set(manifest.id, manifest);

    // Register any custom parsers the app provides
    for (const [command, parser] of Object.entries(manifest.parsers ?? {})) {
      this.parsers.named[command] = parser;
    }
  }

  /** Get all registered apps (optionally filter by detected server tools) */
  getAvailable(detectedTools: string[]): AppManifest[] {
    return [...this.apps.values()].filter(app =>
      app.requiredTools.every(tool => detectedTools.includes(tool))
    );
  }
}
```

### Pattern 3: Process Tree Visualization (adopt in Phase 3)

For the Process Manager app, use a recursive tree with indent tracking.

**Reference algorithm (adapted from Puter's UIWindowTaskManager):**
```typescript
// client/src/components/Processes/ProcessTree.tsx
interface TreeNode {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  children: TreeNode[];
}

function calculateIndent(
  depth: number,
  isLastStack: boolean[],  // tracks if ancestor was last child
  isLast: boolean
): string {
  let result = '';
  for (let i = 0; i < depth; i++) {
    const lastCell = i === depth - 1;
    const hasTrunk = (lastCell && !isLast) || (!lastCell && !isLastStack[i + 1]);
    const hasBranch = lastCell;

    if (hasTrunk && hasBranch) result += '├── ';
    else if (hasTrunk)         result += '│   ';
    else if (hasBranch)        result += '└── ';
    else                       result += '    ';
  }
  return result;
}

function flattenTree(
  nodes: TreeNode[],
  depth = 0,
  isLastStack: boolean[] = []
): { node: TreeNode; indent: string }[] {
  const rows: { node: TreeNode; indent: string }[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    rows.push({ node, indent: calculateIndent(depth, isLastStack, isLast) });
    if (node.children.length > 0) {
      rows.push(...flattenTree(node.children, depth + 1, [...isLastStack, isLast]));
    }
  });
  return rows;
}
```

### Pattern 4: Context Menus (adopt in Phase 2+)

All data views (files, containers, processes, services) should support right-click context menus with contextual actions.

**Pattern:**
```typescript
// client/src/components/ui/ContextMenu.tsx
interface ContextMenuItem {
  label: string;
  icon?: string;           // lucide icon name
  onClick: () => void;
  danger?: boolean;        // red text for destructive actions
  disabled?: boolean;
  separator?: boolean;     // render a divider line
  children?: ContextMenuItem[];  // submenu
}

// Usage in FileExplorer:
const fileContextMenu: ContextMenuItem[] = [
  { label: 'Open', icon: 'file', onClick: () => openFile(file) },
  { label: 'Rename', icon: 'pencil', onClick: () => renameFile(file) },
  { label: 'Download', icon: 'download', onClick: () => downloadFile(file) },
  { separator: true },
  { label: 'Delete', icon: 'trash-2', onClick: () => deleteFile(file), danger: true },
];
```

### Pattern 5: Single-Instance Window Enforcement

Some panels (Terminal, Task Manager) should only allow one instance. If the user clicks the nav item again, focus the existing panel instead of opening a duplicate.

**Pattern:**
```typescript
// In Zustand store
interface TabState {
  tabs: Tab[];
  openTab(app: AppDefinition): void;  // checks if single_instance tab already open
}

// openTab implementation:
openTab: (app) => {
  const existing = get().tabs.find(t => t.appId === app.id);
  if (existing && app.singleInstance) {
    // Focus existing tab instead of creating new one
    set({ activeTabId: existing.id });
    return;
  }
  // Create new tab...
}
```

---

### Pattern 6: LLM Observatory — Trace & Span Hierarchy (adopt in Phase EX4)

Embedded tracing system that captures every LLM call in a hierarchical trace tree, inspired by Arize Phoenix.

**Architecture:**
```
                    ┌───────────────── Observatory ─────────────────┐
                    │                                               │
                    │  ┌────────────┐   ┌────────────────────────┐ │
                    │  │ TraceStore │   │ AsyncLocalStorage      │ │
                    │  │ (in-memory │   │ Context Propagation    │ │
                    │  │  ring buf) │   │                        │ │
                    │  └─────┬──────┘   │ withTrace(name, fn)    │ │
                    │        │          │ withSpan(name, kind,fn)│ │
                    │        │          └───────────┬────────────┘ │
                    │        │                      │              │
                    │  ┌─────▼──────────────────────▼────────────┐ │
                    │  │         Instrumentation Points           │ │
                    │  │                                          │ │
                    │  │  ModelRouter.reason()  → LLM span       │ │
                    │  │  ModelRouter.chat()    → LLM span       │ │
                    │  │  UIAgent.run()         → AGENT trace    │ │
                    │  │  Executor.execute()    → CHAIN span     │ │
                    │  │  Planner.plan()        → CHAIN span     │ │
                    │  │  Tool executions       → TOOL span      │ │
                    │  │  DynamicUIGenerator    → CHAIN trace    │ │
                    │  └──────────────────────────────────────────┘ │
                    │        │                                      │
                    │  ┌─────▼──────────┐  ┌─────────────────────┐ │
                    │  │ REST API       │  │ WebSocket           │ │
                    │  │ /api/observatory│  │ /ws/observatory     │ │
                    │  │ traces, spans  │  │ live span events    │ │
                    │  └────────────────┘  └─────────────────────┘ │
                    └───────────────────────────────────────────────┘
```

**Trace hierarchy example (UIAgent session):**
```
Trace: "UIAgent: docker overview"  (4.2s, $0.05, 12 spans)
  └─ AGENT: UIAgent.run
       ├─ CHAIN: Planner.plan
       │    └─ LLM: ModelRouter.reason (o4-mini, 1.2s, 1240→380 tokens)
       ├─ CHAIN: ReactiveExecutor.execute
       │    ├─ LLM: ModelRouter.chat (gpt-4.1, 1.8s, 2100→850 tokens)
       │    ├─ TOOL: exec_command(docker ps) (0.3s)
       │    ├─ LLM: ModelRouter.chat (gpt-4.1, 1.5s, 3200→1200 tokens)
       │    └─ TOOL: generate_schema (0.1s)
       └─ CHAIN: PostReflector.reflect
            └─ LLM: ModelRouter.fast (gpt-4.1-mini, 0.8s, 800→200 tokens)
```

**Key patterns:**
- **Ring buffer:** 200-trace max. FIFO eviction. Map-based storage, O(1) read/write.
- **Cumulative rollup:** When a span ends, walk parent chain to root updating `cumulative.tokenUsage` and `cumulative.costUsd`. Phoenix pattern — compute at write time.
- **Lazy serialization:** Span `input`/`output` stored as JS references. Serialized to JSON only when detail API is called.
- **4 SpanKinds:** LLM (individual call), AGENT (root session), CHAIN (pipeline phase), TOOL (tool execution)

See [ADR-018](DECISIONS.md) and [phase-ex4.md](phases/phase-ex4.md).

---

### 8. CLI App Generation with Sandbox Discovery (EX5)

**Location:** Backend: `server/src/agent/sandbox-manager.ts`, `server/src/agent/tools/sandbox-exec.ts`, `server/src/dynamic-ui/app-store.ts`

HeadlessOS can generate management UIs for **any CLI tool** installed on a server. The agent introspects the tool's `--help` output, discovers subcommands and flags, and generates a complete `DynamicViewSchema` with tables, forms, and action buttons.

**Sandbox Discovery Pipeline:**
```
User: "Build UI for restic"
  │
  ├─ 1. SandboxManager.create(serverId, "restic")
  │     → docker run --rm -d --network=none --memory=256m ubuntu:22.04
  │
  ├─ 2. SandboxManager.install(sandboxId, ["restic"])
  │     → docker exec ... apt-get install -y restic
  │
  ├─ 3. Agent uses sandbox_exec tool for discovery:
  │     → sandbox_exec("restic --help")     → parse subcommands
  │     → sandbox_exec("restic backup -h")  → parse flags → form fields
  │     → sandbox_exec("restic snapshots -h") → parse flags → table columns
  │
  ├─ 4. Agent generates DynamicViewSchema JSON
  │
  ├─ 5. SandboxManager.destroy(sandboxId)
  │
  └─ 6. Schema applied to real server (dataSource commands, action buttons)
```

**Key features:**
- **Ephemeral containers** — Created per-session, destroyed after discovery, 5-min TTL
- **Resource-capped** — `--memory=256m --cpus=0.5 --pids-limit=100`
- **Network-isolated** — `--network=none` during discovery (brief bridge connection for package install)
- **OS-matched** — Base image matches server OS (Ubuntu→ubuntu:22.04, Debian→debian:12, etc.)
- **Fallback** — Direct discovery on server when Docker unavailable
- **Save as App** — Generated schemas persist to `~/.headlessos/user-apps/` and register as reusable templates
- **Form → Command** — `commandTemplate` field on FormWidget composes CLI commands from form values

See [ADR-019](DECISIONS.md) and [phase-ex5.md](phases/phase-ex5.md).

---

## Technology Constraints

| Constraint | Reason |
|------------|--------|
| Node.js 20+ | Need stable WebSocket, ESM, and modern APIs |
| ssh2 library directly | Need multi-channel support (not available in simpler wrappers) |
| Zod for schemas | Used both for TypeScript types AND LLM structured output generation |
| Fastify over Express | Native WebSocket plugin, TypeScript-first, better performance |
| xterm.js 6.x | Latest stable, used by VS Code, excellent addon ecosystem |
| React 19+ | Server components not needed, but hooks + concurrent features useful |
| TailwindCSS 4+ | Utility-first, fast iteration, no CSS-in-JS overhead |
