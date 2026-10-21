# Phase EX9 — Safe Agents (Action Catalog, Approvals, Local Models) (Experimental)

> Agents stop writing shell commands. They pick from a server-side catalog of typed
> **actions**; the server validates the parameters, builds the command, runs it and
> caps the output. Anything that changes a server pauses the run until the owner
> allows it. Then the same loop learns to work with small local models through Ollama.
>
> Decision record: [ADR-024](../DECISIONS.md) (replaces the free-form command parts of ADR-014).

## Why

Both agents send model-written command strings to the server today:

- The investigation agent (`agent/investigation-agent.ts`) and the UI Agent's
  `exec_command` / `sandbox_exec` tools pass the model's string through
  `isReadCommandAllowed()` (`agent/command-allowlist.ts`). That check is a set of
  prefix regexes and does not parse the shell. `cat /var/log/$(touch /tmp/x)` matches
  `^cat\s+\/var\/log\/` and passes, so command substitution runs. The same goes for
  backticks and for pipes into allowed "filters".
- `exec_write_command` and `sftp_write` let the UI Agent change servers with no human
  in the loop; the only gate is a regex allowlist.
- Generated view buttons (`WidgetAction.command`, form `commandTemplate`) carry
  model-written command templates that run through the classic `validateCommand()`
  allowlist, which includes high-risk rules such as `docker rm` and `apt remove`.
- `CommandPolicy` (ADR-023) sits at `ConnectionManager.exec()`, but it cannot tell an
  agent's command from a classic app's, and it defaults to `audit` mode.

Regexes over free text are the wrong tool. EX9 removes free text from the agent path.

## Design

### 1. Actions

An action is code, not text: `server/src/agent/actions/`.

```ts
type ActionRisk = 'read' | 'change';
type ActionCategory =
  | 'system' | 'disk' | 'process' | 'network' | 'service' | 'logs'
  | 'docker' | 'packages' | 'web' | 'security' | 'cron' | 'files' | 'cli';

interface ActionDef<P extends z.ZodObject<z.ZodRawShape>> {
  id: string;            // snake_case, /^[a-z][a-z0-9_]{2,47}$/ — also a valid native tool name
  title: string;         // "Service status"
  description: string;   // one line, ≤ 120 chars, written for the model
  category: ActionCategory;
  risk: ActionRisk;
  params: P;             // z.object({...}).strict(); every field bounded (see §2)
  run:
    | { kind: 'exec'; build(p: z.infer<P>): string[]; sudo?: boolean }
    | { kind: 'sftp-read'; path(p: z.infer<P>): string; maxBytes(p: z.infer<P>): number };
  parse?(stdout: string): unknown;  // optional; reuses parsers/deterministic where one fits
  timeoutMs: number;      // ≤ 60 000
  maxOutputBytes: number; // default 64 KiB; the runner truncates beyond it
}
```

- **`build` returns argv.** `argv[0]` is a literal program name written in code
  (`/^[a-z][a-z0-9._+-]*$/`, asserted). Every element is quoted by the server with
  `quoteArg()` (§3); nothing is ever concatenated into a shell string by hand. No
  pipes, no `&&`, no redirection: one action, one program.
- **`sudo: true`** prefixes `sudo -n` (never prompts; fails fast without passwordless sudo).
- **`sftp-read`** reads a file over SFTP (AGENTS.md: file contents go through SFTP,
  never `cat`). Only read actions use it. `tailLines` reads from the end instead
  (`file_tail`). The runner resolves the real path first and re-checks it against the
  read roots and the secret list, so a symlink under `/tmp` cannot lead to `/etc/shadow`.
- **Catalog checks at load** (unit-tested): ids unique and well-formed, params are
  strict objects, descriptions ≤ 120 chars, timeouts and caps in range, read actions
  never `kind: 'exec'` with a write verb in argv[0..1] (spot list).

### 2. Parameter validators

`agent/actions/params.ts` — Zod building blocks, each with a short `.describe()` the
model sees. Values the shell could misread are rejected, not escaped around:

