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
