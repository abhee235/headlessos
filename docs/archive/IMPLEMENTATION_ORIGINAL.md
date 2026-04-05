# Implementation Plan

> Detailed, phase-by-phase build plan with code patterns, file-level tasks, and verification criteria.

## Overview

| Phase | Focus | Duration | Status |
|-------|-------|----------|--------|
| Phase 0 | Project scaffolding | 1 day | Not started |
| Phase 1 | SSH + Terminal + LLM parsing | 1 week | Not started |
| Phase 2 | System Dashboard + File Explorer | 1 week | Not started |
| Phase 3 | Docker + Processes + Services apps | 1 week | Not started |
| Phase 4 | Deterministic parsers + optimization | 1 week | Not started |
| Phase 5 | Polish, security hardening, testing | 1 week | Not started |

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize Monorepo

**Files to create:**
```
headlessOS/
├── package.json               # workspace root
├── tsconfig.base.json         # shared TS config
├── .gitignore
├── .env.example
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts           # "Hello world" Fastify server
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       └── App.tsx            # "Hello world" React app
└── shared/
    ├── package.json
    └── types.ts               # Shared type definitions
```

**Root `package.json`:**
```json
{
  "name": "headlessos",
  "private": true,
  "workspaces": ["server", "client", "shared"],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "build": "npm run build --workspace=server && npm run build --workspace=client",
    "test": "npm test --workspace=server"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.6.0"
  }
}
```

**Server `package.json` dependencies:**
```json
{
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "ssh2": "^1.17.0",
    "openai": "^5.0.0",
    "zod": "^3.24.0",
    "zod-to-json-schema": "^3.24.0",
    "strip-ansi": "^7.1.0",
    "nanoid": "^5.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/ssh2": "^1.15.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

**Client `package.json` dependencies:**
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-attach": "^0.12.0",
    "lucide-react": "^0.468.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

**Verification:**
- [ ] `npm install` succeeds from root
- [ ] `npm run dev` starts both server (port 3001) and client (port 3000)
- [ ] Browser shows React app at `localhost:3000`
- [ ] Server responds to `GET /health` at `localhost:3001`

---

### Task 0.2: Service Container (Foundation)

> **Ref:** [ADR-011](DECISIONS.md#adr-011-service-container-pattern), [ARCHITECTURE.md § Pattern 1](ARCHITECTURE.md#pattern-1-service-container-adopt-in-phase-0-1)

**Files to create:**
```
server/src/services/
├── base-service.ts       # Abstract base class with construct/init/destroy lifecycle
└── container.ts          # ServiceContainer — registry + two-phase boot
```

**BaseService contract:**
```typescript
export abstract class BaseService {
  protected services!: ServiceContainer;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async construct(services: ServiceContainer): Promise<void> {
    this.services = services;
    await this._construct();
  }

  async init(): Promise<void> {
    await this._init();
  }

  async destroy(): Promise<void> {
    await this._destroy();
  }

  protected async _construct(): Promise<void> {}
  protected async _init(): Promise<void> {}
  protected async _destroy(): Promise<void> {}
}
```

**ServiceContainer contract:**
```typescript
export class ServiceContainer {
  private instances = new Map<string, BaseService>();

  register(name: string, service: BaseService): void;
  get<T extends BaseService>(name: string): T;

  /** Two-phase boot: construct all → init all */
  async boot(): Promise<void>;

  /** Reverse-order shutdown */
  async shutdown(): Promise<void>;
}
```

**Boot order (registered in this sequence):**
1. `config` — ConfigService (reads `~/.headlessos/config.json`)
2. `ssh` — SSHConnectionManager
3. `llm` — LLMProviderService (needs config for API keys)
4. `parser` — ParsingPipelineService (needs LLM provider)
5. `apps` — AppRegistry (needs parser + SSH)

**Why this is Task 0.2 (not later):**
Every module built in Phase 1+ registers as a service. Building the container first means Phase 1 code (`ConnectionManager`, `LLMProvider`, `ParsingPipeline`) is written as services from day one — no refactoring later.

**Verification:**
- [ ] `ServiceContainer.boot()` calls `construct()` then `init()` in registration order
- [ ] `ServiceContainer.shutdown()` calls `destroy()` in reverse order
- [ ] `container.get('nonexistent')` throws descriptive error
- [ ] Services can access each other in `_init()` (not in `_construct()`)

---

### Task 0.3: Shared Types

**File: `shared/types.ts`**

```typescript
// ============================================
// Server Configuration
// ============================================

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'privateKey' | 'agent';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  serverId: string;
  status: ConnectionStatus;
  error?: string;
  connectedAt?: string;       // ISO string
  detectedTools?: string[];
}

