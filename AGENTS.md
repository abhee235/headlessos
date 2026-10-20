# AI Coding Assistant Rules for HeadlessOS

> **This is the master ruleset** for any AI coding assistant (GitHub Copilot, Cursor, Claude, ChatGPT, etc.) working on this project. It is designed to be **self-contained** — an agent reading only this file should be able to follow every convention, pattern, and workflow used in the project.

---

## 1. Before You Start

1. **Read** [docs/CONTEXT.md](docs/CONTEXT.md) — 2-minute project briefing
2. **Check** [docs/PROGRESS.md](docs/PROGRESS.md) — see what's done, find the current Task ID
3. **Read** the relevant phase doc: `docs/phases/phase-{n}.md` — get the detailed spec for your task
4. **Check** [docs/TRACEABILITY.md](docs/TRACEABILITY.md) — see what files already exist for this area
5. **Reference** any other docs in the Documentation Map (§14) as needed

---

## 2. Document-Driven Development (MANDATORY)

This project follows **strict DDD**. Code is NEVER written before documentation is verified and updated.

### The DDD Loop (every task, no exceptions)

```
1. READ docs first     →  Understand what exists (CONTEXT.md, PROGRESS.md, phase doc)
2. UPDATE docs         →  Plan the change in docs BEFORE coding
3. WRITE code          →  Implement exactly what the docs describe
4. VERIFY alignment    →  Code matches docs; tests pass
5. UPDATE tracking     →  PROGRESS.md ✅ + TRACEABILITY.md + changelog
```

### Before Writing ANY Code — Checklist

- [ ] Read `docs/CONTEXT.md` — do you understand the project?
- [ ] Read `docs/PROGRESS.md` — what is the current **Task ID** (e.g., `M1.4`)?
- [ ] Read the relevant `docs/phases/phase-{n}.md` — do you have the **detailed spec**?
- [ ] Check `docs/TRACEABILITY.md` — what files already exist for this area?
- [ ] Does the phase doc describe what you need to build?
  - **YES** → implement it.
  - **NO** → update the phase doc FIRST, then implement.
- [ ] Is this a new architectural decision? → Add an ADR to `docs/DECISIONS.md` BEFORE coding.

### After Completing a Task — Checklist

- [ ] **Run existing tests**: `npm test` from repo root — ALL tests must pass before commit
- [ ] **Write tests for new code**: Every new feature, fix, or component MUST have tests (see §12)
- [ ] Update `docs/PROGRESS.md` — mark the task ✅, add changelog entry
- [ ] Update `docs/TRACEABILITY.md` — record files created/modified, commits, verification results
- [ ] Git commit with Task ID: `feat(M1.4): implement command orchestrator`
- [ ] Add header comment to primary files: `// M1.4: Command Orchestrator`
- [ ] If you deviated from the spec → update the phase doc to match reality
- [ ] If you discovered a new task → add it to PROGRESS.md and the phase doc

### DDD Anti-Patterns (NEVER do these)

1. **NEVER** write code without checking docs first
2. **NEVER** add a feature that isn't documented in a phase doc
3. **NEVER** change architecture without adding an ADR to DECISIONS.md
4. **NEVER** skip updating PROGRESS.md and TRACEABILITY.md after completing a task
5. **NEVER** assume — if docs don't specify something, document it first
6. **NEVER** skip writing tests — every new feature or bug fix MUST include tests
7. **NEVER** commit code that breaks existing tests — run `npm test` before every commit

---

## 3. Task ID System

Every task has a unique ID: **`M{milestone}.{task}`** (e.g., `M1.4`)

Used consistently across the entire project:

| Where | Format | Example |
|-------|--------|---------|
| Phase docs | Section header | `### M1.4: Command Orchestrator` |
| PROGRESS.md | Status row | `| M1.4 | Command Orchestrator | ⬜ |` |
| TRACEABILITY.md | Completed task entry | `## M1.4: Command Orchestrator` |
| Git commits | Prefix | `feat(M1.4): implement command orchestrator` |
| Code comments | File header | `// M1.4: Command Orchestrator` |
| Code comments | `@see` link | `// @see docs/phases/phase-1.md` |

### Git Commit Convention

Format: `{type}({TaskID}): {description}`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Examples:
```
feat(M1.4): implement command orchestrator
fix(M1.2): handle SSH connection timeout
docs(M0): initial documentation and project setup
test(M1.3): add parsing pipeline unit tests
refactor(M2.1): extract dashboard metrics into separate service
chore(M0.1): configure monorepo workspace
```

---

## 4. Architecture

A **localhost web application** that connects to Linux VPS servers via SSH, runs commands, parses terminal output using LLMs, and renders visual UI. **Nothing is installed on the server.** Zero server footprint.

```
Browser (React 19, localhost:3000)
    ↕ HTTP REST + WebSocket
Fastify Backend (Node.js, localhost:3001)
    ↕ SSH (ssh2 library, multiple channels per connection)
Remote VPS (unchanged, standard sshd)
```

Backend pipeline:
```
Command Orchestrator → SSH exec → ANSI strip → deterministic parser / LLM → Zod validate → typed JSON
```