| Builder | Accepts |
|---|---|
| `unitName()` | `/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/` (systemd unit) |
| `containerRef()` | hex id 12–64, or name `/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/` |
| `packageName()` | `/^[a-z0-9][a-z0-9.+-]{0,127}$/` |
| `programName()` | `/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/`, minus a deny set (`reboot`, `shutdown`, `halt`, `poweroff`, `init`, `telinit`, `mkfs*`, `dd`, `rm`, `kill*`, …) |
| `hostName()` | DNS name or IPv4/IPv6 literal, ≤ 253 chars |
| `httpUrl()` | `http(s)://` + host + optional port/path, no credentials, ≤ 2048 chars |
| `lineCount(max)` | integer 1..max |
| `pid()` | integer 1..4 194 304 |
| `readPath(roots)` | absolute, `posix.normalize(p) === p`, no `..`, no control chars, ≤ 4096, under one of `roots`, not matching the secret-file deny list |
| `globPattern()` | `/^[A-Za-z0-9*?._-]{1,64}$/` |
| `searchText()` | 1–128 printable chars, used with `grep -F -e` (fixed string) |
| `choice([...])` | `z.enum` |

Every value that starts with `-` is rejected by construction (names start with an
alphanumeric, paths with `/`), so a parameter can never become an option. Commands
also pass `--` before positional arguments where the program supports it.

