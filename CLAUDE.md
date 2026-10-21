# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

HeadlessOS is a localhost app (browser or Electron) that drives Linux servers over SSH, parses command output with deterministic parsers or an LLM, and renders it as a Windows-like desktop. Nothing is installed on the remote server.

**`AGENTS.md` is the master ruleset.** It covers the mandatory doc-first (DDD) workflow, task IDs, security rules, code style and the UI component inventory. Follow it, and read it first if it isn't already in your context. This file adds verified commands, the architecture as actually built, and the places where the docs no longer match the code.

## Commands

```bash
npm install                          # also runs postinstall: git config core.hooksPath .githooks
cp .env.example .env                 # .env lives at the REPO ROOT (README's server/.env is wrong)
npm run dev                          # server :3001 (tsx watch) + Vite :3000; Vite proxies /api and /ws to :3001

npm run build --workspace=shared     # run once first: shared is a composite TS project, so server/client
                                     # tsc fails with TS6305 until shared/dist exists. Root `npm run build` skips it.
npx tsc --noEmit -p server           # typecheck. Vitest and tsx strip types without checking,
npx tsc --noEmit -p client           # so green tests do not mean clean types.

npm test                             # server THEN client, joined by && (a server failure skips the client suite)
npm run test:server / test:client    # run each suite on its own
cd server && npx vitest run tests/config/session-store.test.ts -t "permissions"   # one file, filter by test name
cd server && npx vitest run session-store                                          # a path substring also works

npm run test:prod                    # build client, esbuild-bundle server into electron/server.mjs, launch Electron
npm run build:dist:win               # also :mac / :linux. CI release builds on tags matching v*.*.* (.github/workflows/release.yml)

npm run bench:agents -- --provider ollama --model qwen3:8b   # EX9.4: score a model on 12 benign questions
                                     # against fake-server (canned output). Calls the model; not for CI.
```

No linter or formatter is configured.

**Running without an API key or a server:** set `LLM_PROVIDER=fake`. It only takes effect when `OPENAI_API_KEY` is unset or still the `sk-your-key-here` placeholder. It wires a scripted `FakeLLMProvider` and a `FakeSSHProxy`, and seeds a `fake-server` entry, so the UI Agent pipeline runs end to end. Classic apps (Dashboard, Files, etc.) still use the real SSH manager. With no key and no fake mode, parsing is deterministic-only until a key is saved in Settings → AI: that key (encrypted in `~/.headlessos/llm.json`, loaded before `.env` at startup) reaches parsing, the investigation agent, Dynamic UI and the UI Agent's model router at runtime, and the UI Agent WebSocket is always registered (it answers "not configured" without a key).

**Real SSH target:** `cd dev && docker compose up -d` serves `127.0.0.1:2222` with user `testuser` / password `testpass`. `dev/vm.sh` (Lima) and the Chrome command in AGENTS.md §16 are macOS-only.

**On Windows**, `session-store.test.ts > saved file has 0o600 permissions` fails because POSIX mode bits don't exist there.

## Server architecture

**`server/src/index.ts` is the single wiring point.** It creates every component, boots the container, registers parsers and routes, and handles shutdown, which hibernates live sessions.
- **Container membership:** only `config`, `session-store`, `ssh`, `parser`, `orchestrator`, `trace-persistence` and (with OpenAI) `model-router` are registered in `ServiceContainer`. Everything else is a plain class: `OutputCache`, `LLMUsageTracker`, `TraceStore`, `DynamicUIGenerator`, `AppStore`, both agents, and the disk cache.
- **Routes get dependencies through Fastify plugin options:** `app.register(dockerRoutes, { connectionManager })`. They do not use module imports or `this.services`. A new route is a plugin that reads its deps from `opts`, plus a registration line in `index.ts`.
- **Auto-reconnect:** a `preHandler` hook reconnects disconnected servers for URLs matching `dataRoutePattern` (`/api/servers/:id/(docker|system|files|…)`). Add any new per-server route prefix to that regex.
- **Binding and ports:** the server binds `127.0.0.1`. With `PORT=0` it prints `HEADLESSOS_PORT:<n>`, which `electron/main.js` parses. The client (`lib/api.ts`) reads that port from `window.electronAPI.serverPort` under `file://`, and otherwise uses the Vite proxy.
- **Module resolution:** ESM with Node16 resolution, so server relative imports need a `.js` extension. Shared code is imported as `headlessos-shared` or `headlessos-shared/schemas/<name>`.
- **Persistent state** lives in `~/.headlessos/`: `servers.json`, `llm.json` (Settings → AI key, encrypted), `sessions/<id>.json`, `dynamic-ui-cache/`, `observatory/traces/`. Passwords are AES-GCM encrypted with a key derived from hostname + uid (`security/encryption.ts`), so stored credentials don't move between machines.