### Key Architectural Patterns

1. **Service Container** — all backend modules are services in `ServiceContainer` (ADR-011)
2. **Command Orchestrator** — multi-command parallel exec, retry with error context, fallback chains (ADR-013)
3. **Parsing Pipeline** — ANSI strip → deterministic parser → LLM fallback → Zod validate (ADR-002)
4. **Plugin-Ready App Registry** — each app (Dashboard, Files, Docker) is a self-contained module (ADR-012)

---

## 5. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Fastify 5 + TypeScript (strict mode) |
| SSH | `ssh2` directly (NOT node-ssh or wrappers) |
| LLM | OpenAI SDK with `zodResponseFormat()`, provider-agnostic `LLMProvider` interface |
| Frontend | React 19 + Vite + TailwindCSS 4 + Zustand |
| Terminal | xterm.js via WebSocket |
| Schema | Zod (types + runtime validation + LLM JSON schema generation) |
| Testing | Vitest |

---

## 6. Code Style

- **TypeScript strict mode** everywhere — no `any` types unless absolutely unavoidable
- **Async/await** over callbacks or raw promises
- **Zod schemas** for all data structures that cross boundaries (API responses, parsed data, LLM output)
- **Fastify** for backend (not Express) — use `fastify.register()`, `fastify.get()`, decorators, schemas
- **Functional React components** with hooks — no class components
- **TailwindCSS** for all styling — no CSS files, no CSS-in-JS, no inline styles
- **Zustand** for state management — no Redux, no Context for global state

---

## 7. Backend Patterns

### Service Container (MANDATORY — ADR-011)

Every backend module MUST extend `BaseService` and register in `ServiceContainer`:

```typescript
import { BaseService } from '../services/base-service';

export class MyService extends BaseService {
  protected async _construct(): Promise<void> {
    // Set up data structures. No cross-service deps here.
  }

  protected async _init(): Promise<void> {
    // Wire to other services. this.services.get('name') works here.
  }

  protected async _destroy(): Promise<void> {
    // Cleanup: close connections, clear intervals.
  }
}
```

Register in boot sequence:
```typescript
container.register('my-service', new MyService('my-service'));
```

### SSH Rules

- Use `ssh2` directly — NOT node-ssh or any wrappers
- **`exec()`** — one-shot data collection channels (parallel OK, ephemeral)
- **`shell()`** — interactive terminal only (persistent, one per connection)
- **`sftp()`** — file operations only (lazy-initialized, reused)
- Always set **timeouts** on exec channels
- Always **close channels** when done — leaked channels = leaked resources
- NEVER reuse channels across requests
- NEVER run `exec('cat ...')` or `exec('rm ...')` for file operations — use SFTP

### Parsing Pipeline

All command output goes through `ParsingPipeline.parse()`:

```
1. Strip ANSI codes     → via `strip-ansi` (NEVER send ANSI to LLM)
2. Try deterministic parser → regex-based, <1ms, free (preferred)
3. Fall back to LLM     → 1-3s, costs money (only if no deterministic parser exists)
4. Validate with Zod    → Schema.parse(result) — throws on invalid data
```

- Check `server/src/parsers/deterministic/` for existing parsers before writing LLM prompts
- Progressive migration: start with LLM, replace with deterministic parsers over time (ADR-002)

### Command Orchestrator (ADR-013)

Multi-command views use `CommandOrchestrator.execute()`:

```typescript
const plan: ExecutionPlan = {
  steps: [
    { command: 'df -h', parser: 'disk-usage', schema: DiskUsageSchema },
    { command: 'free -m', parser: 'memory', schema: MemorySchema },
  ],
  parallel: true,               // Steps run in parallel unless dependsOn is set
  retryPolicy: {
    maxRetries: 2,
    retryWithContext: true,      // On Zod failure → retry LLM with error context
  },
};
```

- Steps run in parallel unless `dependsOn` is specified
- On parse failure → retry with Zod error context (e.g., "expected number, got string")
- On command failure → try `fallbackCommands` (e.g., `ip addr` → `ifconfig`)
- Future: ReAct Agent mode for complex multi-step tasks (ADR-014, backlog)

### Output Cache (ADR — M4.7)

Hash-based caching layer that prevents redundant parsing when terminal output hasn't changed between polls.

```typescript
import { OutputCache } from '../cache/output-cache.js';

// Cache is integrated into ParsingPipeline automatically.
// Pipeline checks cache before parsing, stores result after parsing.
// Dashboard auto-refresh (30s) benefits most — same output = cache hit.

// Manual invalidation on disconnect:
outputCache.invalidateServer(serverId);

// Stats available via GET /api/stats/llm:
const stats = outputCache.getStats();
// { totalEntries, hits, misses, hitRate, memoryBytes }
```

- Cache key: `hash(serverId + command + rawOutput)`
- Default TTL: 60 seconds (configurable per command)
- Invalidated on server disconnect or when raw output changes
- Stats exposed through LLM Usage Stats endpoint (M4.8)

### LLM Usage Tracking (M4.8)