// ============================================
// App System
// ============================================

export interface AppDefinition {
  id: string;
  name: string;
  icon: string;                 // lucide icon name
  description: string;
  requiredTools: string[];      // e.g., ['docker'] — app hidden if tool missing
  refreshInterval?: number;     // auto-poll interval in ms
}

// ============================================
// Parsed Data Types
// ============================================

export interface SystemInfo {
  hostname: string;
  uptime: string;
  os: string;
  kernel: string;
  architecture: string;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountPoint: string;
}

export interface MemoryInfo {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
}

export interface NetworkInterface {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  ipAddresses: string[];
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  permissions: string;        // e.g., "rwxr-xr-x"
  owner: string;
  group: string;
  size: number;               // bytes
  modified: string;           // ISO date string
  symlinkTarget?: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  ports: string;
  created: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  vsz: number;               // virtual memory KB
  rss: number;               // resident memory KB
  tty: string;
  stat: string;
  startTime: string;
  command: string;
}

export interface ServiceInfo {
  name: string;
  loadState: 'loaded' | 'not-found' | 'masked';
  activeState: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  subState: string;           // e.g., "running", "dead", "exited"
  description: string;
}

// ============================================
// API Response Wrappers
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  parsedBy: 'deterministic' | 'llm';  // transparency: how was this parsed?
  latencyMs: number;                    // total parse time
}

export interface SystemDashboard {
  system: SystemInfo;
  disks: DiskUsage[];
  memory: MemoryInfo;
  network: NetworkInterface[];
}
```

**Verification:**
- [ ] Types compile without errors
- [ ] Both server and client can import from shared

---

## Phase 1: SSH + Terminal + LLM Parsing

### Task 1.1: SSH Connection Manager

**File: `server/src/ssh/connection-manager.ts`**

**Implements:**
```typescript
class ConnectionManager {
  private connections: Map<string, ServerConnection>;

  async connect(config: ServerConfig): Promise<void>;
  async disconnect(serverId: string): Promise<void>;
  getState(serverId: string): ConnectionState;
  
  // Execute a one-shot command (opens exec channel, waits, returns)
  async exec(serverId: string, command: string): Promise<ExecResult>;
  
  // Get interactive shell stream (for terminal WebSocket bridge)
  async getShell(serverId: string, options?: ShellOptions): Promise<ClientChannel>;
  
  // Get SFTP client (lazy-initialized)
  async getSftp(serverId: string): Promise<SFTPWrapper>;
  
  // Detect what tools are available on the server
  async detectTools(serverId: string): Promise<string[]>;
  
  // Events
  on(event: 'stateChange', listener: (state: ConnectionState) => void): void;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface ShellOptions {
  rows?: number;
  cols?: number;
  term?: string;   // default "xterm-256color"
}
```

**Key implementation details:**
- Store `ssh2.Client` instance per server
- On `connect()`: authenticate, then call `detectTools()` automatically
- `detectTools()` runs: `which docker git python3 node systemctl nginx pm2 2>/dev/null`
- `exec()` creates a new channel via `conn.exec(command)`, collects stdout/stderr into buffers, resolves on `close`
- `exec()` has a configurable timeout (default 30s) — reject if command doesn't complete
- `getShell()` returns the raw `ClientChannel` stream — caller (WebSocket handler) pipes it
- SFTP via `conn.sftp()`, cached after first call
- Emit `stateChange` events for frontend connection status indicators

**Error handling:**
- Connection failure → retry 3 times with exponential backoff (1s, 2s, 4s)
- Auth failure → emit error immediately (no retry)
- Channel error → log and reject the specific exec/shell call
- Connection drop → emit `disconnected`, attempt auto-reconnect if previously connected

**Verification:**
- [ ] Can connect to a real VPS via password auth
- [ ] Can connect via private key
- [ ] `exec("echo hello")` returns `{ stdout: "hello\n", exitCode: 0 }`
- [ ] `detectTools()` returns array of available tools
- [ ] Connection drop triggers reconnect

---

### Task 1.2: LLM Provider Interface + OpenAI Implementation

**File: `server/src/llm/provider.ts`**

```typescript
import { ZodSchema } from 'zod';

export interface ParseTextInput<T> {
  rawOutput: string;           // terminal output (ANSI already stripped)
  command: string;             // the command that produced this output
  schema: ZodSchema<T>;       // expected output shape
  context?: string;            // optional additional context
}

export interface ParseImageInput<T> {
  image: Buffer;               // PNG screenshot
  command: string;
  schema: ZodSchema<T>;
  context?: string;
}

export interface ParseResult<T> {
  data: T;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  model: string;
}

export interface LLMProvider {
  name: string;
  parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>>;
  parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>>;
}
```

**File: `server/src/llm/providers/openai.ts`**

```typescript
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;
  private visionModel: string;

