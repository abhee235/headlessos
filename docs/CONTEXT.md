# AI Assistant Context Briefing

> **Read this first.** This is the quick-start context document for any AI coding assistant (GitHub Copilot, Cursor, Claude, ChatGPT) working on HeadlessOS. It gives you everything you need to start contributing without reading all documentation.

## What Is HeadlessOS?

A **localhost web application** that connects to Linux VPS servers via SSH, runs commands, parses terminal output using LLMs, and renders the results as a visual UI (file explorer, Docker dashboard, process manager, etc.).

**Key fact: Nothing is installed on the server.** The server is untouched. All intelligence runs locally.

## Architecture (30-second version)

```
Browser (React, localhost:3000)
    ↕ HTTP REST + WebSocket
Fastify Backend (Node.js, localhost:3001)
    ↕ SSH (ssh2 library, multiple channels per connection)
Remote VPS Server (unchanged, standard SSH)
```

The backend runs commands via SSH `exec()`, the output goes through a **Command Orchestrator → Parsing Pipeline**:
1. Orchestrator builds execution plan (which commands, parallel or sequential)
2. Executes commands via SSH (parallel where possible)
3. Each output: Strip ANSI → try deterministic parser → fall back to LLM → Zod validate
4. On Zod failure: retry LLM with error context (e.g., "expected number, got string")
5. On command failure: try fallback commands (e.g., `ip` → `ifconfig`)
6. Aggregate results → return typed JSON to frontend

## Tech Stack

- **Backend:** Node.js + Fastify + TypeScript
- **SSH:** `ssh2` (direct, not wrappers) — multi-channel (shell + exec + SFTP)
- **LLM:** OpenAI SDK with `zodResponseFormat()`, provider-agnostic interface
- **Frontend:** React 19 + Vite + TailwindCSS + Zustand
- **Terminal:** xterm.js (WebSocket bridge to SSH shell)
- **Schema:** Zod (types + validation + LLM schema generation)

## Project Structure

```
headlessOS/
├── docs/           ← YOU ARE HERE — read PROGRESS.md for current status
├── server/src/
│   ├── index.ts           # Fastify entry point
│   ├── services/          # BaseService + ServiceContainer (ADR-011)
│   │   ├── base-service.ts
│   │   └── container.ts
│   ├── ssh/               # SSH connection management
│   │   └── connection-manager.ts
│   ├── orchestrator/      # Command orchestration (ADR-013)
│   │   └── orchestrator.ts  # Multi-cmd, retry, fallback
│   ├── llm/               # LLM abstraction
│   │   ├── provider.ts    # Interface
│   │   └── providers/     # OpenAI, Anthropic, Ollama implementations
│   ├── parsers/           # Parsing pipeline
│   │   ├── pipeline.ts    # Main router (deterministic vs LLM)
│   │   ├── ansi-strip.ts
│   │   ├── deterministic/ # Regex parsers for known commands
│   │   └── schemas/       # Zod schemas for parsed output
│   ├── routes/            # API endpoints (servers, system, files, docker, etc.)
│   └── config/            # Local config store (~/.headlessos/)
├── client/src/
│   ├── App.tsx
│   ├── components/        # Per-app UI components
│   │   ├── Shell/         # Layout (sidebar, tabs, terminal panel)
│   │   ├── Dashboard/     # System overview cards
│   │   ├── FileExplorer/  # File browser
│   │   ├── Docker/        # Container/image management
│   │   ├── Terminal/      # xterm.js wrapper
│   │   └── ui/            # Reusable: Table, Card, TreeView, ContextMenu, etc.
│   ├── hooks/             # React hooks
│   └── store/             # Zustand state
└── shared/types.ts        # Types shared between server + client
```

## Current Status

**Check [PROGRESS.md](PROGRESS.md) for the live task tracker.**

## Key Design Rules (DO NOT VIOLATE)

1. **NEVER interpolate user input into shell commands.** Use validated parameters + SFTP for file ops. See [SECURITY.md](SECURITY.md).
2. **File operations use SFTP, not shell commands.** `sftp.readFile()` not `exec('cat ...')`.
3. **Every parsed output is Zod-validated.** Never trust LLM output without validation.
4. **Terminal output goes through xterm.js only.** Never render as raw HTML (XSS risk).
5. **Deterministic parsing preferred over LLM.** Use regex for known formats, LLM for unknown.
6. **Docker uses native JSON output** (`--format '{{json .}}'`). No LLM needed for Docker.
7. **Backend listens on localhost only.** Never bind to `0.0.0.0`.
8. **Destructive actions require confirmation dialogs.** Delete, kill, stop — all need user confirmation.
9. **All backend modules are Services.** Register in `ServiceContainer`, access via `this.services.get('name')`. See [ADR-011](DECISIONS.md).
10. **Apps are self-contained modules.** Each app registers its commands, schemas, parsers, and UI components via the App Registry. See [ADR-012](DECISIONS.md).