All LLM calls are tracked for cost monitoring and optimization:

```typescript
// Automatically recorded by ParsingPipeline after every LLM call.
// GET /api/stats/llm returns:
{
  totalCalls: number,
  totalInputTokens: number,
  totalOutputTokens: number,
  estimatedCostUsd: number,
  averageLatencyMs: number,
  callsByModel: Record<string, number>,
  callsByCommand: Record<string, number>,
  cache: CacheStats
}
```

- Track tokens, cost, latency per LLM call
- Per-model pricing for cost estimates
- Cache hit rate shows optimization effectiveness

---

## 8. Frontend Patterns

### Component State Pattern (MANDATORY)

Every view component MUST handle all 3 states:

```typescript
export function SomeView() {
  const { serverId } = useActiveServer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { /* fetch from backend */ }, [serverId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={...} />;
  if (!data) return <EmptyState message="..." />;

  return <Table columns={columns} data={data} />;
}
```

### State Management (Zustand)

```typescript
// client/src/store/app-store.ts
interface AppState {
  servers: ServerConfig[];
  activeServerId: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  terminalVisible: boolean;
  // ... actions
}
```

### Single-Instance Tabs

Some tabs (Terminal, Dashboard) only allow one instance per server:

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

### UI Rules

- Reusable primitives → `client/src/components/ui/`
- App-specific components → `client/src/components/{AppName}/`
- Lucide React for icons
- Dark theme via TailwindCSS dark mode
- Context menus for all data views (files, containers, processes)

---

## 9. Schema Patterns (Zod)

### Zod is the Single Source of Truth

- Every data structure crossing a boundary MUST have a Zod schema
- TypeScript types are **derived** from schemas: `type X = z.infer<typeof XSchema>`
- **NEVER** define a separate TypeScript interface and a separate Zod schema — derive one from the other

```typescript
import { z } from 'zod';

export const ContainerSchema = z.object({
  id: z.string().regex(/^[a-f0-9]+$/),
  name: z.string(),
  image: z.string(),
  status: z.enum(['running', 'stopped', 'paused', 'restarting']),
  ports: z.array(z.object({
    host: z.number().int().positive(),
    container: z.number().int().positive(),
    protocol: z.enum(['tcp', 'udp']),
  })),
  created: z.string().datetime(),
});

export type Container = z.infer<typeof ContainerSchema>;
```

### Dual Purpose: Validation + LLM

Schemas serve two roles:
1. **Runtime validation**: `Schema.parse(data)` throws on invalid data
2. **LLM structured output**: `zodResponseFormat(Schema, 'name')` for OpenAI

Design for both:
- Use clear field names (LLM needs to understand the schema)
- Add `.describe()` to ambiguous fields for LLM context
- Keep schemas flat when possible — deeply nested schemas confuse LLMs
- Prefer `z.enum()` over `z.string()` for known value sets
- Use `z.coerce.number()` when parsing string numbers from terminal output
- NEVER use `z.any()` — always be specific
- Export both the schema AND the inferred type

---

## 10. Security (CRITICAL)

Read [docs/SECURITY.md](docs/SECURITY.md) before writing any code that executes commands.

### Command Execution

- **NEVER** interpolate user input into shell commands: `` exec(`ls ${userPath}`) `` ← FORBIDDEN
- Use parameterized commands or builder functions with validation:

```typescript
// GOOD: Validated and constructed safely
function buildLsCommand(validatedPath: string): string {
  return `ls -la ${shellEscape(validatedPath)}`;
}

// BAD: Direct interpolation — NEVER DO THIS
function buildLsCommand(path: string): string {
  return `ls -la ${path}`;
}
```

### Required Validation Functions

These MUST exist and be used everywhere user input touches commands:

```typescript
validatePath(path: string): boolean        // No traversal (../), must be absolute
validateContainerId(id: string): boolean   // Hex characters only (/^[a-f0-9]+$/)
validatePid(pid: string): boolean          // Integer only (/^\d+$/)
validateServiceName(name: string): boolean // Alphanumeric + hyphen + underscore only
shellEscape(str: string): string           // Safe shell escaping
```

### File Operations

- ALL file read/write/delete/rename → **SFTP API** (never shell commands)
- Directory listing → SFTP `readdir()` (or `ls -la` through parse pipeline)
- File upload/download → SFTP streams
- NEVER `exec('cat ...')` or `exec('rm ...')` for file operations

### Frontend Security

- **NEVER** use `dangerouslySetInnerHTML` with terminal output
- Terminal output goes through xterm.js only (handles ANSI safely)
- All data comes from the backend — frontend never calls remote servers directly

### SSH Channel Safety

- `exec()` channels for one-shot data (parallel OK)
- `shell()` channel for interactive terminal only (one per session)
- Never reuse channels across requests
- Always set timeouts on exec channels
- Close channels when done — leaked channels = leaked resources

### Command Orchestrator Safety

- ExecutionPlan commands must come from registered command builders
- Retry logic must have max retry limits (default: 2)
- Fallback chains must terminate — no circular fallbacks
- LLM-suggested commands (future ReAct agent) must go through allowlist validation