  constructor(config: { apiKey: string; model?: string; visionModel?: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model ?? 'gpt-4o-mini';
    this.visionModel = config.visionModel ?? 'gpt-4o-mini';
  }

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const start = Date.now();
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: buildTextPrompt(input.command, input.rawOutput, input.context),
      text: {
        format: zodResponseFormat(input.schema, 'parsed_output'),
      },
    });
    // ... extract data, token usage, return ParseResult
  }

  async parseImage<T>(input: ParseImageInput<T>): Promise<ParseResult<T>> {
    // Use vision model with image input
    // ... similar pattern but with image_url in messages
  }
}

const SYSTEM_PROMPT = `You are a terminal output parser for a server management tool.
Given a Linux command and its terminal output, extract structured data.
Rules:
- Extract ONLY data that exists in the output. Never invent or guess values.
- If a field is unclear or missing, use null (if schema allows) or a reasonable default.
- Numbers should be actual numbers, not strings (unless the schema specifies string).
- Dates should be ISO 8601 format when possible.
- File sizes should be in bytes (convert from human-readable if needed).`;
```

**Verification:**
- [ ] Can parse `df -h` output into `DiskUsage[]`
- [ ] Can parse `ls -la` output into `FileEntry[]`
- [ ] Returns valid Zod-validated data
- [ ] Token usage and latency are tracked

---

### Task 1.3: Parsing Pipeline

**File: `server/src/parsers/pipeline.ts`**

```typescript
import { ZodSchema } from 'zod';
import stripAnsi from 'strip-ansi';

export class ParsingPipeline {
  private deterministicParsers: Map<string, DeterministicParser>;
  private llmProvider: LLMProvider;

  constructor(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
    this.deterministicParsers = new Map();
  }

  registerParser(commandPattern: string, parser: DeterministicParser): void {
    this.deterministicParsers.set(commandPattern, parser);
  }

  async parse<T>(
    command: string,
    rawOutput: string,
    schema: ZodSchema<T>
  ): Promise<{ data: T; parsedBy: 'deterministic' | 'llm'; latencyMs: number }> {
    const cleanOutput = stripAnsi(rawOutput);
    const start = Date.now();

    // Try deterministic parser first
    const parser = this.findParser(command);
    if (parser) {
      try {
        const data = parser.parse(cleanOutput);
        const validated = schema.parse(data);
        return {
          data: validated,
          parsedBy: 'deterministic',
          latencyMs: Date.now() - start
        };
      } catch {
        // Deterministic parser failed, fall through to LLM
      }
    }

    // Fall back to LLM
    const result = await this.llmProvider.parseText({
      rawOutput: cleanOutput,
      command,
      schema,
    });

    return {
      data: result.data,
      parsedBy: 'llm',
      latencyMs: Date.now() - start
    };
  }

  private findParser(command: string): DeterministicParser | undefined {
    // Match command against registered patterns
    // e.g., "ls -la /var/log" matches pattern "ls"
    for (const [pattern, parser] of this.deterministicParsers) {
      if (command.startsWith(pattern) || command.includes(pattern)) {
        return parser;
      }
    }
    return undefined;
  }
}

export interface DeterministicParser {
  parse(output: string): unknown;
}
```

**Verification:**
- [ ] Falls through to LLM when no deterministic parser registered
- [ ] Uses deterministic parser when registered and it succeeds
- [ ] Falls through to LLM when deterministic parser throws
- [ ] Zod validation catches malformed LLM output

---

### Task 1.4: Command Orchestrator

> **Ref:** [ADR-013](DECISIONS.md), [ARCHITECTURE.md § Command Orchestrator](ARCHITECTURE.md)

**File: `server/src/orchestrator/orchestrator.ts`**

**Responsibility:** Sits between route handlers and the SSH + parsing pipeline. Handles multi-command execution, parallel runs, retry with error context, and command fallbacks. This is the layer that makes the parsing pipeline production-ready.

```typescript
import { BaseService } from '../services/base-service';

interface CommandStep {
  id: string;
  command: string;
  schema: ZodSchema;
  fallbackCommands?: string[];   // try these if primary command fails
  optional?: boolean;            // failure doesn't fail the whole plan
  dependsOn?: string[];          // wait for these steps first
  timeout?: number;
}

interface ExecutionPlan {
  steps: CommandStep[];
  parallel?: boolean;            // default true
}

interface StepResult {
  id: string;
  parsedBy: 'deterministic' | 'llm' | 'cache';
  latencyMs: number;
  retries: number;
  fallbackUsed?: string;
}

