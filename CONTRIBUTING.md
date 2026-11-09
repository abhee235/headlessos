# Contributing to HeadlessOS

Thanks for helping. This page covers setup, how work is planned and checked, and what a
pull request needs. The full rules for code, security and the UI are in
[AGENTS.md](AGENTS.md). CLAUDE.md lists the verified commands and how the code is built
today.

## Setup

You need Node.js 20 or later and npm 9 or later.

```bash
npm install                        # also installs the commit-message hook
cp .env.example .env               # optional: an OpenAI key; Settings → AI works too
npm run build --workspace=shared   # once, before the first typecheck
npm run dev                        # server on :3001, app on http://localhost:3000
```

- **A server to try it on:** `cd dev && docker compose up -d` starts a test SSH server
  at `127.0.0.1:2222` (user `testuser`, password `testpass`).
- **No LLM key?** Parsing still works with the deterministic parsers. `LLM_PROVIDER=fake`
  runs the agents end to end against scripted replies.
- **The desktop app:** `npm run build:dist:win` (or `:mac`, `:linux`).

## How the code is organized

HeadlessOS is a localhost app. A Fastify server signs in to Linux servers over SSH, runs
commands and parses their output: with deterministic parsers first, and an LLM only when no
parser fits. A React client renders the result as a desktop. Electron wraps both into the
desktop app. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the full picture.

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Node.js + Fastify + TypeScript | Fast, native WebSocket, great TS support |
| SSH | ssh2 (npm) | Pure JS, multi-channel, SFTP, PTY support |
| LLM | OpenAI SDK, Anthropic SDK (Claude) or Ollama (local), one provider interface | Structured output validated with Zod |
| Frontend | React + Vite + TypeScript + TailwindCSS | Fast dev, modern UI |
| Terminal | xterm.js + addons | Industry standard (used by VS Code) |
| Schema | Zod | Runtime + compile-time type safety, LLM schema generation |
| Desktop app | Electron | The same app as a native window, with the server bundled |

```
headlessos/
├── docs/                    # All project documentation (documentation-first)
│   ├── phases/              # Per-phase specs: phase-0…16 (milestones), phase-ex1…ex11 (experimental)
│   ├── PROGRESS.md          # Task tracker, status, changelog
│   ├── TRACEABILITY.md      # Task → files → tests audit trail
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   └── …                    # ARCHITECTURE, API_SPEC, SECURITY, TESTING, LLM_STRATEGY, …
├── server/                  # Backend (Node.js + Fastify)
│   └── src/
│       ├── index.ts         # Entry point: wires every component and route
│       ├── ssh/             # SSH connections, SFTP, terminal sessions
│       ├── parsers/         # Deterministic parsers + LLM parsing pipeline
│       ├── llm/             # Provider interface, OpenAI, Anthropic and Ollama providers, model limits
│       ├── agent/           # AI Agent and UI Agent: action catalog, approvals, context management
│       ├── dynamic-ui/      # Generated views, templates
│       ├── observatory/     # Traces of model and tool calls
│       ├── services/        # Domain services, command policy
│       ├── routes/          # REST + WebSocket endpoints
│       └── security/, config/, …
├── client/                  # Frontend (React + Vite)
│   └── src/                 # components/, store/, hooks/, lib/
├── shared/                  # Types and Zod schemas shared by server and client (shared/schemas/)
├── electron/                # Electron desktop app
├── dev/                     # Local test server (Docker, SSH on port 2222)
├── AGENTS.md                # Rules for AI coding assistants
├── SECURITY.md              # Security policy: reporting, what is stored and sent where
├── CONTRIBUTING.md          # This page
└── package.json             # npm workspaces root
```

### Where the docs are

| Document | Purpose | Read when |
|----------|---------|-----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, components, data flow | Understanding the system |
| [IMPLEMENTATION_INDEX.md](docs/IMPLEMENTATION_INDEX.md) | Phase overview, task ID system | Finding what to build next |
| [phases/](docs/phases/) | Detailed per-phase task specs | Building features |
| [PROGRESS.md](docs/PROGRESS.md) | Task tracker, current status | Checking what to work on next |
| [TRACEABILITY.md](docs/TRACEABILITY.md) | Task → files → tests audit trail | Tracking what was built |
| [DECISIONS.md](docs/DECISIONS.md) | Why decisions were made (ADRs) | Understanding past choices |
| [APP_REGISTRY.md](docs/APP_REGISTRY.md) | How apps work, adding new apps | Adding a new app module |
| [API_SPEC.md](docs/API_SPEC.md) | REST + WebSocket API reference | Writing frontend/backend code |
| [LLM_STRATEGY.md](docs/LLM_STRATEGY.md) | LLM integration, parser migration | Working on parsing |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, command safety | Any code that executes commands |
| [TESTING.md](docs/TESTING.md) | Test strategy, how to write tests | Writing or running tests |
| [CONTEXT.md](docs/CONTEXT.md) | Quick briefing for AI assistants | Starting a new AI session |
| [AGENTS.md](AGENTS.md) | Rules for AI coding assistants | An AI assistant is helping |

## How work is planned

The project is documentation-first:
1. **Spec first.** A change starts in a phase doc (`docs/phases/`). It has a task ID such
   as `M14.5` or `EX11.2`, and a row in `docs/PROGRESS.md`.
2. **Architectural decisions** get an ADR in `docs/DECISIONS.md` before the code.
3. **Then code and tests.** Every change has tests.
4. **Then the record.** An "as built" section in the phase doc, the PROGRESS row, and an
   entry in `docs/TRACEABILITY.md`.

For a small fix, open an issue first. We'll find or add its task.

## Commits

The hook checks the first line: `type(TaskID): description`.

```
feat(EX11.2): Claude in Settings → AI
fix(M14.4): audit log rotation no longer overwrites a rotated file
```

- **Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.
- **Task IDs:** one per commit, in a form like `M14`, `M14.5`, `EX10`, `EX10.13` or
  `EX6-A.3`.

## Before you open a pull request

Run what CI runs (`.github/workflows/ci.yml`):

```bash
npx tsc --noEmit -p server
npx tsc --noEmit -p client
npm test                           # server suite, then client suite
```

Vitest strips types without checking them, so passing tests are not enough: the
typechecks must pass too.

**UI changes:** say what you checked in the browser, and how (sizes, spacing,
light and dark).

## Security rules that reviews hold to

- **Shell commands.** Never put user input or model output into a shell command. Agents
  call typed actions from `server/src/agent/actions/catalog/`; the runner builds and
  quotes the command. A new capability that touches a server is a new action, plus a row
  in `tests/agent/actions/catalog.test.ts`.
- **Server output** is data, never HTML: React renders it, and the terminal goes through
  xterm.js.
- **Secrets** never go into code, tests, docs or commits. Use obvious fakes in tests.

To report a vulnerability, see [SECURITY.md](SECURITY.md). Please don't open a public
issue.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