### API Route Security

- Validate ALL request parameters with Zod schemas
- Use Fastify schema validation (built-in)
- Rate limit SSH-heavy endpoints
- Never expose raw SSH errors to the client — sanitize error messages

---

## 11. LLM Integration

- All LLM calls go through `server/src/llm/provider.ts` — the `LLMProvider` interface
- Use `zodResponseFormat()` for OpenAI Structured Outputs
- Include the system prompt from [docs/LLM_STRATEGY.md](docs/LLM_STRATEGY.md)
- Always validate LLM responses with Zod `.parse()`
- Prefer deterministic parsers when available — check `server/src/parsers/deterministic/`
- NEVER send ANSI codes to the LLM — strip ANSI first via `strip-ansi`
- NEVER hardcode the LLM provider — use the `LLMProvider` interface (supports OpenAI, Anthropic, Ollama)

---

## 12. Testing

### MANDATORY — Write Tests With Every Change

**This is non-negotiable.** Every new feature, bug fix, or refactor MUST include corresponding tests. No exceptions.

### Test-Writing Workflow (every task)

```
1. BEFORE coding   →  Run `npm test` to confirm all existing tests pass
2. WRITE code      →  Implement the feature or fix
3. WRITE tests     →  Add unit/component tests covering the new code
4. RUN all tests   →  `npm test` — every single test must pass
5. COMMIT          →  Only commit when all tests are green
```

### What Must Be Tested

| Change Type | Required Tests |
|------------|---------------|
| New API function | Unit test for request params, response, and error handling |
| New React component | Rendering test + interaction tests (click, input, etc.) |
| New backend service | Unit test for core logic with mocked dependencies |
| Bug fix | Regression test proving the bug is fixed |
| New parser | Parser test with fixture files + Zod validation |
| Security validator | Injection attack tests + edge cases |
| Refactor | Existing tests must still pass (no new tests required if behavior unchanged) |

### Where Tests Live

| Workspace | Test directory | Config |
|-----------|---------------|--------|
| Server | `server/tests/` | `server/vitest.config.ts` |
| Client | `client/tests/` | `client/vitest.config.ts` |

Mirror the source structure in tests:
- `client/src/lib/api.ts` → `client/tests/lib/api.test.ts`
- `client/src/components/Desktop/Desktop.tsx` → `client/tests/components/Desktop.test.tsx`
- `server/src/security/validators.ts` → `server/tests/security/validators.test.ts`

### Running Tests

```bash
npm test              # Run ALL tests (server + client)
npm run test:server   # Server tests only
npm run test:client   # Client tests only

# In workspace directories:
cd client && npx vitest run              # Client tests
cd client && npx vitest                  # Client tests in watch mode
cd server && npx vitest run              # Server tests
cd server && npx vitest run tests/security/  # Specific test directory
```

### Framework
- **Vitest** for all tests — no Jest, no Mocha
- `describe/it/expect` pattern
- Async tests with `async/await`
- **@testing-library/react** + **jsdom** for React component tests
- **@testing-library/user-event** for user interaction simulation

### Test Priorities (in order)
1. **Parsers** — deterministic AND LLM-backed parsers
2. **Security validators** — path traversal, command injection, ID validation
3. **Zod schemas** — ensure schemas reject bad data
4. **Command Orchestrator** — execution plans, retry logic, fallback chains
5. **API routes** — integration tests with mocked SSH

### Parser Test Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { readFixture } from '../helpers/read-fixture';
import { parseDiskUsage } from '../../src/parsers/deterministic/disk-usage';
import { DiskUsageSchema } from '../../src/parsers/schemas/system';

