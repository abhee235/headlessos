# Phase 1: SSH + Terminal + LLM Parsing

> **Milestone:** M1 | **Duration:** Week 1, Day 3-7 | **Status:** Not started
> **Prerequisites:** M0 complete (ServiceContainer, Fastify, React running)
> **Definition of Done:** Can add a VPS, connect, see detected tools, open a working terminal, and run a command through the orchestrator → parsing pipeline (e.g., dashboard plan returns structured JSON for 5+ commands in parallel with retry).

---

## Task 1.1: SSH Connection Manager

**Task ID:** `M1.1`
**File: `server/src/ssh/connection-manager.ts`**

**Implements:**
```typescript
class ConnectionManager {
  private connections: Map<string, ServerConnection>;

  async connect(config: ServerConfig): Promise<void>;
  async disconnect(serverId: string): Promise<void>;
  getState(serverId: string): ConnectionState;
  
  async exec(serverId: string, command: string): Promise<ExecResult>;
  async getShell(serverId: string, options?: ShellOptions): Promise<ClientChannel>;
  async getSftp(serverId: string): Promise<SFTPWrapper>;
  async detectTools(serverId: string): Promise<string[]>;
  
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

## Task 1.2: LLM Provider Interface + OpenAI Implementation

**Task ID:** `M1.2`
**File: `server/src/llm/provider.ts`**

```typescript
import { ZodSchema } from 'zod';

export interface ParseTextInput<T> {
  rawOutput: string;
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

  async parseText<T>(input: ParseTextInput<T>): Promise<ParseResult<T>> {
    const response = await this.client.responses.parse({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      input: buildTextPrompt(input.command, input.rawOutput, input.context),
      text: { format: zodResponseFormat(input.schema, 'parsed_output') },
    });
    // ... extract data, token usage, return ParseResult
  }
}
```

**Verification:**
- [ ] Can parse `df -h` output into `DiskUsage[]`
- [ ] Can parse `ls -la` output into `FileEntry[]`
- [ ] Returns valid Zod-validated data
- [ ] Token usage and latency are tracked

---

## Task 1.3: Parsing Pipeline

**Task ID:** `M1.3`
**File: `server/src/parsers/pipeline.ts`**

```typescript
export class ParsingPipeline {
  private deterministicParsers: Map<string, DeterministicParser>;
  private llmProvider: LLMProvider;

  async parse<T>(command: string, rawOutput: string, schema: ZodSchema<T>):
    Promise<{ data: T; parsedBy: 'deterministic' | 'llm'; latencyMs: number }>;
}
```

**Flow:** strip ANSI → try deterministic parser → fall back to LLM → Zod validate

**Verification:**
- [ ] Falls through to LLM when no deterministic parser registered
- [ ] Uses deterministic parser when registered and it succeeds
- [ ] Falls through to LLM when deterministic parser throws
- [ ] Zod validation catches malformed LLM output

---

## Task 1.4: Command Orchestrator

**Task ID:** `M1.4`
> **Ref:** [ADR-013](../DECISIONS.md), [ARCHITECTURE.md § Command Orchestrator](../ARCHITECTURE.md)

**File: `server/src/orchestrator/orchestrator.ts`**

```typescript
interface CommandStep {
  id: string;
  command: string;
  schema: ZodSchema;
  fallbackCommands?: string[];
  optional?: boolean;
  dependsOn?: string[];
  timeout?: number;
}

interface ExecutionPlan {
  steps: CommandStep[];
  parallel?: boolean;
}

export class CommandOrchestrator extends BaseService {
  async execute<T>(
    serverId: string,
    plan: ExecutionPlan,
    aggregator: (results: Map<string, unknown>) => T
  ): Promise<ExecutionResult<T>>;
}
```

**Key behaviors:**
- Parallel execution via `Promise.allSettled`
- Dependency waves (steps with `dependsOn` wait)
- Retry with Zod error context (>80% fix rate)
- Command fallback chains (`ip` → `ifconfig`)
- Optional steps (network failing doesn't crash dashboard)

**Verification:**
- [ ] Dashboard plan (5 commands) runs all in parallel
- [ ] Zod validation failure triggers retry with error context
- [ ] Fallback command is tried when primary returns non-zero exit
- [ ] Optional step failure doesn't fail the whole plan

---

## Task 1.5: Terminal WebSocket Bridge

**Task ID:** `M1.5`
**File: `server/src/routes/terminal.ts`**

```
Browser (xterm.js) → WebSocket → Fastify handler → SSH shell channel → Remote bash
```

Bidirectional pipe: `ws.on('message') → shell.write()` and `shell.on('data') → ws.send()`

**Verification:**
- [ ] Type `ls` → see file listing
- [ ] Colors and cursor positioning work
- [ ] Terminal resize works
- [ ] Closing browser tab closes SSH channel

---

## Task 1.6: Server Config Management

**Task ID:** `M1.6`
**File: `server/src/config/store.ts`**

Reads/writes `~/.headlessos/servers.json` and `~/.headlessos/config.json`.

```typescript
export class ConfigStore {
  async getServers(): Promise<ServerConfig[]>;
  async addServer(config: Omit<ServerConfig, 'id'>): Promise<ServerConfig>;
  async updateServer(id: string, updates: Partial<ServerConfig>): Promise<ServerConfig>;
  async removeServer(id: string): Promise<void>;
}
```

**Verification:**
- [ ] Creates `~/.headlessos/` directory if it doesn't exist
- [ ] Can add/list/update/remove server configs
- [ ] Config persists across server restarts

---

## Task 1.7: API Routes (Phase 1)

**Task ID:** `M1.7`
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

**Verification:**
- [ ] CRUD servers via REST API works
- [ ] Connect/disconnect triggers SSH connection manager

---

## Task 1.8: Frontend Shell (Layout)

**Task ID:** `M1.8`
**Files:**
- `client/src/components/Shell/Sidebar.tsx`
- `client/src/components/Shell/TabContainer.tsx`
- `client/src/components/Shell/TerminalPanel.tsx`
- `client/src/components/Shell/Layout.tsx`
- `client/src/store/app-store.ts`

**Verification:**
- [ ] Sidebar shows list of configured servers
- [ ] Clicking server connects and shows available apps
- [ ] Clicking app opens a tab
- [ ] Terminal panel at bottom can be toggled

---

## Task 1.9: Terminal Component (xterm.js)

**Task ID:** `M1.9`
**File: `client/src/components/Terminal/TerminalView.tsx`**

Integration: xterm.js Terminal → FitAddon → WebSocket → AttachAddon

**Verification:**
- [ ] Terminal renders in browser
- [ ] Can type commands and see output
- [ ] Colors display correctly
- [ ] Copy/paste works
- [ ] Resize adjusts terminal dimensions
