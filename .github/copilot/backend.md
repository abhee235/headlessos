---
applyTo: "server/src/**/*.ts"
---

# Backend Development Rules

## Service Container Pattern
All backend modules MUST be services registered in `ServiceContainer`:
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

Register in boot sequence: `container.register('my-service', new MyService('my-service'));`

## Code Style
- TypeScript strict mode — no `any` types
- Async/await over callbacks
- Fastify (NOT Express) — use `fastify.register()`, `fastify.get()`, etc.
- All data structures validated with Zod schemas

## SSH Rules
- Use `ssh2` directly — no wrappers (node-ssh, etc.)
- `exec()` channels for one-shot data collection (parallel OK)
- `shell()` channel for interactive terminal only
- Always set timeouts on exec channels
- Close channels when done

## Parsing Pipeline
All command output goes through the parsing pipeline:
```
raw output → strip ANSI → deterministic parser / LLM → Zod validate → typed JSON
```
- Check `server/src/parsers/deterministic/` for existing parsers before using LLM
- NEVER send ANSI codes to the LLM
- Always validate parsed output with Zod `.parse()`

## Command Orchestrator
Use the orchestrator for multi-command flows:
```typescript
const plan: ExecutionPlan = {
  steps: [
    { command: 'df -h', parser: 'disk-usage', schema: DiskUsageSchema },
    { command: 'free -m', parser: 'memory', schema: MemorySchema },
  ],
  parallel: true,
  retryPolicy: { maxRetries: 2, retryWithContext: true },
};
```

## Security (CRITICAL)
- NEVER interpolate user input into shell commands
- ALL file operations through SFTP — never `exec('cat ...')`
- Validate: paths (no traversal), container IDs (hex), PIDs (integer)
- Use validation functions: `validatePath()`, `validateContainerId()`, `shellEscape()`

## File Locations
| Purpose | Path |
|---------|------|
| Routes | `server/src/routes/` |
| Services | `server/src/services/` |
| SSH | `server/src/ssh/` |
| Parsers (deterministic) | `server/src/parsers/deterministic/` |
| Parsers (schemas) | `server/src/parsers/schemas/` |
| LLM providers | `server/src/llm/providers/` |
| Orchestrator | `server/src/orchestrator/` |
| Config | `server/src/config/` |
