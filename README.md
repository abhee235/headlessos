# HeadlessOS

> A local application that transforms headless Linux servers into a Windows-like visual interface — without installing anything on the server.

## What Is This?

HeadlessOS is a **localhost web application** that connects to your VPS/Linux servers via SSH, executes commands, parses terminal output using LLMs, and renders the results as a familiar desktop-like UI — file explorer, process manager, Docker dashboard, service manager, and more.

**Zero footprint on the server.** The server doesn't know it's being managed through a GUI. It just receives and responds to SSH commands like normal.

## The Problem

You have a VPS. You SSH into it. You can never remember:
- `docker ps --format '{{json .}}'`
- `systemctl list-units --type=service --state=running --no-pager`
- `df -h | awk '{print $1, $5}'`
- `journalctl -u nginx --since "1 hour ago"`

You want a **visual interface** — like Windows Explorer for files, Task Manager for processes, a Docker Desktop-like panel — but you don't want to install a 500MB GUI on a $5/month VPS.

## The Solution

```
┌─────────────────────────────────────────────────┐
│              Your Local Machine                  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │          HeadlessOS (localhost:3000)        │  │
│  │                                            │  │
│  │  ┌──────────┐ ┌─────────┐ ┌────────────┐  │  │
│  │  │  File    │ │ Docker  │ │  Process   │  │  │
│  │  │ Explorer │ │Dashboard│ │  Manager   │  │  │
│  │  └──────────┘ └─────────┘ └────────────┘  │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │        Interactive Terminal           │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────┬───────────────────────────┘  │
│                   │ SSH (ssh2 library)            │
└───────────────────┼──────────────────────────────┘
                    │
            ┌───────▼───────┐
            │  Your VPS     │
            │  (unchanged)  │
            │  Just SSH     │
            └───────────────┘
```

## Key Principles

1. **Zero server install** — The server runs no additional software. All intelligence is local.
2. **LLM-first, then optimize** — Start with LLM parsing everything. Progressively replace with deterministic parsers for speed and cost.
3. **Deterministic > Intelligent** — Prefer regex parsers and JSON-output flags over LLM when possible.
4. **Terminal is always available** — The UI is a convenience layer. Users can always drop to a real terminal.
5. **Provider-agnostic LLM** — Abstractions allow switching between OpenAI, Anthropic, Ollama (local), or any provider.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Node.js + Fastify + TypeScript | Fast, native WebSocket, great TS support |
| SSH | ssh2 (npm) | Pure JS, multi-channel, SFTP, PTY support |
| LLM | OpenAI SDK (primary), provider-agnostic interface | Structured Outputs with Zod schemas |
| Frontend | React + Vite + TypeScript + TailwindCSS | Fast dev, modern UI |
| Terminal | xterm.js + addons | Industry standard (used by VS Code) |
| Schema | Zod | Runtime + compile-time type safety, LLM schema generation |

## Project Structure

```
headlessOS/
├── docs/                        # 📖 All project documentation (DDD)
│   ├── ARCHITECTURE.md          # System design, component diagram, data flow
│   ├── IMPLEMENTATION_INDEX.md  # Phase overview + task ID system
│   ├── phases/                  # Detailed per-phase task specs
│   │   ├── phase-0.md           # Project scaffolding
│   │   ├── phase-1.md           # Core infrastructure
│   │   ├── phase-2.md           # Dashboard + file explorer
│   │   ├── phase-3.md           # Docker + processes + services
│   │   ├── phase-4.md           # Optimization + deterministic parsers
│   │   └── phase-5.md           # Security hardening + polish
│   ├── TRACEABILITY.md          # Task → files → commits audit trail
│   ├── APP_REGISTRY.md          # App abstraction schema, adding new apps
│   ├── API_SPEC.md              # Backend REST + WebSocket API spec
│   ├── LLM_STRATEGY.md          # LLM integration, parser migration plan
│   ├── SECURITY.md              # Threat model, mitigations
│   ├── TESTING.md               # Test strategy, coverage targets
│   ├── PROGRESS.md              # Task tracker, milestones, status
│   ├── DECISIONS.md             # Architecture Decision Records (ADRs)
│   └── CONTEXT.md               # AI assistant context briefing
├── server/                      # Backend (Node.js + Fastify)
│   ├── src/
│   │   ├── index.ts             # App entry point
│   │   ├── ssh/                 # SSH connection management
│   │   ├── llm/                 # LLM abstraction layer
│   │   ├── parsers/             # Output parsing pipeline
│   │   ├── routes/              # API endpoints
│   │   └── config/              # Local config store
│   ├── package.json
│   └── tsconfig.json
├── client/                      # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/          # UI components per app
│   │   ├── hooks/               # React hooks
│   │   └── lib/                 # API client, utilities
│   ├── package.json
│   └── vite.config.ts
├── shared/                      # Shared types between server & client
│   └── types.ts
├── AGENTS.md                    # Instructions for AI coding assistants
├── package.json                 # Workspace root
└── README.md                    # This file
```

## Quick Start

```bash
# Prerequisites: Node.js 20+, npm 9+

# Install dependencies
npm install

# Set up config (API keys, default server)
cp server/.env.example server/.env
# Edit server/.env with your OpenAI API key

# Start development (backend + frontend concurrently)
npm run dev

# Open in browser
open http://localhost:3000
```

## Documentation Index

| Document | Purpose | Read When |
|----------|---------|-----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, components, data flow | Understanding the system |
| [IMPLEMENTATION_INDEX.md](docs/IMPLEMENTATION_INDEX.md) | Phase overview, task ID system | Finding what to build next |
| [phases/phase-{0-5}.md](docs/phases/) | Detailed per-phase task specs | Building features |
| [TRACEABILITY.md](docs/TRACEABILITY.md) | Task → files → commits audit trail | Tracking what was built |
| [APP_REGISTRY.md](docs/APP_REGISTRY.md) | How apps work, adding new apps | Adding a new app module |
| [API_SPEC.md](docs/API_SPEC.md) | REST + WebSocket API reference | Writing frontend/backend code |
| [LLM_STRATEGY.md](docs/LLM_STRATEGY.md) | LLM integration, parser migration | Working on parsing |
| [SECURITY.md](docs/SECURITY.md) | Threat model, command safety | Any code that executes commands |
| [TESTING.md](docs/TESTING.md) | Test strategy, how to write tests | Writing or running tests |
| [PROGRESS.md](docs/PROGRESS.md) | Task tracker, current status | Checking what to work on next |
| [DECISIONS.md](docs/DECISIONS.md) | Why decisions were made (ADRs) | Understanding past choices |
| [CONTEXT.md](docs/CONTEXT.md) | Quick briefing for AI assistants | Starting a new AI session |
| [AGENTS.md](AGENTS.md) | Rules for AI coding assistants | AI assistant is helping |

## Development Approach

**Document-Driven Development (DDD):**
1. Every feature is documented BEFORE it's built
2. Documentation is the source of truth — code follows docs
3. When docs and code disagree, docs are updated first, then code is aligned
4. AI coding assistants read [CONTEXT.md](docs/CONTEXT.md) and [AGENTS.md](AGENTS.md) before starting work

## License

MIT