interface ExecutionResult<T> {
  data: T;
  meta: {
    totalLatencyMs: number;
    steps: StepResult[];
    errors: { stepId: string; error: string }[];
  };
}

export class CommandOrchestrator extends BaseService {
  // Injected via service container
  private ssh!: SSHConnectionManager;
  private parser!: ParsingPipeline;

  protected async _init() {
    this.ssh = this.services.get('ssh');
    this.parser = this.services.get('parser');
  }

  async execute<T>(
    serverId: string,
    plan: ExecutionPlan,
    aggregator: (results: Map<string, unknown>) => T
  ): Promise<ExecutionResult<T>> {
    const results = new Map<string, unknown>();
    const stepMeta: StepResult[] = [];
    const errors: { stepId: string; error: string }[] = [];

    // Separate steps into waves based on dependsOn
    const waves = this.buildWaves(plan.steps);

    for (const wave of waves) {
      // Run independent steps in parallel
      const promises = wave.map(step => this.executeStep(serverId, step));
      const outcomes = await Promise.allSettled(promises);

      for (let i = 0; i < wave.length; i++) {
        const step = wave[i];
        const outcome = outcomes[i];
        if (outcome.status === 'fulfilled') {
          results.set(step.id, outcome.value.data);
          stepMeta.push(outcome.value.meta);
        } else {
          if (step.optional) {
            errors.push({ stepId: step.id, error: outcome.reason.message });
          } else {
            throw new Error(`Required step "${step.id}" failed: ${outcome.reason.message}`);
          }
        }
      }
    }

    return {
      data: aggregator(results),
      meta: { totalLatencyMs: /* sum */, steps: stepMeta, errors },
    };
  }

  /** Execute one step with retry + fallback logic */
  private async executeStep(serverId: string, step: CommandStep) {
    const commands = [step.command, ...(step.fallbackCommands ?? [])];

    for (const command of commands) {
      try {
        const execResult = await this.ssh.exec(serverId, command);
        if (execResult.exitCode !== 0 && commands.indexOf(command) < commands.length - 1) {
          continue; // try next fallback
        }
        const parsed = await this.parseWithRetry(command, execResult.stdout, step.schema);
        return {
          data: parsed.data,
          meta: {
            id: step.id,
            parsedBy: parsed.parsedBy,
            latencyMs: parsed.latencyMs,
            retries: parsed.retries,
            fallbackUsed: command !== step.command ? command : undefined,
          },
        };
      } catch (err) {
        if (commands.indexOf(command) < commands.length - 1) continue;
        throw err;
      }
    }
    throw new Error(`All commands failed for step "${step.id}"`);
  }

  /** Parse with one retry — on Zod failure, re-prompt LLM with error context */
  private async parseWithRetry(command: string, rawOutput: string, schema: ZodSchema) {
    try {
      const result = await this.parser.parse(command, rawOutput, schema);
      return { ...result, retries: 0 };
    } catch (firstError) {
      // Retry: send error context to LLM
      const retryResult = await this.parser.parseWithContext(
        command, rawOutput, schema,
        `Previous parse failed with: ${firstError.message}. Please fix and return valid JSON.`
      );
      return { ...retryResult, retries: 1 };
    }
  }
}
```

**Key behaviors:**
- **Parallel execution:** Independent steps run simultaneously via `Promise.allSettled`
- **Dependency waves:** Steps with `dependsOn` wait for their dependencies
- **Retry with error context:** Zod errors are fed back to the LLM (>80% fix rate)
- **Command fallback:** `ip -brief addr` → `ifconfig` → `ip addr show`
- **Optional steps:** Network info failing doesn't crash the whole dashboard
- **Registered as a service:** `container.register('orchestrator', new CommandOrchestrator())`

**Verification:**
- [ ] Dashboard plan (5 commands) runs all in parallel
- [ ] Zod validation failure triggers retry with error context
- [ ] Fallback command is tried when primary command returns non-zero exit
- [ ] Optional step failure doesn't fail the whole plan
- [ ] Required step failure throws with descriptive error

---

### Task 1.5: Terminal WebSocket Bridge

**File: `server/src/routes/terminal.ts`**

**How it works:**
```
Browser (xterm.js)
    │
    │ WebSocket: ws://localhost:3001/ws/terminal/:serverId
    │
    ▼
Fastify WebSocket handler
    │
    │ Pipes bidirectionally:
    │   ws.on('message') → sshChannel.write()
    │   sshChannel.on('data') → ws.send()
    │
    ▼
SSH shell channel (PTY)
    │
    ▼
