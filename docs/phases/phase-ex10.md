# Phase EX10 — Context Engineering for Agents (Experimental)

> Both agents learn how big their model's window really is and plan every budget from
> that one number: what the system prompt says, how many tools are offered, how much of
> each tool result the model sees, when old steps are compacted, and how much room the
> reply gets. The UI Agent executor, which had no context handling at all, moves onto
> the same machinery, and its view tools stop wasting the window.
>
> Decision record: [ADR-025](../DECISIONS.md). Builds on [phase-ex9.md](phase-ex9.md)
> (actions, shared loop, EX9.4 trimming), which it replaces for context handling.

## Why

Three UI Agent runs on a local model (`ornith:latest`, Qwen3.5 9B Q4, via Ollama) on
2026-10-22, read from `~/.headlessos/observatory/traces/`:

| Request | Result |
|---------|--------|
| Docker containers with CPU and memory | Valid view first try, 43 s. One number wrong (the model summed 16.16% as 12.16%). |
| System overview: CPU, memory, disk, network | Stopped with one of three sections filled. The last three calls each used exactly 16,384 tokens (`done_reason: length`). |
| "continue" | Read as a new request ("parse the planner command"), listed 8 directories, filled the window again, gave up. |

Causes, all in our code:

- `MAX_OLLAMA_CONTEXT = 16384` capped a model trained for 262,144. A 64K window costs
  this model about 2 GiB of KV cache (8 full-attention layers × 4 KV heads × (256+256) × 2
  bytes = 32 KiB/token) on a 16 GB GPU with 7.5 GB free.
- The UI Agent executor never trims. The EX9.4 trimming lives only in the shared loop.
- A reply cut off at the output limit was treated as "the model answered in text" and
  answered with a nudge, which made the context larger.
- Every `update_view` resends the whole view; the tool result echoes it back
  (`metadata.partialView`), so each update costs the view twice, and old versions stay.
- The view is a JSON string inside JSON arguments. gpt-4.1 broke the escaping at 3.9k
  chars; the error ("could not parse") had no position, so the model resent the same
  string five times.
- Local tools use the `openAi` JSON-schema target (every field required-but-nullable), so
  models send `null` for optional fields and the tool fails (`search_templates`).
- Token counts are `chars / 4` and never corrected by what the provider reports.
- No `num_predict`, and `think` is never set, so a thinking model can spend the reply
  budget on hidden reasoning.
- Traces price local models with a default rate ($0.16–$0.69 per run for a free model).

An earlier agent project of the author's already solved most of this; the mechanics below
follow its engine, adapted to short, tool-heavy HeadlessOS runs.

## Design

### 1. Model limits (EX10.1)

`server/src/llm/model-limits.ts` resolves, once per provider instance:

```ts
interface ModelLimits {
  contextWindow: number;      // the window everything is planned against
  source: 'owner' | 'modelfile' | 'trained' | 'auto-cap' | 'table' | 'default';
  trainedContext?: number;    // what the model was trained for (Ollama model_info)
  maxOutputTokens: number;    // num_predict / max_tokens
  kvBytesPerToken?: number;   // estimated KV cache per token (Ollama, when computable)
}
```

**Ollama: the lowest of every limit we know.**

| Input | Read from | Missing → |
|-------|-----------|-----------|
| Owner's setting | Settings → AI → Ollama → Context window (Auto, 8K, 16K, 32K, 64K, 128K), saved in `llm.json` | Auto = **65,536** |
| Modelfile `num_ctx` | `POST /api/show` → `parameters`, `^\s*num_ctx\s+(\d+)` (> 0) | ignored |
| Trained length | `POST /api/show` → `model_info` key matching `/(^\|\.)context_length$/` (not `original_context_length`) | ignored |

`contextWindow = min(present inputs)`; when `/api/show` fails and no setting exists, 8,192
(`source: 'default'`). `source` names the input that won. The earlier project takes the first
present input instead of the minimum; the minimum also stops an owner setting from going
past what the model was trained for.

Not an input: free GPU memory. Ollama does not report it and `nvidia-smi` is NVIDIA-only.
Instead the KV cache the window will cost is estimated and shown, and the loaded model is
checked:

- `kvBytesPerToken = attentionLayers × head_count_kv × (key_length + value_length) × 2`,
  `attentionLayers = block_count / full_attention_interval` when that key exists (hybrid
  models such as qwen35), else `block_count`. Unknown keys → no estimate.
- `GET /api/ps`: a loaded model with `size_vram < size` partly runs on the CPU. Settings
  shows "Part of the model runs on the CPU at this window — choose a smaller one."

**Hosted (OpenAI):** a model-name table (`gpt-4.1*` 1,047,576, `gpt-5*` 400,000,
`gpt-6*` 1,050,000, `gpt-4o*` 128,000, `o4*` 200,000), then `min(table, 128,000)`
(`HOSTED_PLAN_CAP`). Agent runs are short and every call resends the history, so a bigger
plan only costs money. Unknown model → 128,000.

**On the wire (Ollama):** every request sends `num_ctx = contextWindow` (one value per
model, so side calls never reload it at another size), `num_predict = maxOutputTokens`, and
`think: false`. A 400 whose message mentions `think` is retried once without the field and
remembered per model. `maxOutputTokens = min(max(floor(window / 8), 2048), 16384)` (8,192
at 64K), or the Modelfile's `num_predict` when it sets one. A call may ask for less.

**Real token counts:** providers already return `tokensUsed.input` (Ollama
`prompt_eval_count`, OpenAI `usage.prompt_tokens`). The context manager (§3) keeps
`overhead = round(0.5 × previous + 0.5 × max(0, real − estimate))` and adds it to every
estimate, so the `chars / 4` guess is corrected by what the model actually counted.

### 2. Context plan (EX10.2)