### Path 1: classic apps (Dashboard, Files, Docker, Services, Task Manager, Server Admin)
A route calls `orchestrator.execute(plan)` or `connectionManager.exec()`, then `pipeline.parse(command, raw, schema, serverId)`. The pipeline tries the cache, then a deterministic parser, then the LLM, then validates with Zod.
- **Adding a parser:** a parser is `DeterministicParser { name, commands[], parse() }`. Add it to `allParsers` in `parsers/deterministic/index.ts`.
- **Parser lookup:** an exact match on the command string wins. Otherwise the **first registered key that is a prefix** of the command is used, so the order of `allParsers` matters.
- **Orchestrator plan steps** are `{ id, command, schema, fallbackCommands?, dependsOn?, timeout? }`.
- **Where schemas live:** parsed-output schemas go in `server/src/parsers/schemas/`. Schemas that cross the client/server boundary go in `shared/schemas/` (`dynamic-view`, `observatory`, `session`).
- **Validation helpers:** `security/validators.ts` holds the input validators, the `ALLOWED_COMMANDS`/`validateCommand` allowlist, and `sanitizeErrorMessage()`.

### Path 2: Dynamic UI and agents (phases EX1–EX5)
The LLM emits `DynamicViewSchema` JSON (`shared/schemas/dynamic-view.ts`). A generic renderer in `client/src/components/DynamicUI/` (`widgets/`, `layouts/`) turns it into UI.
- **`dynamic-ui/generator.ts`** runs two passes: `design-classifier.ts` picks a content type and layout pattern, then the generator fills it in. `template-registry.ts` matches command templates (`dynamic-ui/templates/`) before falling back to the LLM. User-saved apps (`app-store.ts`) are fed back into the registry.
- **`agent/ui-agent.ts`** runs Planner → reactive Executor (OpenAI function calling over `agent/tools/`) → optional Reflector.
  - `llm/model-router.ts` picks a model per role (`reasoning | structured-output | fast | weak`, defined in `config/models.ts`).
  - Progressive output streams as `layout_update` events built by `dynamic-ui/working-view.ts`, over the WebSocket in `routes/agent-ui.ts`.
- **`agent/investigation-agent.ts`** is the older read-only ReAct agent, served by `routes/agent.ts`.
- **Agent safety:**
  - Agents never send command text (ADR-024, EX9). They call typed actions from `agent/actions/catalog/`; `ActionRunner` validates params, builds argv, quotes it and runs it. A new server-touching capability is a new action plus a row in `tests/agent/actions/catalog.test.ts`.
  - Agent runs execute in an AsyncLocalStorage scope (`services/policy/agent-scope.ts`). Inside it, `CommandPolicy` refuses any command the runner did not grant, in every policy mode, and `getSftp()` needs a grant. Server plumbing inside a run (the EX5 sandbox lifecycle) goes through `outsideAgentScope()`.
  - `agent/guardrails.ts` passes action tools through (the runner checks them) and keeps the deny/write tiers for the legacy tools. `agent/command-allowlist.ts` now only guards form write-back.
  - Server writes go through `agent/writeback.ts`: SFTP write, backup, validate command, then rollback if validation fails.