Remote server bash/zsh
```

```typescript
// Route registration
fastify.register(async function (fastify) {
  fastify.get('/ws/terminal/:serverId', { websocket: true }, (socket, req) => {
    const { serverId } = req.params as { serverId: string };

    // Get or create SSH shell channel
    const shell = await connectionManager.getShell(serverId, {
      rows: 24,
      cols: 80,
      term: 'xterm-256color',
    });

    // Bridge: WebSocket ↔ SSH Channel
    socket.on('message', (data: Buffer) => {
      // Could be terminal input or resize event
      const msg = data.toString();
      if (msg.startsWith('RESIZE:')) {
        const [rows, cols] = msg.slice(7).split(',').map(Number);
        shell.setWindow(rows, cols, 0, 0);
      } else {
        shell.write(data);
      }
    });

    shell.on('data', (data: Buffer) => {
      socket.send(data);
    });

    shell.on('close', () => {
      socket.close();
    });

    socket.on('close', () => {
      shell.close();
    });
  });
});
```

**Verification:**
- [ ] Open terminal in browser → type `ls` → see file listing
- [ ] Colors and cursor positioning work (ANSI escapes pass through)
- [ ] Terminal resize works (xterm.js sends RESIZE, PTY window updates)
- [ ] Closing browser tab closes SSH channel
- [ ] Disconnecting SSH closes WebSocket

---

### Task 1.6: Server Config Management

**File: `server/src/config/store.ts`**

**Responsibility:** Read/write `~/.headlessos/servers.json` and `~/.headlessos/config.json`.

```typescript
export class ConfigStore {
  private configDir: string;   // ~/.headlessos/

  async getServers(): Promise<ServerConfig[]>;
  async addServer(config: Omit<ServerConfig, 'id'>): Promise<ServerConfig>;
  async updateServer(id: string, updates: Partial<ServerConfig>): Promise<ServerConfig>;
  async removeServer(id: string): Promise<void>;

  async getAppConfig(): Promise<AppConfig>;
  async updateAppConfig(updates: Partial<AppConfig>): Promise<AppConfig>;
}
```

**Security note:** Passwords stored here are encrypted using a local key derived from machine-specific data. See [SECURITY.md](SECURITY.md).

**Verification:**
- [ ] Creates `~/.headlessos/` directory if it doesn't exist
- [ ] Can add/list/update/remove server configs
- [ ] Config persists across server restarts

---

### Task 1.7: API Routes (Phase 1)

**File: `server/src/routes/servers.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers` | List all configured servers |
| POST | `/api/servers` | Add a new server |
| PUT | `/api/servers/:id` | Update server config |
| DELETE | `/api/servers/:id` | Remove server |
| POST | `/api/servers/:id/connect` | Connect to server via SSH |
| POST | `/api/servers/:id/disconnect` | Disconnect |
| GET | `/api/servers/:id/status` | Get connection state + detected tools |

---

### Task 1.8: Frontend Shell (Layout)

**Files:**
- `client/src/components/Shell/Sidebar.tsx`
- `client/src/components/Shell/TabContainer.tsx`
- `client/src/components/Shell/TerminalPanel.tsx`
- `client/src/components/Shell/Layout.tsx`
- `client/src/store/app-store.ts` (Zustand)

**App state (Zustand):**
```typescript
interface AppState {
  // Server management
  servers: ServerConfig[];
  activeServerId: string | null;
  connectionStates: Record<string, ConnectionState>;

  // Tab management
  tabs: Tab[];
  activeTabId: string | null;

  // Terminal panel
  terminalVisible: boolean;
  terminalHeight: number;         // in pixels, resizable

  // Actions
  setActiveServer(id: string): void;
  openTab(tab: Tab): void;
  closeTab(id: string): void;
  setActiveTab(id: string): void;
  toggleTerminal(): void;
}

interface Tab {
  id: string;
  appId: string;          // 'system' | 'files' | 'docker' | 'processes' | 'terminal'
  serverId: string;
  label: string;
  icon: string;
}
```

**Verification:**
- [ ] Sidebar shows list of configured servers
- [ ] Clicking server connects and shows available apps
- [ ] Clicking app opens a tab
- [ ] Terminal panel at bottom can be toggled open/closed
- [ ] Layout is responsive

---

### Task 1.9: Terminal Component (xterm.js)

**File: `client/src/components/Terminal/TerminalView.tsx`**

```typescript
// Key integration points:
// 1. Create xterm.js Terminal instance
// 2. Attach FitAddon for auto-resize
// 3. Open WebSocket to ws://localhost:3001/ws/terminal/:serverId
// 4. Use AttachAddon to bridge xterm ↔ WebSocket
// 5. On resize, send RESIZE:rows,cols message to WebSocket
```

**Verification:**
- [ ] Terminal renders in browser
- [ ] Can type commands and see output
- [ ] Tab completion works
- [ ] Colors display correctly
- [ ] Copy/paste works
- [ ] Resize adjusts terminal dimensions

---

## Phase 2: System Dashboard + File Explorer

### Task 2.1: System Dashboard Backend

**File: `server/src/routes/system.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/system` | Full system dashboard data |
| GET | `/api/servers/:id/system/disk` | Disk usage only |
| GET | `/api/servers/:id/system/memory` | Memory info only |

**Implementation:**
```typescript
// GET /api/servers/:id/system
// Runs 6 commands in parallel via exec(), parses each, returns aggregated result