`server/src/agent/context/plan.ts`, a pure function of the window and the output cap
(the earlier project's compaction plan, constants unchanged so the golden numbers carry over):

```
reserve         = min(20 000, maxOutput, floor(window × 0.25))
effectiveWindow = window − reserve
trigger         = max(floor(window / 4),
                      min(floor(max(0.7 × window, effectiveWindow − 13 000)), window − maxOutput − 1024))
hard            = min(window, max(effectiveWindow − 3 000, trigger + 3 000))
keepRecent      = floor(effectiveWindow × 0.25)            tokens kept verbatim at the end
stopAt          = local: min(trigger, max(keepRecent + min(2000, window/8), floor(window × 0.55)))
                  hosted: trigger
maskChars       = clamp(floor(window × 4 × 0.01), 1 000, 8 000)   older results longer than this are stubbed first
resultChars     = clamp(floor(effectiveWindow × 4 × 0.15), 1 500, 8 000)   cap on one tool result as the model first sees it
actionBudget    = hosted 40, local clamp(floor(0.10 × window / 120), 8, 40)
tier            = window < 24 000 ? 'minimal' : window < 96 000 ? 'lean' : 'full'
```

Invariant (tested): `stopAt ≤ trigger ≤ hard ≤ window`. Worked numbers:

| Window | Out | Reserve | Trigger | Hard | Keep recent | stopAt (local) | resultChars | Actions | Tier |
|--------|-----|---------|---------|------|-------------|----------------|-------------|---------|------|
| 8,192 | 2,048 | 2,048 | 5,120 | 8,120 | 1,536 | 4,505 | 3,686 | 8 | minimal |
| 16,384 | 2,048 | 2,048 | 11,468 | 14,468 | 3,584 | 9,011 | 8,000 | 13 | minimal |
| 65,536 | 8,192 | 8,192 | 45,875 | 54,344 | 14,336 | 36,044 | 8,000 | 40 | lean |
| 128,000 (hosted) | 16,000 | 16,000 | 99,000 | 109,000 | 28,000 | — | 8,000 | 40 | full |

(The table is recomputed by `tests/agent/context/plan.test.ts`; if they ever disagree the
test is right.)

"Local" means the Ollama provider. Local backends reuse the KV cache for an unchanged
prefix, and compaction changes the prefix, so they compact rarely but deeply (`stopAt`
well below the trigger). Hosted models compact just enough.

### 3. Context manager and compaction (EX10.2)

`server/src/agent/context/manager.ts`, one per run, used by both the shared loop
(investigation agent) and the UI Agent executor:

- `prepare(messages, overheadTokens)` before every model call. `used = estimate(messages) +
  max(overheadTokens, calibrated overhead)`, where `overheadTokens` is the system prompt and
  the tool list. At or over `trigger` it compacts, cheapest layer first, until `used ≤ stopAt`:
  1. **Collapse superseded views** — the arguments of every `update_view` / `generate_schema`
     call except the latest become `{"view":"[replaced by a later update_view]"}`.
  2. **Mask** — older tool results longer than `maskChars` become
     `[output trimmed — <tool>, N chars; run it again if you need it]`.
  3. **Microcompact** — every older action result becomes that stub.
  4. **Summarize** — an LLM call (thinking off, ≤ 1,024 output tokens, input bounded to
     the effective window: first 60% / last 35% when longer) turns the older region into
     one user message: `[Original request]` verbatim, the summary, and the latest owner
     instruction. Optional: without a summarizer, or after 3 failures in a row (breaker),
     the older region is dropped with a note instead.
  5. **Drop** — the oldest groups before the shield go, with one note saying so.
  6. **Survival** — if still at or over `hard`, or the compaction was forced: the recency
     shield drops to one group, its older results are stubbed and older groups dropped.

  Kept always: the system prompt, the first user message, the latest four tool calls with
  their results (the recency shield, one in survival), and every tool result's own call.
  A layer that does not shrink the history is skipped. A forced compaction (after an
  overflow error) aims for 60% of the estimate or `stopAt`, whichever is lower: the
  provider has just said the estimate was too low.
- `observe(realInputTokens, sentEstimate)` after every call: calibrates the overhead (§1).
- `onLength()` when a reply stopped at the output limit without a usable tool call: up to 3
  times, add "Your last reply was cut off at the output limit. Send your next step as ONE
  tool call; keep update_view to the section you just filled." and force a compaction when
  `used ≥ trigger`. After 3 the run stops (reason `length`).
- An error matching `/context (length|window)|num_ctx|exceed|too long|too many tokens|maximum context/i`
  forces a compaction and retries the call, at most twice.
- Events: `context { used, window, trigger }` after every call and
  `compacted { layer, before, after }`. Both go on the Observatory span; the loop yields
  them so a UI can show occupancy later.

This replaces `agent/loop/context.ts` (EX9.4 trimming) and the never-imported
`agent/context-manager.ts` (EX2.13).

### 4. Window tiers for prompts and budgets (EX10.3)

- The investigation agent and the UI Agent executor build their system prompt for the plan's
  tier. `full` = today's prompt. `lean` drops worked examples and long explanations but keeps
  every rule. `minimal` keeps the role, the rules and a one-line-per-widget schema reference.
  Token sizes per tier are pinned by tests.
- Offered actions, the per-result cap and the history budget come from the plan, replacing
  `actionBudget()` / `modelOutputChars()` / `historyBudget()` (EX9.3/EX9.4).
- The reviewer (post-reflector) gets each tool output cut to at most 2,000 chars (60% head /
  40% tail), and all of them together cut to fit half the effective window less the view under
  review. Before, it got 500 chars each, too little to judge whether data was shown. Sending
  more would make each review on a hosted reasoning model noticeably more expensive.

### 5. UI Agent executor on the context manager (EX10.4)

- `prepare()` before every `modelRouter.chat`; `observe()` after.
- A `length` stop calls `onLength()` instead of counting a "text-only" mistake.
- When the run cannot go on (3 cut-offs, or no progress), the last partial view is validated.
  If it passes `DynamicViewSchema`, the run completes with it and a warning naming the
  empty sections and the reason ("the model's context window filled up"). Otherwise the
  error says that, instead of "Agent stopped making progress".

### 6. View tools stop wasting the window (EX10.5)

- `update_view.view` and `generate_schema.schema` accept a JSON object (preferred) or a
  JSON string. A string that fails `JSON.parse` goes through `repairJson`; if that fails too,
  the error gives the position and a 60-char excerpt: `Invalid JSON at character 3121
  (… "value": 12,} …). Fix that spot and send the view again, as an object.`
- The tool message the model gets carries `success`, `output` and `error` only.
  `metadata.partialView` / `metadata.schema` stay server-side. Outputs become short:
  `View updated: 3 sections, 7 widgets.`
- The prompts ask for the view as an object.

### 7. Tool input for every tool (EX10.6)

- Every tool's JSON schema uses the `jsonSchema7` target (optional fields stay optional), as
  action tools already do.
- Before validation, `null` values are dropped for every tool, not only actions.
- A local tool's Zod error becomes one line per issue: `search_templates: tag: expected a
  string, you sent null`.

### 8. Trace cost (EX10.7)

The trace store keeps a span's own `costUsd` when one was set (the router sets 0 for local
models) and only computes a price when none was. Unknown models are no longer priced at a
default rate: they show no cost.

### 8b. Follow-ups from the first runs on 64K (fixes to EX10.5, EX10.1, EX10.4)

Three UI Agent runs on `ornith:latest` after EX10.1–EX10.7 (2026-10-22, 02:47–02:55)
showed:

- **Views sent as strings.** Every `update_view` the model sent as an object succeeded.
  Every one sent as a string failed: a `}` where a `]` belonged, after a nested stack. The
  model resent the identical string even though the error named the spot (7 times, about
  55 s, in one run; 3 times, about 17 s, in another). The tool schema still offered
  "object or string".
- **A timeout shorter than the replies we allow.** A reply copying log lines into the view
  ran 6,920 tokens at about 58 tokens/s. Our 120 s request timeout cut it off; Ollama logged
  a 500 after 2m0s. EX10.1 allows 8,192 tokens, about 140 s at that speed. The error said
  "Ollama is not reachable", and the partial view was lost.

Fixes:

1. **(EX10.5)** View tools advertise only an object for `view` / `schema`. The schema the
   model sees comes from `AgentTool.inputSchema` when a tool sets one. Strings are still
   accepted at runtime. `repairJson` gains a step that drops a closing bracket that does
   not match the open one (outside strings), before closing what is left open.
2. **(EX10.1)** `OllamaProvider` streams (`stream: true`) and times out only on silence:
   - no first chunk within 180 s (model load and prompt evaluation), or
   - no chunk for 60 s after that.
   A long reply that keeps arriving is never cut. Errors say what happened: not reachable
   (connection failed), did not start answering, or stopped sending (with the token count
   so far). Timeouts are `LLMTimeoutError` (`llm/provider.ts`).
3. **(EX10.4)** The UI Agent executor and the shared loop treat an `LLMTimeoutError` like a
   cut-off: the same three reminders ("send a smaller step"), then the EX10.4 early stop
   with the last valid partial view. The reason is "the model kept taking too long to
   answer".

### 8c. Loops, steering errors, garbled replies and slow starts (EX10.11–EX10.13)

Three UI Agent runs on `ornith:latest` at 64K (2026-10-25, 05:44–05:51 UTC) showed:

- **Logs (135 s, empty view).** `file_tail` failed with "No such file" on `/var/log/syslog`,
  `auth.log`, `kern.log`, `daemon.log` and `messages`. The model asked for the same files
  again on every turn, 3–5 calls a turn, until the 30-step limit. The error never said what
  the folder held. The model read `dpkg.log` successfully but never put it in the view.
- **Overview (151 s).** `generate_schema` was sent 8 times with the same broken string.
  The run ended at the step limit with the last partial view, which had 6 widgets.
- **Ports (49 s).** Clean.

The executor still used the EX2 `ToolRepetitionDetector`. After 8 identical calls it
answers "try a different approach", and it never stops a run. The investigation agent has
had the EX9.4 loop guard since EX9; the executor never got it.

An earlier agent project of the author's handles this in layers, which these tasks adapt:

- **Repeats:** the same call with the same result is warned about, then refused without
  running, then the run stops. The model gets one turn to finish with what it has.
- **Errors that steer:** an error says what to do instead. A missing file says it does not
  exist, not to retry, and what is there.
- **Notes:** reminders ride on the last tool result and end "Do not reply to this note", so
  the model does not answer them as if the owner had spoken.
- **Garbled replies:** a reply that degenerates into one repeated character is cut off while
  it streams, and the model is asked again.
- **Slow starts:** before giving up on a model that has not started answering, the provider
  checks whether it is still up.

**EX10.11 Loop control in the UI Agent.**

1. The executor uses the EX9.4 `LoopGuard`. `ToolRepetitionDetector` and `maxToolRepetitions`
   are removed. Every call is folded, failures included:
   - the key is the tool and its input (the raw text when the arguments were not JSON);
   - the result is the text the model saw.
   A call that changes the server (`mutating`) still clears the history.
2. "Back to back" in the guard now means *made in the previous turn*, not only *the very last
   call*. Small models make several calls a turn, in varying order: the logs run kept
   repeating its first calls, never its last. The new rule includes the old one and applies
   to both agents.
3. The ladder is unchanged:
   - 3 identical results → a warning.
   - After that, an identical call in the next turn is not run. It gets "Not run: … already
     returned the same result N times".
   - A second refusal, or 6 identical results, stops the run.
   The guard's wording names the agent's way out: "give your answer" for the investigation
   agent, "build the view with what you have" for the UI Agent.
4. A stuck UI Agent run ends in the first of these that applies:
   - **The last partial view is valid and has no empty section.** It completes as a normal
     view (`generation_complete`, reviewed as usual). The overview run would have ended here.
   - **One wrap-up turn.** It offers only `generate_schema`, with "You are stuck repeating X.
     Stop gathering data. Call generate_schema now with the data you already have …". A
     valid view completes the run. A small model may call `update_view` instead, though it
     is not offered (it did in the 07:30 UTC run); its view counts the same.
   - **The EX10.4 early stop.** The reason is "the model kept repeating X without getting
     anything new".
   A run that runs out of steps gets the same wrap-up turn before the EX10.4 early stop.
5. Three steps before the limit, the model is told "3 steps left: call generate_schema soon
   …". The shared loop has done this since EX9.4.
6. Notes reach the model inside the last tool result:
   - in the executor, a `note` field in the JSON result;
   - in the shared loop, a trailing "Note:" paragraph after the result text.
   Each note ends "Do not reply to this note." After a text-only reply there is no tool
   result to carry it, so the note is a user message. This covers the loop warnings and the
   steps-left warning in both loops.
7. **Shared loop:** a text-only reply whose last sentence announces a next step ("Let me
   check the logs.", "I'll run …", "Next, I will …") is not taken as the answer. A note tells
   the model it did not make the call, and asks it to make the call or give the answer. This
   happens at most twice a run; after that, the text is the answer.

**EX10.12 Errors that steer.** An SFTP read action (`file_read`, `file_tail`, …) on a
missing path answers:

- **error:** `/var/log/syslog does not exist. Do not read it again; what /var/log holds is
  listed below.`
- **output**, inside `<server_output>` because the names come from the server:
  `/var/log has: alternatives.log, apt/, dpkg.log, … (and N more)`. Up to 30 names, sorted;
  folders end in `/`; secret paths are left out.

Edge cases:

- the folder is outside the read roots, or is a secret path: no listing;
- the folder does not exist either: the error says so;
- a permission error: the error says the login user cannot read the file, and not to retry.

The same goes for a view sent as a string that does not parse (`update_view`,
`generate_schema`, `validate_schema`). In a logs run after the EX10.11 loop guard was in
(07:30 UTC) the model sent three slightly different broken strings, five times in all. It
was told only where the JSON broke. Its section had no `layout`, which nothing told it.

- **Keys pushed into `sections`.** When closing the brackets leaves the view's own keys
  (`title`, `description`, `icon`, `sidebarItems`, `meta`) inside `sections`, because a
  container was closed too early, they are moved back to the top. This applies only when
  the value fits the key (a string title, an array of sidebar items), and the result is used
  only if it is a valid view, like the EX10.5 bracket repair.
- **Still not a valid view.** The error goes on to say what is wrong, up to three problems:
  `With the brackets fixed, the view still has: sections.system-logs.layout: missing or
  wrong, expected one of stack, grid, tabs.`

**EX10.13 Garbled replies and slow starts (Ollama).**

1. While a reply streams, the provider checks the text so far. If the last 400 characters
   hold at most 2 distinct characters, or end in a run of 200 identical ones, the stream is
   cancelled and `LLMDegenerateError` is thrown. Tool calls arrive whole and are not checked.
2. Both loops discard such a reply and ask again, with a note that the last reply was
   garbled and discarded. That happens at most twice a run. After that, the UI Agent stops
   early with the last valid view, and the shared loop gives its short tools-off answer.
3. A silence is checked before it is given up: no first chunk after 180 s, or no chunk for
   60 s once the reply has started. The provider asks Ollama whether it is up
   (`GET /api/ps`, 5 s):
   - **It answers.** The wait goes on, 60 s at a time:
     - for the first chunk, up to 600 s in all, since retrying would make Ollama evaluate
       the whole prompt again;
     - mid-reply, up to 900 s of silence. Ollama sends a tool call only once it is whole, so
       a long view looks like a stall. In the first run after EX10.11 (2026-10-25, 07:12
       UTC) a view was cut off after 60 s of silence, 28 tokens into the reply.
   - **It does not answer.** `LLMTimeoutError` carries `alive: false`. The loops do not ask
     for a smaller step; they end the run at once.

### 9. Later (specced here, built after EX10.7)

- **EX10.8 Action selection and data.** When slots are few, request words beat the fixed core
  set (a "network" request gets network actions). New `cpu_usage` (two `/proc/stat` samples)
  and `network_traffic` (`/proc/net/dev`) actions. Actions reuse the classic deterministic
  parsers (`free`, `df`, `ps aux`, `ss`, `ip -br addr`, `/proc/stat`, `/proc/net/dev`) so they
  return structured data.
- **EX10.9 Follow-ups.** A request sent while a view is open refines that view (the previous
  request and view go to the planner); an unclear request gets a question back instead of a
  guess.
- **EX10.10 Build views widget by widget, with server-filled data.** `add_widget(section,
  widget)` appends to a `WorkingView` (EX3-C, built but unused); widgets point at action
  results (`source: { action, path }`) and the server fills the values from parsed output and
  computes totals; `finish()` ends the run without resending the view. Needs its own ADR.

## What does not change

- The action catalog, approvals, audit log, redaction and untrusted-data marking (EX9).
- The planner/executor/reflector structure, templates, the Observatory. The EX9.4 loop guard
  keeps its ladder; EX10.11 only widens what counts as back to back and moves it into the
  executor.
- OpenAI request parameters other than `max_tokens` where a call sets it.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| EX10.1 | Model limits: min(owner setting, Modelfile `num_ctx`, trained length, 64K auto cap); hosted table; `num_ctx` / `num_predict` / `think: false` on the wire; KV estimate + CPU-spill check; Settings → AI context window | ✅ |
| EX10.2 | Context plan + context manager (layered compaction, calibration, length/overflow handling, events) in the shared loop; EX9.4 trimming and EX2.13 context manager retired | ✅ |
| EX10.3 | Window tiers for both agents' system prompts; offered actions, result caps and reviewer input from the plan | ✅ |
| EX10.4 | UI Agent executor on the context manager; cut-off handling; stop with the last good view and an honest reason | ✅ |
| EX10.5 | View tools: object or string, JSON repair, error position, no echo of the view, short outputs | ✅ |
| EX10.6 | Tool input for every tool: `jsonSchema7`, nulls dropped, one-line errors | ✅ |
| EX10.7 | Trace cost keeps the span's own cost; no default price | ✅ |
| EX10.8 | Action selection favours request words; `cpu_usage`, `network_traffic`; actions reuse deterministic parsers | ⬜ |
| EX10.9 | Follow-up requests refine the open view; unclear requests get a question | ⬜ |
| EX10.10 | Widget-by-widget building with server-filled data (`add_widget`, `WorkingView`, `finish`) — own ADR | ⬜ |
| EX10.11 | Loop control in the UI Agent: the EX9.4 loop guard in the executor (previous-turn repeats); a stuck run finishes with its view or a wrap-up turn; steps-left warning; notes on the last tool result; announced-but-not-made calls in the shared loop | ✅ |
| EX10.12 | Errors that steer: a missing file says so, says not to retry, and lists its folder | ✅ |
| EX10.13 | Garbled replies cut off and asked again; a slow start is checked before the wait is given up | ✅ |

## EX10.1 — Model limits (as built)

`server/src/llm/model-limits.ts`: `resolveOllamaLimits(facts, ownerSetting)` (pure),
`parseOllamaShow`, `kvBytesPerToken`, `fetchOllamaShow` / `probeOllamaLimits` (`POST /api/show`,
5 s timeout), `ollamaResidency` (`GET /api/ps`), `hostedLimits(model)`,
`recommendedMaxOutput(window)`, `validContextSetting`, `CONTEXT_WINDOW_OPTIONS`.
`LLMProvider.limits` is new; `OllamaProvider` takes `limits` (the old
`ollamaContextWindow()` and `MAX_OLLAMA_CONTEXT` are gone) and `OpenAIProvider.limits` /
`contextWindow` come from the table. OpenAI requests are unchanged.

On the wire every Ollama request now carries `think: false` and
`options: { num_ctx, num_predict }`; a call's own `maxTokens` overrides `num_predict`.
A 400 whose body mentions "think" is retried once without the field, and the provider
stops sending it.

The owner's window lives in `llm.json` → `ollama.contextWindow` (absent = Auto). Startup
(`index.ts`) and `PUT /api/llm/config` both resolve the limits; the log line names the
window and its source.

For `ornith:latest` (qwen35 9B, trained 262,144) on this machine: **65,536 tokens**, source
`auto-cap`, reply cap 8,192, 32 KiB/token → about 2.1 GB of KV cache at 64K. The model was
still loaded at the old 16,384 when checked; Ollama reloads it at 64K on the next request.

**Settings → AI** (Status card): a "Context window" row shows the window in use and why
(`Auto (at most 64K) · trained for 256K · cache ≈ 2.1 GB`); a "Memory" row with a
warning appears only when `/api/ps` says part of the model runs on the CPU. Below the
model list, a "Context window" row with a pill (Auto, 8K, 16K, 32K, 64K, 128K) is saved
with the provider.

**Verified in Playwright** (1440×900, signed in to Local Ubuntu Dev, nothing saved): Status
rows 52 px, the Context window row 62.5 px (like the other rows with a description), its
value flush right and centred within 0.1 px, description 13 px in the shared description
colour 2 px under the label; card insets 24.6 px at the sides, 6.6/6.7 px top/bottom. The
form row: pill 150×36, flush right, centred (0 px), 16 px from the description; card
insets as above; 20 px to the card above and to the Save button. The first description
wrapped to two lines (80.5 px row); it was shortened to one line and re-measured at
62.5 px. Only GET requests reached `/api/llm`. Session file: only `lastActiveAt` /
`nextZIndex` changed; the probe's Settings window was the only one closed.

**Follow-up (§8b fix 2).** `OllamaProvider.chat` sends `stream: true` and assembles the
NDJSON reply (`readChatStream`):
- content chunks are joined and tool calls collected;
- the final chunk gives `done_reason` and the counts;
- an `{"error": …}` line throws "Ollama answered: …";
- a mocked response without a stream body is read as one JSON object.

A `Watchdog` aborts on silence only:
- 180 s for the first chunk (`FIRST_CHUNK_TIMEOUT_MS`, option `firstChunkTimeoutMs`);
- 60 s between chunks after that (`IDLE_TIMEOUT_MS`, `idleTimeoutMs`).

The fixed 120 s `timeoutMs` is gone. Timeouts throw `LLMTimeoutError`
(`llm/provider.ts`, with `phase` and `received`) instead of "not reachable":
- "Ollama did not start answering within 180 s (ornith:latest may still be loading, or the
  prompt is very long)";
- "Ollama stopped sending for 60 s, N tokens into the reply".

"Not reachable" is now only for a failed connection. Streaming was tested against the
NDJSON format with mocked streams; no model was run here.

## EX10.2 — Context plan and manager (as built)

`server/src/agent/context/`:
- `plan.ts` — `planContext(limits)`, `planForProvider(provider)`, `windowTier(window)`.
- `tokens.ts` — `estimateTokens(messages)`, `estimateText`, `estimateToolsTokens(tools)`
  (tool list JSON / 4 + 256 for the chat template).
- `layers.ts` — pure layers: `collapseViews`, `stubResults`, `dropOldest`, `transcriptOf`, plus
  `headLength` / `groupsOf` / `shieldFrom` / `recentFrom`.
- `manager.ts` — `ContextManager` (`prepare`, `observe`, `used`, `lengthStrike` / `resetLength`,
  `isOverflowError`), `chatSummarizer(chat)` and `SUMMARY_SYSTEM`.

The wire wall differs from the earlier project on purpose: it applies `window − maxOutput − 1024`
only when the reply cap is under half the window, which on a 4K window with a 2K reply
lets prompt + reply overflow. Here it always applies, with a floor of a quarter of the
window. The worked numbers in §2 are unchanged by this.

**Shared loop** (`agent/loop/run-loop.ts`): `LoopOptions.plan` and `summarize` replace
`contextWindow` (still accepted, planned like a hosted model). Before every model call,
including the final tools-off turn, `prepare()` runs and its result becomes the history.
After every call, `observe()` runs and the loop yields
`context { used, window, trigger }` (the provider's prompt count when it gave one). Each
compaction yields `compacted { layer, before, after, forced }`. The LLM span gets
`attributes.contextUsed / contextWindow / contextTrigger / finishReason`.
- A `length` stop without a tool call drops the cut-off text and sends `CUT_OFF`. After
  three in a row, the run ends with a tools-off "answer in at most five sentences" turn
  (`final.reason: 'length'`, reported as `max_steps_reached`).
- An overflow error forces a compaction and retries the call, at most twice.

**Investigation agent:** `plan: planForProvider(provider)`;
`summarize: chatSummarizer(provider.chatWithTools)`, which uses the same model with a
1,024-token reply cap; the provider adds `think: false` on Ollama.

**Retired:** `agent/loop/context.ts` (EX9.4 `historyBudget` / `trimHistory`), and
`agent/context-manager.ts` (EX2.13), which was never imported, with its test.

## EX10.3 — Prompt tiers and plan budgets (as built)

**UI Agent executor.** The prompt blocks moved into constants. The `full` tier is
reassembled from them and is byte-for-byte the EX9 prompt (checked against a dump taken
before the change). `lean` replaces the column-type and rich-cell details with one line,
and the step-by-step workflow and worked example with a 6-line workflow. `minimal` uses
a one-line-per-shape reference and leaves out the row-button catalog for display-only
views. The tier is `context.plan.tier`; with no plan the prompt is `full`.

Measured for the same request (Docker containers, two sections):

| Tier | System prompt |
|------|---------------|
| full (hosted, or no plan) | 12,420 chars ≈ 3,105 tokens |
| lean (64K local) | 8,984 chars ≈ 2,246 tokens |
| minimal (16K local) | 3,119 chars ≈ 780 tokens |

**Investigation agent.** At the `minimal` tier, "How you work" shrinks to two lines. The
rules are the same at every tier.

**Budgets from the plan.** Both agents compute `planForProvider(...)` once per run.
Offered actions come from `plan.actionBudget` and the per-result cap from
`plan.resultChars`, and `ToolContext.plan` carries the plan to the executor and the
reviewer. `actionBudget()` and `modelOutputChars()` (EX9.3/EX9.4) are removed. The
result cap keeps EX9.4's 15% share but of the effective window: 3,686 chars at 8K
(was 4,915), 8,000 from 16K up.

**Reviewer.** `PostGenerationReflector.reflect(…, plan)` gives each output
`min(2,000, half the effective window less the view, shared)` chars, at least 300, head
and tail kept (`headAndTail`, now exported). Without a plan it keeps EX2's 500-char cut.

## EX10.4 — Executor on the context manager (as built)

`ReactiveExecutor` builds a `ContextManager` from `context.plan` (or the tool provider's
plan). Its summarizer is `chatSummarizer(modelRouter.chat)`, so a summary is one more call
to the same model.

**Every turn:**
- `prepare()` runs before the call. A compaction is reported as a progress line, e.g.
  "Made room in the model's context: shortened long old results (6,812 → 4,301 tokens)".
- `observe()` runs after the call, and the executor span gets
  `attributes.contextUsed / contextWindow / contextTrigger`.

**A reply cut off at the output limit** with no usable tool call gets `VIEW_CUT_OFF`
("Send your next step as ONE tool call. Keep views compact …") three times. It does not
count as a "text only" mistake, and the cut-off text is not kept.

**An overflow error** forces a compaction and retries the call (twice). Other errors are
thrown as before.

**Stopping early.** The executor stops in four cases: cut-offs exhausted, overflow retries
exhausted, no tool calls three turns in a row (the safety warning still fires), or the
step limit. In each case `finishEarly()` checks the last successful `update_view` against
`DynamicViewSchema`.
- **The view is valid:** the executor yields `generation_incomplete { view, reason,
  emptySections }`.
- **No valid view:** the error says why, e.g. "Stopped: the model's replies kept getting cut
  off at its output limit, before any complete view was built."

**UI Agent.**
- On `generation_incomplete` it completes with that view and skips the reviewer.
  `meta.warning` is short ("Stopped early — 1 section empty"), and
  `meta.incomplete = { reason, emptySections }`.
- If a reviewer-requested fix attempt stops early, the reviewed view is kept, with
  "The fix attempt stopped early (…); showing the earlier version".

**Client.** The completion summary moved into `components/Agent/UIAgentCompletion.tsx`.
The finished variant is unchanged. A partial run shows "View Partly Generated" in warning
colours with "Stopped early: <reason>. Still empty: <sections>."

**Verified in Playwright.** Both variants were rendered on the app's own page with its
styles, at a 520 px column, without signing in or touching any store. Both cards: 488 px
wide, 18 px radius, 16 px / 12 px padding, 16 px icon centred on the title (0 px), 8 px
icon → title, 6 px between lines, 16.7 px right inset. A long reason wraps onto two
lines (32 px) with the same insets. Session files: unchanged.

**Follow-up (§8b fix 3).** An `LLMTimeoutError` from the model call counts as a cut-off;
the two share the same three strikes.
- **UI Agent executor:** `VIEW_TIMED_OUT` ("took too long and was stopped … at most 20
  table rows or 30 log lines") and a progress line naming the timeout. On the fourth, it
  stops with the last valid partial view (reason "the model kept taking too long to
  answer").
- **Shared loop** (investigation agent): `TIMED_OUT`, then the short tools-off answer
  (`final.reason: 'length'`).
- Other errors are thrown as before.

## EX10.5 — View tools (as built)

`server/src/agent/tools/view-arg.ts`:
- `viewArgSchema` — an object first, a string still accepted.
- `readViewArg(value, name)` — an object as is; a string parsed, else `repairJson`
  (EX9.3: trailing commas, bare keys, single quotes, a cut-off end), else an error.
- `jsonErrorAt` — "Invalid JSON in view at character 3121 (… "stack" "children" …). Fix
  that spot and send the view again as a JSON object, not a string."
- `viewCounts` — counts sections and widgets, through grids and tabs.

All three view tools use it.
- `update_view` answers "View updated: 2 sections, 3 widgets. Gather the next section, or
  call generate_schema when every section is filled." It adds a note when the JSON had to
  be repaired.
- `generate_schema` answers "Schema accepted: …" instead of echoing the whole schema.
- `partialView` / `schema` stay in `metadata`.

**The executor** sends the model `{ success, output, error? }` only. No `metadata` reaches
the model (view, schema, action ids, commands, exit codes). The grep_output cache and the
UI events keep the raw output.

**Prompts.** "Pass view JSON as a STRING" and "update_view() accepts partial/incomplete
JSON" are gone. They now say "as a JSON object, not a string" and "accepts a view whose
sections are still empty — generate_schema() needs every section filled and valid". The
progressive example shows `update_view({"view": {…}})`. Its old double-stringified form
never had its placeholders filled in.

Strings still work, so the fake-mode scenarios (which send strings) pass unchanged.

**Follow-up (§8b fix 1).**
- `AgentTool.inputSchema` (new) is what `toolsToOpenAIFunctions` shows the model when set.
  The three view tools set it to an object only (`viewInputSchema`); their Zod
  `parameters` still accept a string.
- `repairJson` gains a last step, `dropMismatchedClosers`.
- The new `repairNearError(text, accept)` tries one-bracket edits near where `JSON.parse`
  stopped: remove one of the last 6 closers, or add a `]` or `}` after one of them. It
  runs up to 3 rounds, with a beam of 48.
- `readViewArg` uses a repair only when the result passes `DynamicViewSchema`. A guessed
  structure never reaches the window; otherwise the model gets the position error.
- Replayed against the 10 failed `update_view` strings from the 02:47 and 02:51 traces: 9
  now repair into the valid view the model meant. The 10th has a duplicate `"type"` key
  (a content error, not a bracket error) and is refused with its position, as intended.

## EX10.6 — Tool input for every tool (as built)

- `tool-converter.ts` uses the `jsonSchema7` target for every tool, so `search_templates`'
  optional `tag` / `command` are no longer "required, string or null".
- `loop/tool-input.ts` gains:
  - `dropNullArgs` — top-level nulls removed; nested ones stay, because view fields may be null.
  - `describeZodIssues` — the runner's one-line wording, moved here and shared.
  - `zodSignature` — `name(a, b?)`.
  - `checkToolArgs(tool, input)`.
- The shared loop (`executeToolCall`) and the UI Agent executor drop nulls for every tool.
  After the guardrails, which decide whatever the arguments are, they check a non-action
  tool's arguments. The error is "search_templates: query: expected string, you sent 42.
  Parameters: search_templates(query?, tag?, command?)" instead of a Zod JSON dump.
  Actions keep their own validation (aliases, coercion, EX9.3).
- The exact call that failed at 01:41 (`{"query":"planner","tag":null,"command":null}`) is a
  test, in both loops.

## EX10.7 — Cost (as built)

- `observatory/trace-store.ts` `endSpan` keeps the span's own `costUsd` when one was set.
  The router sets 0 for local models. Otherwise it prices models in its table and leaves
  the rest `null`; the $0.005/$0.015 per 1K default is gone.
- `llm/usage-tracker.ts` (the usage summary's estimated cost) likewise adds nothing for a
  model without a known price.
- Tokens are still counted everywhere.

The three `ornith:latest` runs priced at $0.16, $0.56 and $0.69 would now show $0.

## EX10.11 — Loop control (as built)

**Loop guard** (`agent/loop/loop-guard.ts`):

- `blocked()` checks every call of the previous turn (`previousTurn`, run or refused), not
  only the last one. `fold()` rolls the turn over; a refusal counts as a call of its turn.
- `LoopGuard({ finish })` names the agent's way out in its messages: "give your answer" by
  default, "build the view with what you have (generate_schema)" in the executor.
- The in-a-row nudge is sent once per streak. A changed result no longer re-arms it; at
  07:16 UTC it fired on each of ten `grep_output` calls.
- `announcesStep(text)`: the last sentence opens a next step ("Let me check …", "I'll run
  …", "I need to read …") with one of a list of verbs. "Let me know …" does not count.

**Notes** (`agent/loop/notes.ts`): `appendNote(messages, text)` adds the note to the last
message:
- a JSON tool result gets a `note` field;
- a text tool result gets a "Note:" paragraph, after any `</server_output>`;
- if the last message is not a tool result, the note is a user message.
`asNote` ends each note with "Do not reply to this note."

**Executor** (`agent/executor.ts`):

- `ToolRepetitionDetector` (EX2) and `maxToolRepetitions` are gone, and so is the empty
  `safety/` folder.
- Every call is folded with the text the model got, including failures, unknown tools,
  guardrail blocks and bad arguments. Arguments that do not parse are folded as `{ raw }`.
- A refused call gets `{"success":false,"error":"Not run: …"}` and a `tool_result` event.
  Findings become `safety_warning` (`tool_repetition`) events. A stop's message is the
  executor's own (`viewStuck`), not the investigation agent's.
- **A stuck run** ends in the first of these that applies:
  - `completeView(lastPartialView)`: the view is valid, has at least one sidebar item and
    no empty section → `generation_complete`.
  - `wrapUp()`: one call offering only `generate_schema`, with the stuck note (or
    `VIEW_OUT_OF_STEPS` at the step limit). An `update_view` call there counts too.
  - Any failure in the wrap-up returns null → the EX10.4 early stop, with "the model kept
    repeating X without getting anything new".
- The steps-left note comes at `maxSteps − 2` (step 28 of 30).
- `grep_output` results are no longer cached for later searches. Each search embedded the
  previous one, so its result never repeated: 13 searches in a row at 07:16, none caught.
- **EX10.13 errors:**
  - A garbled reply is dropped and asked again with `VIEW_GARBLED`, twice. After that comes
    the early stop "the model's replies kept breaking down into repeated characters".
  - `alive: false` ends the run at once, with "the model stopped answering".
- The text-only nudge is a note.

**Shared loop** (`agent/loop/run-loop.ts`):

- Loop warnings and the steps-left warning are notes. A refusal's text is not repeated in
  a note.
- A text-only reply that `announcesStep` gets `ANNOUNCED` as a note, at most `MAX_ANNOUNCED`
  (2) times a run.
- **EX10.13 errors:**
  - A garbled reply gets a `GARBLED` note and is asked again (`MAX_GARBLED` = 2). Then comes
    a tools-off answer with the final reason `garbled`; the investigation agent reports it
    as `max_steps_reached`.
  - `alive: false` → an `error` at once.

**Live** (Local Ubuntu Dev, `ornith:latest`, 64K, 2026-10-25 UTC):

| Request | Before (05:44–05:51) | After |
|---------|----------------------|-------|
| System logs | 135 s; asked for the same missing files until step 30; empty view | 07:38: 139 s, 7 widgets, complete, no warning |
| System overview | 151 s; the same broken schema 8 times; 6 widgets at the step limit | 07:41: 32 s, 10 widgets, complete (no loop arose) |

Runs in between, each of which led to a fix above:

- **07:11.** The missing-file listing worked. A view was lost to the 60 s mid-reply limit;
  this led to the EX10.13 change.
- **07:16.** `grep_output` ran 13 times in a row; this led to the cache fix and the
  once-per-streak nudge. The dev server's watcher restarted it at 07:21:16, during the
  run's last call. No file in the repo had changed, and the run's own ending, replayed
  offline, completes cleanly.
- **07:30.** `update_view` resent the same broken string. The guard warned at 3, refused,
  and stopped at 175 s. The wrap-up turn called `update_view` (now accepted) with the same
  string, and the run ended as an early stop. This led to the EX10.12 view errors.

**Benchmark** (`npm run bench:agents -- --provider ollama --model ornith:latest`, 12
questions on `fake-server`, run after the changes):

- picked 100%, answered 83% (10 of 12);
- on average 3.0 steps, 10,468 tokens and 6.1 s;
- no repaired, malformed or unknown tool calls, and no parameter errors.

The two not counted as answered (memory, failed services) stopped on repeated failures of
commands `fake-server` has no canned output for. Their hand-overs still answered: a memory
table, and `certbot.service` as the failing service. No earlier score was recorded to
compare with.

## EX10.12 — Errors that steer (as built)

`agent/actions/runner.ts`: `readFile` sends the SFTP errors of `realpath` and `stat` to
`steeringError(sftp, path, err)`.

- **No such file (SFTP status 2).** The folder is resolved with `realpath`. If it is under
  the read roots and not a secret path, it is read with `readdir`: `.`, `..` and secret
  paths are dropped, folders get a `/`, and the names are sorted. The first `LISTED_NAMES`
  (30) are shown, then "(and N more)". The listing is redacted and goes in `stdout`, so the
  model sees it inside `<server_output>`; the error says not to read the file again.
  - A missing folder gives "… and neither does <folder>."
  - Outside the roots, or when `readdir` fails, there is no listing.
- **Permission denied (status 3).** "<path> cannot be read by the login user. Do not read it
  again."
- **Anything else** is re-thrown and sanitized, as before.

`agent/tools/view-arg.ts`:

- `hoistTopLevel(value)` moves `title`, `description`, `icon`, `sidebarItems` and `meta` out
  of `sections` when the top level lacks the key and the value fits it.
- `readViewArg` tries, in order: the ladder repair, the ladder repair with keys moved back
  out, then the one-bracket move. A result is used only if it is a valid view.
- Otherwise the error ends "With the brackets fixed, the view still has: …", from
  `viewProblems`: up to three Zod issues in plain words ("missing or wrong, expected one of
  stack, grid, tabs", "missing (string)").

**Live** (Local Ubuntu Dev, `ornith:latest`, 2026-10-25):

- **07:11 logs run.** After one turn of missing files, the model read `bootstrap.log`,
  `alternatives.log`, `btmp`, `lastlog`, `faillog` and `wtmp`, names from the listing,
  instead of asking for `syslog` again. It asked for `syslog` and `kern.log` once more on
  turn 5.
- **07:30 logs run, replayed.** All three broken strings now get "sections.system-logs.layout:
  missing or wrong, expected one of stack, grid, tabs" in their error. Before, they got only
  the JSON position.
- **07:38 logs run.** The first `update_view` got that message. The next call added the
  layout and was repaired into a valid view (7 widgets), and `generate_schema` accepted it.
  The run completed in 139 s with no warning. Before EX10.11–EX10.12 the same request ended
  after 135 s with an empty view.

## EX10.13 — Garbled replies and silences (as built)

`llm/providers/ollama.ts`:

- **Garbled replies.** `isDegenerate(text)` is true when the text ends in a run of
  `DEGENERATE_RUN` (200) of one character, or when its last `DEGENERATE_WINDOW` (400)
  characters hold at most two distinct ones. `readChatStream` checks the text after every
  content chunk. On a hit it throws `LLMDegenerateError` (`llm/provider.ts`, with `received`)
  and cancels the body, which ends the request; Ollama logs "cancel task". Tool calls
  arrive whole and are not checked.
- **Silences.** `Watchdog` takes a `StallCheck`. When a wait runs out, it probes
  `GET /api/ps` (5 s):
  - up → another `STALL_STEP_MS` (60 s), until `MAX_FIRST_CHUNK_WAIT_MS` (600 s) before the
    first chunk, or `MAX_IDLE_WAIT_MS` (900 s) of silence mid-reply;
  - no answer → abort, with `alive = false`.
  A probe that returns after a chunk has arrived, or after the request ended, does nothing.
  Options: `maxFirstChunkWaitMs`, `maxIdleWaitMs`, `stallStepMs`.
- **`LLMTimeoutError.alive`** is false when the probe got no answer, true when Ollama was up
  but the ceiling was reached, and undefined when no probe ran. The messages:
  - "Ollama did not start answering within 600 s; it is running, but this prompt may be too
    long for ornith:latest on this machine"
  - "Ollama stopped answering: nothing after 180 s, and no answer to a status check"
  - "Ollama sent nothing for 900 s, N tokens into the reply; it is running, but the reply
    seems stuck"
  - "Ollama stopped answering N tokens into the reply: nothing for 60 s, and no answer to a
    status check"

How the loops answer these errors (ask again, or stop at once) is in EX10.11's code; see
"EX10.11 — as built".

**Why mid-reply silences are waited out.** The spec first kept the 60 s mid-reply limit.
The first live run after EX10.11 (07:12 UTC) lost a view to it: "Ollama stopped sending for
60 s, 28 tokens into the reply". Ollama sends a tool call only once it is whole, so a long
view looks like a stall. The retry ("send a smaller step") then produced a 739-token view.

**Verified:** with mocked streams only; no garbled reply or long silence happened in the
live runs after the change.
- A garbled stream is cut at 218 characters (18 of text, then 200 newlines), with its body
  cancelled after fewer than 400 chunks.
- A first chunk at 110 ms behind a 20 ms wait arrives, with two or more probes and one chat
  request.
- An idle pause of 110 ms behind a 20 ms wait completes the tool call.
- A dead probe stops the wait at once (first chunk and mid-reply).
- A probe that returns after the reply has started does not abort it.

## Prior art

Several mechanics in this phase follow an earlier, unpublished agent project of the author's.
Everything HeadlessOS relies on is restated in this document; nothing here depends on that
project.