- **Context (EX10, ADR-025):** `llm/model-limits.ts` resolves a model's window: for Ollama, the lowest of the owner's setting (Auto = 64K), the Modelfile `num_ctx` and the trained length; for hosted models, a table capped at 128K. `agent/context/plan.ts` derives every budget from it: reply reserve, compaction trigger and stop point, result cap, offered actions and prompt tier. Agent loops call `ContextManager.prepare()` before each model call and `observe()` after it, and handle `finishReason: 'length'` and overflow errors through it. Never size a budget from `contextWindow` directly.
- **Observatory:** `observatory/context.ts` provides AsyncLocalStorage `withTrace`/`withSpan`. Wrap new LLM or tool calls in them so they appear in the trace UI.

## Client architecture

- **Screens:** `App.tsx` switches on `useAppStore().screen`: `lock` → `login` (rendered by `ControlCenter`, with Sessions / Fleet / Global Settings tabs) → `desktop`.
- **The desktop is a window manager, not tabs.**
  - `store/window-store.ts` `openWindow(appId, serverId, …)` opens apps.
  - The appId → component switch is in `components/Desktop/WindowManager.tsx`.
  - App metadata (icon, `singleInstance`, `refreshInterval`, `requiredTools`) is in `lib/apps.ts`.
  - **New desktop app:** add a `lib/apps.ts` entry and a `WindowManager` case, plus a backend route plugin registered in `index.ts`.
- **Multi-session (EX6):** each server is a persistent session (`store/sessions-store.ts`).
  - Windows sync per session via `store/window-session-sync.ts`. `WindowManager` and `Taskbar` filter by `activeServerId`.
  - Preferences are layered as global ⊕ per-session override (`store/effective-preferences.ts`, `useEffectivePref`). Only keys in `OVERRIDABLE_PREFERENCE_KEYS` can be overridden.
- **Backend calls** go through `lib/api.ts`. WebSockets live under `/ws/…` (terminal, observatory, docker-install, agents, dynamic-ui). `@/` is an alias for `client/src`.
- **Extra entry point:** `playground.html` / `playground-entry.tsx` is a second Vite entry, a standalone Dynamic UI playground at `/playground.html`.
- **Scratch files, not app code:** `temp-*.mjs` at the root and `client/src/icon-comparison.tsx` compare icon libraries.

## Tests as they actually exist

- **Parser tests** embed raw command output as inline template strings. There is no `tests/fixtures/` directory or `readFixture()` helper.
- **Route tests** create `Fastify()`, register the one route plugin with mocked deps, and call `app.inject()`.
- **Agent tests** use `server/tests/agent/helpers/mock-ssh.ts` (`MockSSHConnectionManager`) together with scripted `FakeLLMProvider` scenarios (`server/src/llm/providers/fake-scenarios.ts`).
- **Client tests** run in jsdom. `client/tests/setup.ts` loads the jest-dom matchers.

## Where AGENTS.md / CONTEXT.md / README disagree with the code

- **LLM providers:** `llm/providers/openai.ts` and `llm/providers/ollama.ts` (EX9.3; chosen in Settings → AI, saved in `~/.headlessos/llm.json`), plus the `fake-*` files. There is no Anthropic provider.
- **Service container:** the "every module extends `BaseService`" rule is aspirational. See the container list above for what is actually registered.
- **Client tabs:** the `openTab`/tabs pattern and `components/Shell/` are legacy. Shell is imported nowhere, and windows replaced tabs.
- **Route example:** CONTEXT.md's route example imports a global `connectionManager`. Real routes take it from plugin options.
- **Parser registration:** there is no `register-parsers.ts`. Registration is the `allParsers` array.
- **Task ID formats:** AGENTS.md only documents `M{n}.{n}`. The `.githooks/commit-msg` hook also accepts `M1`, `EX3`, `EX2.5` and `EX6-A.3`, but rejects a bare `EX6-A`. It checks only the first line, and merge commits are exempt.
- **Phase docs:** experimental phases are specced in `docs/phases/phase-ex{n}.md`. M9–M11 have no phase doc; they exist only in `docs/PROGRESS.md`.