## Design Patterns (from Puter analysis)

ARCHITECTURE.md contains 5 reference patterns extracted from analyzing Puter (v2.5.1):

| Pattern | Where to use | Phase |
|---------|-------------|-------|
| 1. Service Container | All backend modules (SSH, LLM, Parser, Config) | Phase 0 |
| 2. Plugin Registry | App Registry — apps register commands, parsers, UI | Phase 2+ |
| 3. Process Tree Visualization | Process Manager — recursive `├── └──` tree | Phase 3 |
| 4. Context Menus | All data views — right-click for contextual actions | Phase 2+ |
| 5. Single-Instance Tabs | Terminal, Dashboard — focus existing tab, don't duplicate | Phase 2+ |

## Common Patterns

### Adding a new API endpoint:

```typescript
// server/src/routes/example.ts
import { FastifyInstance } from 'fastify';
import { connectionManager } from '../ssh/connection-manager';
import { pipeline } from '../parsers/pipeline';
import { SomeSchema } from '../parsers/schemas/some';

export async function exampleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/servers/:serverId/example', async (req, reply) => {
    const { serverId } = req.params as { serverId: string };

    // 1. Execute command via SSH
    const result = await connectionManager.exec(serverId, 'some-command');

    // 2. Parse through pipeline (tries deterministic, falls back to LLM)
    const parsed = await pipeline.parse('some-command', result.stdout, SomeSchema);

    // 3. Return typed response
    return {
      success: true,
      data: parsed.data,
      meta: { parsedBy: parsed.parsedBy, latencyMs: parsed.latencyMs, cached: false }
    };
  });
}
```

### Adding a Zod schema:

```typescript
// server/src/parsers/schemas/some.ts
import { z } from 'zod';

export const SomeSchema = z.object({
  name: z.string(),
  value: z.number(),
  status: z.enum(['active', 'inactive']),
});

export type SomeType = z.infer<typeof SomeSchema>;
export const SomeArraySchema = z.array(SomeSchema);
```

### Adding a deterministic parser:

```typescript
// server/src/parsers/deterministic/some.ts
import { DeterministicParser } from '../pipeline';

export const someParser: DeterministicParser = {
  parse(output: string): unknown {
    const lines = output.trim().split('\n');
    // ... regex parsing logic ...
    return parsedData; // must match the Zod schema
  }
};

// Register in server/src/parsers/register-parsers.ts:
// pipeline.registerParser('some-command', someParser);
```

### Adding a React component for an app:

```typescript
// client/src/components/SomeApp/SomeView.tsx
import { useEffect, useState } from 'react';
import { Table } from '../ui/Table';
import { useActiveServer } from '../../hooks/useActiveServer';
import { api } from '../../lib/api';

export function SomeView() {
  const { serverId } = useActiveServer();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/servers/${serverId}/example`)
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => { /* ... */ }} />;
  if (!data) return <EmptyState message="No data found" />;

  return <Table columns={columns} data={data} />;
}
```

## Documentation Reference

| Need to understand... | Read... |
|----------------------|---------|
| System architecture and data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| What to build (phase overview) | [IMPLEMENTATION_INDEX.md](IMPLEMENTATION_INDEX.md) |
| Detailed task specs | [phases/phase-0.md](phases/phase-0.md) through [phase-5.md](phases/phase-5.md) |
| Task → file → commit audit trail | [TRACEABILITY.md](TRACEABILITY.md) |
| How apps work, app schema | [APP_REGISTRY.md](APP_REGISTRY.md) |
| API endpoints (REST + WebSocket) | [API_SPEC.md](API_SPEC.md) |
| LLM integration, parsing strategy | [LLM_STRATEGY.md](LLM_STRATEGY.md) |
| Security rules, validation | [SECURITY.md](SECURITY.md) |
| How to write tests | [TESTING.md](TESTING.md) |
| Current task status | [PROGRESS.md](PROGRESS.md) |
| Why decisions were made | [DECISIONS.md](DECISIONS.md) |
| AI assistant rules | [../AGENTS.md](../AGENTS.md) |

## Quick Commands

```bash
# Start development
npm run dev

# Run tests
npm test

# Check current server health
curl http://localhost:3001/health

# Server config location
cat ~/.headlessos/servers.json
cat ~/.headlessos/config.json
```