describe('parseDiskUsage', () => {
  it('parses df -h output correctly', () => {
    const raw = readFixture('df-h-output.txt');
    const result = parseDiskUsage(raw);
    const validated = DiskUsageSchema.parse(result);
    expect(validated.filesystems).toHaveLength(3);
    expect(validated.filesystems[0].mountpoint).toBe('/');
  });

  it('handles unusual filesystem names', () => {
    const raw = readFixture('df-h-unusual.txt');
    const result = parseDiskUsage(raw);
    DiskUsageSchema.parse(result); // Should not throw
  });

  it('rejects empty input', () => {
    expect(() => parseDiskUsage('')).toThrow();
  });
});
```

### Security Validator Test Pattern

```typescript
describe('validatePath', () => {
  it('rejects path traversal', () => {
    expect(validatePath('../../etc/passwd')).toBe(false);
    expect(validatePath('/home/../../../etc/shadow')).toBe(false);
  });
});
```

### Testing Rules

- Every parser MUST have tests before being marked complete
- Every security validator MUST have tests covering injection attacks
- Tests MUST use Zod `.parse()` to validate output
- NEVER mock Zod schemas — use real schemas
- Mock SSH and LLM calls, not parsing logic
- Store real terminal output samples in `server/tests/fixtures/terminal-outputs/`
- Use `readFixture(filename)` helper to load fixtures
- Include edge cases: empty output, error output, unusual formats, different Linux distros
- See [docs/TESTING.md](docs/TESTING.md) for full strategy

---

## 13. Common Mistakes to Avoid

1. **Don't install anything on the server.** This is a client-only app. The server runs standard SSH.
2. **Don't use Express patterns.** This is Fastify — use `fastify.register()`, `fastify.get()`, etc.
3. **Don't bypass the parsing pipeline.** All command output goes through `ParsingPipeline.parse()`.
4. **Don't hardcode LLM provider.** Use the `LLMProvider` interface.
5. **Don't use node-ssh or other ssh2 wrappers.** We use ssh2 directly for channel control.
6. **Don't create a single SSH channel for everything.** Use `exec()` channels for data collection (parallel) and `shell()` for interactive terminal.
7. **Don't send ANSI codes to the LLM.** Always strip ANSI first via `strip-ansi`.
8. **Don't poll from the frontend.** Backend handles polling intervals and caching.
9. **Don't define separate TypeScript interfaces and Zod schemas.** Derive types from schemas.
10. **Don't skip TRACEABILITY.md updates.** Every completed task must be recorded.

---

## 14. Documentation Map

| Doc | Purpose |
|-----|---------|
| `docs/CONTEXT.md` | 2-min AI briefing |
| `docs/ARCHITECTURE.md` | System design, data flow, patterns |
| `docs/IMPLEMENTATION_INDEX.md` | Phase overview + task ID system |
| `docs/phases/phase-{0-8,ex1-ex6}.md` | Detailed per-phase task specs |
| `docs/TRACEABILITY.md` | Task → files → commits audit trail |
| `docs/PROGRESS.md` | Live task tracker (update after every task!) |
| `docs/DECISIONS.md` | Architecture Decision Records (ADR-001 to ADR-014) |
| `docs/API_SPEC.md` | REST + WebSocket API reference |
| `docs/LLM_STRATEGY.md` | LLM integration, parsing, cost optimization |
| `docs/SECURITY.md` | Threat model, validation rules |
| `docs/TESTING.md` | Test strategy, fixtures |
| `docs/APP_REGISTRY.md` | App abstraction schema |
| `docs/UI_DESIGN.md` | UI design system, AppWindow patterns, icon/color/spacing conventions |

### Documentation Cross-Reference Map

When you change one doc, check if these related docs also need updates:

| If you change... | Also check... |
|-----------------|---------------|
| `ARCHITECTURE.md` | `CONTEXT.md` (design rules), relevant phase doc, `DECISIONS.md` (ADRs) |
| `phases/phase-{n}.md` | `PROGRESS.md` (task list matches), `TRACEABILITY.md` (file mappings) |
| `API_SPEC.md` | Relevant phase doc (route tasks), `ARCHITECTURE.md` (protocol) |
| `SECURITY.md` | `AGENTS.md` (security section), relevant phase doc |
| `LLM_STRATEGY.md` | `ARCHITECTURE.md` (parsing pipeline), relevant phase doc |
| `DECISIONS.md` | `CONTEXT.md` (design rules), relevant technical doc |
| `PROGRESS.md` | `TRACEABILITY.md` (if marking task complete) |
| `TRACEABILITY.md` | No cascading updates — this is the audit trail |

---

## 15. IDE-Specific Configuration

Both Cursor and GitHub Copilot are configured with equivalent scoped rules. The content is mirrored to ensure the same DDD workflow and coding standards regardless of which IDE/agent is used.

### GitHub Copilot

Copilot reads instructions from three sources:

1. **`AGENTS.md`** (this file) — Automatically read by Copilot coding agent for all tasks
2. **`.github/copilot-instructions.md`** — Custom instructions loaded into every Copilot Chat session
3. **`.github/copilot/*.md`** — Scoped instruction files that activate based on `applyTo` file patterns:

| File | Scope (`applyTo`) | Purpose |
|------|-------------------|---------|
| `backend.md` | `server/src/**/*.ts` | ServiceContainer, SSH, parsing pipeline, orchestrator, security |
| `frontend.md` | `client/src/**/*.{ts,tsx}` | React 19, TailwindCSS, Zustand, component patterns |
| `schemas.md` | `**/schemas/**/*.ts`, `shared/**/*.ts` | Zod schema patterns, dual-purpose (validation + LLM) |
| `testing.md` | `**/*.test.ts` | Vitest, fixture-driven testing, priorities |
| `documentation.md` | `docs/**/*.md` | Doc editing rules, cross-reference map, PROGRESS.md updates |
| `security.md` | Routes, SSH, orchestrator | Command safety, validation functions, SFTP enforcement |

VS Code setting required (already in `.vscode/settings.json`):
```json
{ "github.copilot.chat.codeGeneration.useInstructionFiles": true }
```

### Cursor IDE

Project rules live in `.cursor/rules/*.mdc` (MDC = markdown with frontmatter).
These rules auto-activate based on file globs or `alwaysApply: true`:

| Rule file | Scope | Purpose |
|-----------|-------|---------|
| `000-ddd-workflow.mdc` | Always | Enforces DDD workflow: read docs → update docs → write code → verify → update progress |
| `001-project-context.mdc` | Always | Architecture summary, tech stack, key patterns, doc map |
| `100-backend.mdc` | `server/src/**/*.ts` | Backend patterns: ServiceContainer, SSH, parsing pipeline, orchestrator |
| `101-frontend.mdc` | `client/src/**/*.{ts,tsx}` | React 19, TailwindCSS, Zustand, component patterns |
| `102-schemas.mdc` | `**/schemas/**/*.ts`, `shared/**/*.ts` | Zod schema patterns, dual-purpose (validation + LLM) |
| `300-testing.mdc` | `**/*.test.ts` | Vitest, fixture-driven testing, priorities |
| `400-documentation.mdc` | `docs/**/*.md` | Doc editing rules, cross-reference map, PROGRESS.md updates |
| `500-security.mdc` | Routes, SSH, orchestrator | Command safety, validation functions, SFTP enforcement |

### Keeping Rules in Sync

When updating AI rules, update BOTH locations:
- Cursor: `.cursor/rules/*.mdc`
- Copilot: `.github/copilot/*.md` + `.github/copilot-instructions.md`

### Other AI Assistants

Point the assistant to `docs/CONTEXT.md` for a 2-minute project briefing, then reference this file (`AGENTS.md`) for the full ruleset.

---

## 16. Chrome DevTools MCP (Frontend Inspection)

The project is configured with [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp) so AI agents can **see and interact with the running frontend** at `http://localhost:3000`.

### Setup

MCP server configured in `.vscode/mcp.json`:
```json
{
  "servers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### How to Use

1. **Start the app**: `npm run dev` (server :3001 + client :3000)
2. **Launch Chrome with remote debugging**:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 \
     --user-data-dir=/tmp/chrome-devtools-mcp \
     http://localhost:3000
   ```
3. The MCP tools then allow you to:
   - Take screenshots of the running app
   - Read DOM content and page text
   - Execute JavaScript in the browser console
   - Inspect network requests
   - Check for console errors

### Manual Inspection Script

A standalone inspection script is also available at `dev/inspect-frontend.py`:
```bash
python3 dev/inspect-frontend.py
```
This captures the page title, text content, HTML structure, and saves a screenshot to `dev/screenshot.png`.

### When to Use

- **After creating/modifying frontend components** — verify the UI renders correctly
- **Debugging layout issues** — inspect the actual DOM and Tailwind classes
- **Validating API integration** — check that data from the backend appears in the UI
- **Before marking a frontend task complete** — take a screenshot for verification

---

## 17. Local Dev SSH Server

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
cd dev && docker compose up -d        # Start SSH server
cd dev && docker compose down          # Stop SSH server
cd dev && docker compose up -d --build # Rebuild after Dockerfile changes
```

> **Note**: Options A and B both use port 2222. Stop one before starting the other.

### Connection Details (same for both)

| Field | Value |
|-------|-------|
| Host | `127.0.0.1` |
| Port | `2222` |
| Username | `testuser` |
| Password | `testpass` |
| Root password | `rootpass` |
| Auth method | `password` |

### Pre-installed Tools

git, python3, nginx, curl, wget, htop, vim, tree, net-tools, iproute2, procps, docker

### Adding to HeadlessOS

```bash
curl -X POST http://localhost:3001/api/servers \
  -H 'Content-Type: application/json' \
  -d '{"name":"Local Ubuntu Dev","host":"127.0.0.1","port":2222,"username":"testuser","authMethod":"password","password":"testpass"}'
```

Files: `dev/headlessos-dev.yaml` (Lima VM), `dev/vm.sh` (VM script), `dev/docker-compose.yml` (Docker option), `dev/ssh-server/Dockerfile`

---

## 18. File Location Guide

| I need to... | Look in... |
|-------------|-----------|
| Add an API endpoint | `server/src/routes/` |
| Add a Zod schema | `server/src/parsers/schemas/` |
| Add a deterministic parser | `server/src/parsers/deterministic/` |
| Modify SSH connection logic | `server/src/ssh/connection-manager.ts` |
| Add/modify LLM provider | `server/src/llm/providers/` |
| Add a UI component | `client/src/components/` |
| Add a reusable UI primitive | `client/src/components/ui/` |
| Modify app state | `client/src/store/` |
| Add shared types | `shared/types.ts` |
| Add test fixtures | `server/tests/fixtures/terminal-outputs/` |
| Check project status | `docs/PROGRESS.md` |
| Get detailed task spec | `docs/phases/phase-{n}.md` |
| Track what files a task created | `docs/TRACEABILITY.md` |
| Cursor IDE rules | `.cursor/rules/` |
| Copilot IDE rules | `.github/copilot/` |
| Reusable prompts | `.github/prompts/` |

### Reusable Prompt Files (`.github/prompts/`)

Invoke these from Copilot Chat with `/new-feature`, `/new-parser`, etc.:

| Prompt | Use case |
|--------|----------|
| `new-feature.prompt.md` | Full DDD workflow for any new feature |
| `new-parser.prompt.md` | Create a deterministic parser for a Linux command |
| `new-api-route.prompt.md` | Add a Fastify API endpoint |
| `new-component.prompt.md` | Create a React component following project patterns |
| `new-schema.prompt.md` | Create a Zod schema (dual-purpose: validation + LLM) |
| `fix-bug.prompt.md` | Diagnose and fix a bug with regression tests |
| `review-code.prompt.md` | Security-focused code review against threat model |

### Git Hooks (`.githooks/`)

The project uses a custom hooks directory (configured via `git config core.hooksPath .githooks`):

| Hook | Purpose |
|------|---------|
| `commit-msg` | Enforces `{type}({TaskID}): {description}` format on all commits |

New clones must run `git config core.hooksPath .githooks` to activate hooks.

---

## 19. shadcn/ui Component Library

All UI primitives live in `client/src/components/ui/`. They use the CSS variable design token system defined in `client/src/styles.css` (e.g., `rgb(var(--primary))`, `rgb(var(--border))`). Colors adapt automatically to light/dark theme via `:root` / `.dark` class.

**Utility**: `client/src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge).

### When to Use What

- **Need a button?** → `Button` (with variants: default, destructive, outline, secondary, ghost, link)
- **Need a right-click menu?** → `ContextMenu`
- **Need a click-triggered menu?** → `DropdownMenu`
- **Need a modal dialog?** → **`AppWindow`** (standard overlay window with title bar, optional sidebar/toolbar/footer — see `docs/UI_DESIGN.md`). Use `Dialog` only for raw custom overlays.
- **Need a quick confirmation?** → `ConfirmDialog` (custom wrapper with destructive support)
- **Need a side panel/drawer?** → `Sheet` (sliding from any edge) or `Drawer` (bottom sheet mobile-style)
- **Need a toast notification?** → `Toaster` from `sonner.tsx` + `toast()` from `sonner`
- **Need a command palette?** → `Command` (cmdk-powered, searchable list)
- **Need tabs?** → `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`
- **Need a form?** → `Form` (react-hook-form + Zod integration) with `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `RadioGroup`
- **Need a data table?** → `Table` (styled HTML table) — for advanced features, compose with sorting/filtering
- **Need charts?** → `ChartContainer` + recharts components (BarChart, LineChart, etc.) with theme-aware tooltips
- **Need resizable panels?** → `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle`
- **Need a date picker?** → `Calendar` (react-day-picker v9) inside a `Popover`
- **Need a file icon?** → `FileIcon` (custom SVG component with 12 color categories, 100+ extension mappings)
- **Need loading state?** → `Skeleton` (pulse animation placeholder)
- **Need a progress bar?** → `Progress`
- **Component doesn't exist below?** → Create a custom one in `client/src/components/ui/` following the same patterns

### Complete Component Inventory

All files are in `client/src/components/ui/`. Import pattern: `import { ComponentName } from "@/components/ui/filename"`.

#### Layout & Structure
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| Card | `card.tsx` | HTML div | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| Separator | `separator.tsx` | Radix | `Separator` (horizontal/vertical) |
| Aspect Ratio | `aspect-ratio.tsx` | Radix | `AspectRatio` |
| Scroll Area | `scroll-area.tsx` | Radix | `ScrollArea`, `ScrollBar` |
| Resizable | `resizable.tsx` | react-resizable-panels | `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` |
| Collapsible | `collapsible.tsx` | Radix | `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` |
| Sidebar | `sidebar.tsx` | Radix + custom | `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarRail`, `SidebarInset`, etc. |

#### Navigation & Menus
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| Context Menu | `context-menu.tsx` | Radix | `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSub`, `ContextMenuCheckboxItem`, `ContextMenuRadioItem`, `ContextMenuShortcut` |
| Dropdown Menu | `dropdown-menu.tsx` | Radix | `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSub`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuShortcut` |
| Menubar | `menubar.tsx` | Radix | `Menubar`, `MenubarMenu`, `MenubarTrigger`, `MenubarContent`, `MenubarItem`, `MenubarSub`, `MenubarCheckboxItem`, `MenubarRadioItem` |
| Navigation Menu | `navigation-menu.tsx` | Radix | `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, `NavigationMenuLink` |
| Breadcrumb | `breadcrumb.tsx` | HTML + Slot | `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis` |
| Tabs | `tabs.tsx` | Radix | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| Pagination | `pagination.tsx` | HTML + Button | `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis` |
| Command | `command.tsx` | cmdk | `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator` |

#### Feedback & Overlay
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| Dialog | `dialog.tsx` | Radix | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose` |
| Alert Dialog | `alert-dialog.tsx` | Radix | `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` |
| Confirm Dialog | `confirm-dialog.tsx` | Custom (Dialog + Button) | `ConfirmDialog` (supports destructive variant with AlertTriangle icon) |
| Sheet | `sheet.tsx` | Radix Dialog | `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose` — side: top/bottom/left/right |
| Drawer | `drawer.tsx` | vaul | `Drawer`, `DrawerTrigger`, `DrawerContent`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, `DrawerClose` |
| Tooltip | `tooltip.tsx` | Radix | `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` |
| Hover Card | `hover-card.tsx` | Radix | `HoverCard`, `HoverCardTrigger`, `HoverCardContent` |
| Popover | `popover.tsx` | Radix | `Popover`, `PopoverTrigger`, `PopoverContent` |
| Sonner (Toast) | `sonner.tsx` | sonner | `Toaster` — configured for dark theme & taskbar offset |
| Alert | `alert.tsx` | HTML div + CVA | `Alert`, `AlertTitle`, `AlertDescription` — variants: default, destructive |
| Progress | `progress.tsx` | Radix | `Progress` |
| Skeleton | `skeleton.tsx` | HTML div | `Skeleton` (animate-pulse loading placeholder) |

#### Form Controls
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| Button | `button.tsx` | HTML button + CVA | `Button`, `buttonVariants` — variants: default, destructive, outline, secondary, ghost, link — sizes: default, sm, lg, icon |
| Input | `input.tsx` | HTML input | `Input` |
| Textarea | `textarea.tsx` | HTML textarea | `Textarea` |
| Select | `select.tsx` | Radix | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` |
| Checkbox | `checkbox.tsx` | Radix | `Checkbox` (with Check icon indicator) |
| Radio Group | `radio-group.tsx` | Radix | `RadioGroup`, `RadioGroupItem` (with Circle indicator) |
| Switch | `switch.tsx` | Radix | `Switch` |
| Slider | `slider.tsx` | Radix | `Slider` (with Track, Range, Thumb) |
| Label | `label.tsx` | Radix + CVA | `Label` |
| Toggle | `toggle.tsx` | Radix + CVA | `Toggle`, `toggleVariants` — variants: default, outline — sizes: default, sm, lg |
| Toggle Group | `toggle-group.tsx` | Radix | `ToggleGroup`, `ToggleGroupItem` |
| Input OTP | `input-otp.tsx` | input-otp | `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator` |
| Calendar | `calendar.tsx` | react-day-picker v9 | `Calendar` — use inside Popover for date picker |
| Form | `form.tsx` | react-hook-form | `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField` |

#### Data Display
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| Table | `table.tsx` | HTML table | `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| Badge | `badge.tsx` | HTML div + CVA | `Badge`, `badgeVariants` — variants: default, secondary, destructive, outline, success, warning |
| Avatar | `avatar.tsx` | Radix | `Avatar`, `AvatarImage`, `AvatarFallback` |
| Accordion | `accordion.tsx` | Radix | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| Carousel | `carousel.tsx` | embla-carousel-react | `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` |
| Chart | `chart.tsx` | recharts | `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `useChart` |

#### Utility
| Component | File | Base | Key Exports |
|-----------|------|------|-------------|
| AppWindow | `app-window.tsx` | Radix Dialog + compound | `AppWindow`, `AppWindow.Sidebar`, `AppWindow.SidebarGroup`, `AppWindow.SidebarItem`, `AppWindow.Toolbar`, `AppWindow.Body`, `AppWindow.Footer` — **standard for all overlay dialogs** |
| FileIcon | `FileIcon.tsx` | Custom SVG | `FileIcon`, `DashboardIcon`, `FileExplorerIcon`, `TerminalIcon`, `ThisPCIcon`, `FolderSVG`, `SymlinkSVG`, `FileSVG`, `getFileCategory`, `FILE_COLORS` |
| Visually Hidden | `visually-hidden.tsx` | Radix | `VisuallyHidden` (accessibility: hidden but screen-reader visible) |

### CSS Variable Design Tokens

Defined in `client/src/styles.css` (LumenOS v3 glass design, EX8). All components reference these — NEVER hardcode colors. Full reference: `docs/UI_DESIGN.md` §6.

```
--lumen-*                         Raw glass layer: label/label2/label3, fill/fill2, chip,
                                  mat-thin/mat/mat-thick, field, paper, edge/edge2,
                                  accent/accent-hi/accent-text/accent-soft/accent-glow, lit, danger
--background / --foreground       Main app background and text (foreground = lumen label)
--card / --popover / --chrome     Surfaces (mapped onto the glass layer)
--primary / --primary-foreground  Accent (follows data-accent on <html>)
--accent / --accent-foreground    Accent-soft tint + accent text (hover/selected)
--muted-foreground                Secondary text
--destructive / --success / --warning   Semantic states
--border / --input / --ring       Hairlines, field background, focus glow
--radius                          14px (sm 10 · md 14 · lg 18 · xl 22 · 2xl 24 · 3xl 30)
```

Surface classes: `.glass`, `.glass-subtle`, `.glass-heavy`, `.lumen-card`, `.lumen-section`, `.lumen-well`, `.lumen-lit`, `.lumen-plate`. Accent / glass / transparency presets are `<html>` attributes set by `useLumenAppearance`.

### Adding a New Component

1. Create file in `client/src/components/ui/{name}.tsx`
2. Use `cn()` from `@/lib/utils` for className merging
3. Use CSS variables: `text-[rgb(var(--foreground))]`, `bg-[rgb(var(--background))]`, etc.
4. Export all sub-components with display names
5. Add entry to the inventory table above