**Read roots** (`READ_ROOTS`): `/etc`, `/var/log`, `/home`, `/root`, `/opt`, `/srv`,
`/var/www`, `/tmp`, `/usr/share/doc`. Files under `/proc` are read only by dedicated
actions (`load_average`, `network_traffic`, …), never through `readPath`.
**Denied even under a root** (`SECRET_PATHS`): `/etc/shadow`,
`/etc/gshadow`, `/etc/sudoers` and `/etc/sudoers.d/*`, `/etc/ssh/ssh_host_*_key`,
any `.ssh/` directory, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`/`id_ed25519*`/`id_ecdsa*`,
`.env` and `.env.*`, `.git-credentials`, `.netrc`, `.pgpass`, `.docker/config.json`,
`/proc/*/environ`, `/proc/kcore`.

### 3. Quoting

`agent/actions/quote.ts`:

- `quoteArg(s)` throws on NUL, CR or LF. Returns `s` unchanged when it matches
  `/^[A-Za-z0-9_@%+=:,./-]+$/` (the `shlex.quote` safe set), otherwise wraps it in
  single quotes with `'` → `'\''`. Empty string → `''`.
- `toCommand(argv, { sudo, sandbox })` joins quoted elements with single spaces.
  `sudo` → `sudo -n …`. A sandbox target (EX5 CLI discovery) →
  `docker exec <container> …` with the container name from the server, not the model.

Unchanged safe strings keep commands readable in the approval card and the audit log
(`systemctl status --no-pager nginx`, not `'systemctl' 'status' …`).

### 4. Runner

`agent/actions/runner.ts` — the only way an agent touches a server.

```ts
interface ActionRunResult {
  ok: boolean;
  actionId: string;
  command: string;          // exactly what ran (or would have run)
  exitCode: number | null;
  stdout: string;           // capped at maxOutputBytes
  stderr: string;           // capped at 4 KiB
  truncated: boolean;
  data?: unknown;           // parse() result when it succeeded
  durationMs: number;
  error?: string;           // short, model-facing ("service_status.unit: expected a unit name like nginx.service, you sent "../x"")
}

class ActionRunner {
  constructor(deps: { ssh: Pick<ConnectionManager, 'exec' | 'getSftp'>; catalog?: ActionCatalog; approvals?: ApprovalGate; audit?: ActionAudit });
  list(filter?): ActionDef[];
  validate(actionId, rawParams): { ok: true; params } | { ok: false; error: string };
  preview(actionId, params): { command: string; risk: ActionRisk };
  run(serverId, actionId, rawParams, opts: { runId: string; reason?: string; signal?: AbortSignal; sandboxId?: string }): Promise<ActionRunResult>;
}
```

Steps: look up (unknown id → `No such action: X. Closest: a, b, c`), validate
(strict Zod → short error, never throws to the agent), build, **risk gate** (`change`
needs an approval — EX9.1 refuses all change actions; EX9.2 adds the gate), run inside
a **grant** (§5) with the action's timeout, cap output, parse (parse failure falls back
to raw text), return. `formatForModel(result)` gives the model the parsed JSON when it
exists, otherwise the capped stdout, plus stderr and exit code when non-zero.

### 5. Enforcement: CommandPolicy knows when an agent is calling

`services/policy/agent-scope.ts` (next to the policy that reads it) holds an
`AsyncLocalStorage<AgentScope>`:

```ts
interface AgentScope { runId: string; agent: 'ui-agent' | 'investigation' | 'view-action'; grant?: Grant }
type Grant = { kind: 'exec'; actionId: string; command: string } | { kind: 'sftp'; actionId: string; path: string };
runAsAgent(scope, fn)            // both agents wrap their whole run
runGenAsAgent(scope, genFn)      // re-enters the store on every gen.next(), like withTraceGen
withGrant(grant, fn)             // the runner wraps exactly one exec / getSftp
outsideAgentScope(fn)            // server plumbing inside a run (the EX5 sandbox lifecycle)
```

- `CommandPolicy.assertAllowed(command)`: if an agent scope is active and there is no
  `exec` grant whose `command` equals this command, reject with reason
  `not-an-action` — **in every mode** (`enforce`, `audit`, `off`), like the blocklist.
  `BLOCKED_COMMANDS` still applies to granted commands. A granted command skips the
  classic `ALLOWED_COMMANDS` regexes: for agents, the catalog is the allowlist.
- `ConnectionManager.getSftp()` calls `policy.assertSftpAllowed()`: inside an agent
  scope it needs an `sftp` grant.
- Outside an agent scope nothing changes: classic apps keep ADR-023 behaviour.

So a tool that forgets the runner and calls `ssh.exec` directly fails closed. The
fake-server proxy (`FakeSSHProxy`) answers before the policy, which is fine: it never
reaches a real host.

### 6. How agents see actions

An earlier agent project measured qwen3.5:9b on 211 tools: a small model uses
what its **native** tool list holds and little else. Listing tools natively scored
88% (but cost a 48k-token prompt), tools described as text 40%, tool search 23%, a
native list of the likely ~30 tools 80–85%. Shortening descriptions did not help.

So actions become **native tools**, one per action (`agent/actions/tools.ts`):
name = action id, parameters = the params JSON schema, description = the one-liner.
Action tools use plain JSON Schema (`jsonSchema7` target), so optional fields stay
optional and defaults stay visible; the shared converter's `openAi` target would mark
every field required-but-nullable. The runner treats a `null` value as "not given".
`selectActions(catalog, request, { max, risk })` picks the set for a run: keyword
score over id/title/description/category (plus category synonyms such as
"port" → network, "container" → docker), always including a small core
(`system_overview`-style reads), capped at `max`. The set is fixed for the run so the
provider's prompt cache keeps hitting. A call to a catalog action outside the set
still runs (the runner validates it); a call to a non-existent id gets the "Closest:"
hint.

Budgets: OpenAI models get up to 40 read actions; Ollama models get
`floor(0.10 × num_ctx / 120)` (EX9.3). The UI Agent's local tools (`search_templates`,
`validate_schema`, `generate_schema`, `grep_output`, `update_view`) stay as they are.

### 7. Approvals (EX9.2)

```
run → runner.run(change action) → approvals.request(...)  ──► event approval_required ──► ApprovalCard
                                       ▲  (promise parked)                                   │
                                       └──────────── approvals.resolve(id, allow|deny) ◄─────┘
```

- `agent/actions/approvals.ts` `ApprovalGate`: `request(summary) → Promise<'allow' | 'deny'>`.
  The resolver is stored **before** the event is emitted (otherwise a fast client could
  answer an approval the server doesn't know yet). Each approval resolves once.
  `cancelRun(runId)` resolves every pending approval of that run as deny (`by: 'stop'`).
  An unanswered approval expires after 10 minutes (deny, `by: 'timeout'`).
- The card shows: action title, the **full command** (monospace, scrollable), server
  name and host, **login user** (the SSH username from `servers.json`), the model's
  **reason** (required parameter on every change call, ≤ 200 chars), and the risk.
  Buttons: **Allow once** (primary, focused) and **Deny**; Esc denies. There is no
  "always allow". Once settled the card collapses to one line ("Allowed: …",
  "Denied", "Stopped before an answer", "Expired").
- **Stop** (both agents) aborts the run and denies every pending approval.
- A denial goes back to the model as a directive tool result: the owner declined; do
  not retry or work around it; say what you would have done and stop.
- **Audit log** (`agent/actions/audit.ts`): `~/.headlessos/audit/actions.jsonl`,
  file mode 0o600, directory 0o700. One JSON object per line, written with
  `appendFile` only — entries are never rewritten. Fields: `ts`, `event`
  (`asked | answered | ran | refused`), `runId`, `approvalId?`, `serverId`,
  `loginUser`, `actionId`, `risk`, `command`, `reason?`, `decision?`, `by?`
  (`owner | stop | timeout`), `exitCode?`, `durationMs?`. Every change-action run
  is logged; read actions are not (they are in the Observatory trace). When the file
  passes 10 MB it is renamed to `actions-<iso-date>.jsonl` and a new one starts.
- **Who may change things:** the investigation agent gets change actions only when the
  owner turns on "Allow changes (asks first)" for that run (the existing `readOnly`
  option, default on). The UI Agent builds views and gets read actions only.
- **Generated view buttons:** `WidgetAction` gains `action: { id, params }` where
  param values may hold `{column}` placeholders filled from the row; `command` becomes
  optional (legacy). New routes:
  - `POST /api/servers/:id/actions/preview` `{ actionId, params }` → validates, builds,
    and for change actions records a pending approval (server-side, 10-minute TTL) →
    `{ approvalId?, command, risk, title, loginUser }`.
  - `POST /api/servers/:id/actions/run` `{ actionId, params }` for read actions, or
    `{ approvalId }` for change actions — the server runs the command it recorded at
    preview time, once; the client's params are not re-read.
  The button shows the same ApprovalCard. Legacy `command` buttons keep working only
  when the command matches a classic rule with risk `none` or `low`; anything riskier
  returns 403 "This button was generated before actions existed — regenerate the view".
  Form `commandTemplate` submits follow the same rule.
- Out of scope for EX9.2: config-file write-back (`agent/writeback.ts`). It already
  runs only from an owner's form submit, with a path allowlist, backup and rollback.

### 8. Shared loop and providers (EX9.3)

- **One loop**, `agent/loop/run-loop.ts`: `runAgentLoop(opts)` is an async generator of
  typed events — `step`, `assistant_text`, `tool_call`, `tool_result`,
  `approval_required`, `approval_resolved`, `loop_warning`, `final`, `error`. The
  investigation agent moves onto it (native tool calls instead of the
  structured-output thought schema). The UI Agent executor keeps its view-building
  logic but executes tool calls through the same `executeToolCall()` and input
  handling.
- **Provider interface:** `LLMProvider.chatWithTools` (already used by the UI Agent) is
  the contract. Adapters: `OpenAIProvider` (exists) and a new `OllamaProvider`
  (`llm/providers/ollama.ts`): `POST {baseUrl}/api/chat`, `stream: false`, `tools`,
  `options: { num_ctx, num_predict, temperature }`; `parseText` uses Ollama's
  `format: <JSON schema>`. Context length from `POST /api/show`; health from
  `GET /api/tags` (5 s timeout). Request timeout 120 s.
- **Settings → AI** gains Provider (OpenAI | Ollama), Ollama URL (default
  `http://127.0.0.1:11434`) and model. Stored in `~/.headlessos/llm.json` (no secret).
  A non-loopback Ollama URL needs an explicit confirm (prompts and server output leave
  the machine).
- **Weak-model input handling** (`agent/loop/tool-input.ts`), in this order:
  1. Arguments may arrive as an object or a string. Strings are parsed; on failure a
     repair ladder runs, re-parsing after each step: cut to the outermost `{…}`,
     drop trailing commas, quote bare keys, single → double quotes, close a truncated
     object. Still broken → "`X` was called with arguments that are not valid JSON.
     You sent: `…`. Call `X` again with one JSON object using these keys: a, b".
  2. Prose tool calls: when a model writes a tool call as text (a ```json fence or
     `<tool_call>` block naming an offered tool) instead of using the tool channel,
     the first match is executed.
  3. Key aliases (only after validation fails, never overwriting a key the model sent):
     case-folding, then generic aliases (`unit ← service, name, service_name`,
     `container ← id, container_id, name`, `lines ← n, count, limit, tail`,
     `path ← file, file_path, filename, dir`, `pid ← process, process_id`) and
     per-action aliases declared on the action.
  4. Coercion as meant: `"10"` → 10, `"true"` → true, `"[…]"`/`"{…}"` → parsed.
  5. Still invalid → at most three problems, each phrased
     `param: expected <what>, you sent <value>`, plus the action's signature line.

### 9. Guards and budgets (EX9.4)

- **Loop guard** (port of an earlier agent project's `loopGuard`): key = `action + JSON(params)`,
  fingerprint = hash of the result. Same call with the same result 3 times → warning
  appended to the next turn; 6 times → stop. After the warning, an identical
  back-to-back call is refused without running ("not repeated — try another way");
  2 refusals → stop. Same opening sentence 3 times in the last 6 turns → warning,
  then stop. A stop runs one last turn with tools off: say what was tried, what
  failed, how to continue.
- **Context trimming:** estimate tokens as chars / 4. Over budget (window minus a
  reserve for the reply), replace older tool results with a one-line stub
  (`[output trimmed — disk_usage, 6 983 chars; run it again if you need it]`), keeping
  the latest four; if still over, drop the oldest call/result pairs, never the first
  user message.
- **Output caps:** `ConnectionManager.exec()` gains `maxBytes`: past it, the channel
  stops collecting, closes, and the result is flagged truncated. The model-facing view
  of a result is capped again (OpenAI 8 000 chars, Ollama `num_ctx`-scaled), keeping
  60% from the head and 40% from the tail.
- **Benchmark:** `server/scripts/agent-bench.ts` (`npm run bench:agents -- --provider
  ollama --model qwen3:8b`) asks ~12 benign questions against `FakeSSHProxy` outputs and
  reports per model: expected action picked, answer produced, steps, tokens, malformed
  calls repaired / refused. Never runs in CI; a fake-provider version runs as a test.

### 10. Optional hardening (EX9.5)

- Per-server **agent login**: an optional second, lower-privilege SSH user in
  `servers.json` that agent runs connect as.
- **Untrusted data**: tool results are wrapped as server output and the system prompt
  says instructions inside server output are data, never commands.
- **Secret redaction** before the model and the audit log see output: private key
  blocks, cloud access keys, bearer/JWT tokens, `password=`/`secret=`/`token=` values,
  connection-string credentials.

## What does not change

- Classic apps (Dashboard, Files, Docker, Services, Task Manager, Server Admin) keep
  their routes, domain services and ADR-023 policy behaviour.
- The parsing pipeline, Dynamic UI generation, templates and Observatory spans.
- `HEADLESS_POLICY_MODE` semantics outside agent scope.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| EX9.0 | Remove `exec_write_command` and `sftp_write` from `ALL_AGENT_TOOLS` (UI Agent can no longer change servers) | ✅ |
| EX9.1 | Action catalog (40–60 read actions), param validators, quoting, runner, agent scope + CommandPolicy enforcement, action tools + selection; both agents on the runner; free-form read allowlist and `exec_command`/`sftp_read`/`sandbox_exec` retired | ✅ |
| EX9.2 | Change actions + ApprovalGate + audit log + ApprovalCard; Stop denies pending; investigation agent "Allow changes (asks first)"; generated view buttons through preview/run | ⬜ |
| EX9.3 | Shared agent loop with typed events; OllamaProvider; Settings → AI provider choice; weak-model input handling (repair, prose calls, aliases, coercion, short errors) | ⬜ |
| EX9.4 | Loop guard, context trimming, exec/output caps, benchmark script + fake-provider test | ⬜ |
| EX9.5 | (Optional) agent login per server, untrusted-data marking, secret redaction | ⬜ |

## EX9.0 — Remove the UI Agent's write tools

`ALL_AGENT_TOOLS` (`agent/tools/index.ts`) drops `execWriteCommandTool` and
`sftpWriteTool`. The modules stay (EX9.2 replaces them with change actions) but are
not registered anywhere, so a model that asks for them gets "Unknown tool". Tests:
the registered set has no `write`-tier tool, and the route's registry rejects both
names.

## EX9.1 — Catalog, runner, enforcement (as built)

**Catalog: 60 read actions** in `agent/actions/catalog/` — system (9), disk (5),
process (3), network (9), service (5), logs (4), cron (1), docker (7), packages (2),
web (3), security (4), files (4), cli (4). Every action's exact command is pinned in
`tests/agent/actions/catalog.test.ts`; adding an action without a row there fails.
Notes from building it:

- `user_accounts` reads `/etc/passwd` over SFTP: the classic blocklist refuses any
  command containing the word `passwd`, and the blocklist applies to granted commands.
- `docker_*` list actions use `--format '{{json .}}'` and a parser that keeps the useful
  keys; `docker_inspect` drops `Config.Env` (secrets) and keeps state, restart policy,
  health, mounts, ports.
- `cli_locate | cli_help | cli_version | cli_manual` replace the EX5-A.1 discovery
  regexes and `sandbox_exec`: with an active sandbox they run as
  `docker exec <sandbox> …`; other actions always run on the host.

**Retired:** the `exec_command`, `sftp_read` and `sandbox_exec` tools; the read-only
allowlist, pipe filters and `isReadCommandAllowed()` in `agent/command-allowlist.ts`
(the write allowlist stays for form write-back until EX9.2); guardrails' free-form read
branches (action tools pass guardrails; the runner validates them).

**UI Agent:** registers the local tools plus one tool per read action and offers 40 per
run (`ToolContext.offeredActions`, chosen from the request). `get_server_context` runs
seven actions through the runner. The whole run is an agent scope; the sandbox
lifecycle runs outside it.

**Investigation agent:** until EX9.3 moves it to native tool calls it keeps structured
output, now `{ thought, action, params (JSON object as text), answer, decision:
'run_action' | 'answer' }`. Its system prompt lists 40 selected actions with signatures.
Bad params, malformed JSON and unknown ids come back to the model as short errors
("…: expected …, you sent …"; "No such action: x. Closest: …") without touching SSH.
Progress events carry `action` and the server-built `command`; the client accepts
`decision: 'run_action'`.

## Inspiration (read-only sibling repos)

- An earlier agent project's `packages/core/src`: `permissions/gate.ts` (pure allow/ask/deny),
  `tools/scheduler.ts` + `session.ts` (park-and-resume: store the resolver, drain
  pending on abort, register before yielding), `tools/runTool.ts` +
  `inputNormalizer.ts` (directive errors, aliases), `llm/jsonRepair.ts`,
  `llm/proseToolCalls.ts`, `llm/resilience.ts`, `llm/providers/ollama.ts`, `context/`.
- An earlier agent project: `packages/core/src/agent/loopGuard.ts`, `docs/adr/ADR-055-tools-on-demand.md`,
  `packages/host/src/safety/audit.ts` (its log is a SQLite table that updates rows;
  HeadlessOS uses an append-only file instead), `ApprovalCard.tsx`.