const commands = [
  { cmd: 'hostname', field: 'hostname' },
  { cmd: 'uptime', field: 'uptime' },
  { cmd: 'uname -srm', field: 'kernel' },
  { cmd: 'df -h', field: 'disks', schema: DiskUsageArraySchema },
  { cmd: 'free -m', field: 'memory', schema: MemoryInfoSchema },
  { cmd: 'ip -brief addr', field: 'network', schema: NetworkArraySchema },
];

// Execute all in parallel
const results = await Promise.all(
  commands.map(c => connectionManager.exec(serverId, c.cmd))
);

// Parse each through pipeline
// Return aggregated SystemDashboard
```

**Verification:**
- [ ] Returns valid SystemDashboard JSON
- [ ] Each field is correctly parsed
- [ ] Response includes `parsedBy` field for each section
- [ ] Latency is logged

---

### Task 2.2: System Dashboard Frontend

**Files:**
- `client/src/components/Dashboard/DashboardView.tsx`
- `client/src/components/Dashboard/DiskCard.tsx`
- `client/src/components/Dashboard/MemoryCard.tsx`
- `client/src/components/Dashboard/NetworkCard.tsx`
- `client/src/components/Dashboard/UptimeCard.tsx`

**Layout:**
```
┌─────────────────────────────────────────┐
│  🖥️  hostname     ⏱ uptime  📦 kernel  │  ← top info bar
├─────────────┬───────────────┬───────────┤
│    💾       │     🧠        │    🌐     │
│   Disk      │    Memory     │  Network  │
│  Usage      │    Usage      │  Interfaces│
│  ████░░ 60% │  ████░ 80%   │  eth0: UP │
│  /dev/sda1  │  2048/4096MB │  10.0.0.1 │
│             │              │           │
├─────────────┴───────────────┴───────────┤
│  Auto-refresh: every 30s   Last: 2s ago │
└─────────────────────────────────────────┘
```

**Verification:**
- [ ] Dashboard loads and shows real server data
- [ ] Disk usage shows progress bars with percentages
- [ ] Memory shows used/total
- [ ] Network shows interface names and IPs
- [ ] Auto-refreshes on configured interval

---

### Task 2.3: File Explorer Backend

**File: `server/src/routes/files.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/files?path=/` | List directory |
| GET | `/api/servers/:id/files/read?path=/etc/nginx/nginx.conf` | Read file content |
| POST | `/api/servers/:id/files/mkdir` | Create directory |
| POST | `/api/servers/:id/files/rename` | Rename file/dir |
| DELETE | `/api/servers/:id/files?path=/tmp/old` | Delete file/dir |
| POST | `/api/servers/:id/files/upload` | Upload file via SFTP |
| GET | `/api/servers/:id/files/download?path=/var/log/syslog` | Download file |

**Directory listing implementation:**
- Uses `exec('ls -la --time-style=long-iso <path>')` → parse pipeline
- Alternatively, use SFTP `readdir()` for more reliable results (returns structured data natively — no LLM needed!)

**File read/write:**
- Always via SFTP (`sftp.readFile()`, `sftp.writeFile()`) — no parsing needed

**Verification:**
- [ ] Can list `/` directory
- [ ] Navigating to `/etc/` shows correct files
- [ ] Can read a text file and return its content
- [ ] Can create a new directory
- [ ] Can rename a file
- [ ] Can delete a file (with path validation)
- [ ] Path traversal attacks blocked (see SECURITY.md)

---

### Task 2.4: File Explorer Frontend

**Files:**
- `client/src/components/FileExplorer/FileExplorerView.tsx`
- `client/src/components/FileExplorer/FileTree.tsx`
- `client/src/components/FileExplorer/FileList.tsx`
- `client/src/components/FileExplorer/FileActions.tsx`
- `client/src/components/FileExplorer/FileViewer.tsx`

**Layout:**
```
┌────────────────────┬─────────────────────────────────┐
│ 📁 File Tree       │  📋 File List                   │
│                    │                                 │
│ / (root)           │  Name      Size   Modified      │
│ ├── etc/           │  ──────────────────────────     │
│ │   ├── nginx/     │  📁 nginx/  4KB   2024-03-01   │
│ │   └── ssh/       │  📁 ssh/    4KB   2024-02-15   │
│ ├── var/           │  📄 hosts   256B  2024-01-10   │
│ │   └── log/       │  📄 passwd  1.2KB 2024-03-15   │
│ ├── home/          │                                 │
│ └── tmp/           │  [New File] [New Folder] [Upload]│
└────────────────────┴─────────────────────────────────┘
```

**Features:**
- Left panel: collapsible directory tree (lazy-loaded on expand)
- Right panel: file list with name, size, permissions, modified date
- Double-click file → open in text viewer/editor
- Right-click → context menu (rename, delete, download)
- Toolbar: create file, create folder, upload, refresh

**Verification:**
- [ ] Tree loads root directory on mount
- [ ] Clicking folder in tree expands it and loads contents
- [ ] File list shows details (size, permissions, date)
- [ ] Double-click opens text file in viewer
- [ ] Can create, rename, delete files/folders
- [ ] Breadcrumb navigation works

---

## Phase 3: Docker + Processes + Services

### Task 3.1: Docker App Backend

**File: `server/src/routes/docker.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/docker/containers` | List containers |
| GET | `/api/servers/:id/docker/images` | List images |
| POST | `/api/servers/:id/docker/containers/:cid/start` | Start container |
| POST | `/api/servers/:id/docker/containers/:cid/stop` | Stop container |
| POST | `/api/servers/:id/docker/containers/:cid/restart` | Restart container |
| DELETE | `/api/servers/:id/docker/containers/:cid` | Remove container |
| DELETE | `/api/servers/:id/docker/images/:iid` | Remove image |
| WS | `/ws/docker/:serverId/logs/:cid` | Stream container logs |

**Key: Docker supports JSON output natively!**
```bash
docker ps -a --format '{{json .}}'
docker images --format '{{json .}}'
```
→ This means NO LLM needed for Docker. Parse JSON directly. Fastest app to build.

**Verification:**
- [ ] Lists containers with correct state
- [ ] Can start/stop/restart containers
- [ ] Log streaming works in real-time via WebSocket
- [ ] Handles "docker not found" gracefully

---

### Task 3.2: Docker App Frontend

**Files:**
- `client/src/components/Docker/DockerView.tsx`
- `client/src/components/Docker/ContainerList.tsx`
- `client/src/components/Docker/ImageList.tsx`
- `client/src/components/Docker/LogViewer.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  [Containers]  [Images]  [Volumes]              │
├─────────────────────────────────────────────────┤
│                                                 │
│  Name         Image        Status    Actions    │
│  ─────────────────────────────────────────────  │
│  🟢 nginx    nginx:latest  Running  [⏹][🔄][📋]│
│  🔴 redis    redis:7       Exited   [▶][🗑][📋]│
│  🟢 postgres postgres:16  Running  [⏹][🔄][📋]│
│                                                 │
│  📋 = View Logs                                 │
└─────────────────────────────────────────────────┘
```

**Verification:**
- [ ] Containers listed with status indicators
- [ ] Start/Stop/Restart buttons work
- [ ] Log viewer shows real-time output
- [ ] Images tab shows Docker images

---

### Task 3.3: Process Manager Backend

**File: `server/src/routes/processes.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/processes` | List processes (sorted by memory) |
| POST | `/api/servers/:id/processes/:pid/kill` | Kill a process |

**Command:** `ps aux --sort=-%mem`
**Parser:** LLM first, then deterministic (Phase 4)

---

### Task 3.4: Services Manager Backend

**File: `server/src/routes/services.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/services` | List systemd services |
| POST | `/api/servers/:id/services/:name/start` | Start service |
| POST | `/api/servers/:id/services/:name/stop` | Stop service |
| POST | `/api/servers/:id/services/:name/restart` | Restart service |

**Command:** `systemctl list-units --type=service --all --no-pager --plain`
**Parser:** LLM first, then deterministic

---

## Phase 4: Deterministic Parsers + Optimization

### Task 4.1: Write Deterministic Parsers

| Parser File | Command | Output Format | Regex Pattern |
|-------------|---------|---------------|---------------|
| `parsers/deterministic/df.ts` | `df -h` | Columnar table | Split by whitespace, skip header |
| `parsers/deterministic/free.ts` | `free -m` | Columnar table | Split by whitespace, match "Mem:" row |
| `parsers/deterministic/ps.ts` | `ps aux` | Columnar table | Split by whitespace (max 11 fields) |
| `parsers/deterministic/ls.ts` | `ls -la --time-style=long-iso` | Columnar | Regex per line |
| `parsers/deterministic/ip.ts` | `ip -brief addr` | Space-separated | Simple split |
| `parsers/deterministic/systemctl.ts` | `systemctl list-units ...` | Columnar | Split + state matching |

**Each parser exports:**
```typescript
export const dfParser: DeterministicParser = {
  parse(output: string): DiskUsage[] {
    const lines = output.trim().split('\n').slice(1); // skip header
    return lines.map(line => {
      const [filesystem, size, used, available, usePercent, mountPoint] = line.split(/\s+/);
      return {
        filesystem,
        size,
        used,
        available,
        usePercent: parseInt(usePercent),
        mountPoint,
      };
    });
  }
};
```

**Verification:**
- [ ] Each parser produces identical output to LLM parser on 10+ sample inputs
- [ ] Parsers handle edge cases (empty output, missing fields, UTF-8)
- [ ] Latency comparison: deterministic <1ms vs LLM 1-3s

---

### Task 4.2: Caching Layer

**File: `server/src/cache/cache.ts`**

```typescript
interface CacheEntry<T> {
  data: T;
  rawOutputHash: string;       // MD5 of raw terminal output
  timestamp: number;
  ttlMs: number;
}

