---
applyTo: "server/src/routes/**/*.ts,server/src/ssh/**/*.ts,server/src/orchestrator/**/*.ts"
---

# Security Rules (CRITICAL)

Read docs/SECURITY.md before writing any code in these files.

## Command Execution
- NEVER interpolate user input into shell commands
- ALWAYS validate inputs before passing to SSH:
  - Paths: no traversal (`..`), must be absolute
  - Container IDs: hex characters only (`/^[a-f0-9]+$/`)
  - PIDs: integer only (`/^\d+$/`)
  - Service names: alphanumeric + hyphen + underscore only
- Use validation functions: `validatePath()`, `validateContainerId()`, `validatePid()`, `shellEscape()`

## File Operations
- ALL file read/write/delete/rename → SFTP API
- NEVER use `exec('cat ...')` or `exec('rm ...')` for file operations

## SSH Channel Safety
- `exec()` for one-shot data collection (parallel OK)
- `shell()` for interactive terminal only
- Always set timeouts, always close channels when done

## Command Orchestrator Safety
- ExecutionPlan commands must come from registered command builders
- Retry logic must have max retry limits (default: 2)
- Fallback chains must terminate — no circular fallbacks

## API Route Security
- Validate ALL request parameters with Zod schemas
- Never expose raw SSH errors to the client — sanitize error messages