class OutputCache {
  // Before calling LLM, check cache:
  // 1. Is there a cached result for this server + command?
  // 2. Is the TTL still valid?
  // 3. Has the raw output changed? (hash comparison)
  //    If output is the same → return cached parsed result (skip LLM entirely)
  get<T>(serverId: string, command: string, rawOutput: string): T | null;
  set<T>(serverId: string, command: string, rawOutput: string, data: T, ttlMs: number): void;
}
```

**This is key for cost optimization:** If `df -h` output hasn't changed between polls, don't re-parse it.

---

### Task 4.3: SFTP for File Operations

Replace `ls -la` parsing with SFTP `readdir()` which returns structured data natively:
```typescript
// sftp.readdir() returns:
interface FileEntryRaw {
  filename: string;
  longname: string;    // like ls -l output
  attrs: {
    mode: number;
    uid: number;
    gid: number;
    size: number;
    atime: number;
    mtime: number;
  };
}
// → No LLM needed for file listing!
```

---

## Phase 5: Polish, Security, Testing

### Task 5.1: Security Hardening

See [SECURITY.md](SECURITY.md) for full details. Key implementations:
- Command allowlist validation
- Path sanitization (no `../` traversal)
- Container ID validation (hex chars only)
- PID validation (integer only)
- Rate limiting on command execution

### Task 5.2: Error Handling

- Every API route wrapped in try/catch
- Connection errors → meaningful error messages to frontend
- LLM failures → retry once, then return raw output with error flag
- Timeout handling for long-running commands

### Task 5.3: Testing

See [TESTING.md](TESTING.md) for full strategy.

### Task 5.4: UI Polish

> **Ref:** [ARCHITECTURE.md § Design Patterns](ARCHITECTURE.md#design-patterns-reference-from-puter-analysis) — patterns 3, 4, 5

**Context Menus (all data views):**
Every data view (files, containers, processes, services) should support right-click context menus. Use a shared `ContextMenu` component:
```typescript
interface ContextMenuItem {
  label: string;
  icon?: string;           // lucide icon name
  onClick: () => void;
  danger?: boolean;        // red text for destructive actions
  disabled?: boolean;
  separator?: boolean;     // divider line
  children?: ContextMenuItem[];  // submenu
}
```

Contextual menus per app:
- **File Explorer:** Open, Rename, Download, Copy Path, ----, Delete
- **Docker Containers:** Start, Stop, Restart, View Logs, ----, Remove
- **Processes:** Signal (TERM), Force Kill (KILL)
- **Services:** Start, Stop, Restart, Enable, Disable

**Single-Instance Tab Enforcement:**
Some tabs (Terminal, System Dashboard) should only have one instance per server. If user clicks nav item again → focus existing tab, don't create duplicate.
```typescript
openTab: (app) => {
  const existing = get().tabs.find(t => t.appId === app.id && t.serverId === activeServerId);
  if (existing && app.singleInstance) {
    set({ activeTabId: existing.id });
    return;
  }
  // Create new tab...
}
```

**Process Tree Visualization:**
The Process Manager should render a tree (not a flat table) showing parent→child relationships with `├── └── │` indentation. Use the recursive `flattenTree()` algorithm from [ARCHITECTURE.md § Pattern 3](ARCHITECTURE.md#pattern-3-process-tree-visualization-adopt-in-phase-3).

**Other polish items:**
- Loading states for all data-fetching components
- Error states with retry buttons
- Empty states ("No containers found")
- Toast notifications for actions (container stopped, file deleted)
- Dark theme (TailwindCSS dark mode)
- Keyboard shortcuts (Ctrl+` for terminal, Ctrl+Tab for tab switching)
