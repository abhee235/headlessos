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

Two earlier agent projects (sibling repos) already solved most of this; the mechanics below follow
their engine (an earlier agent project's `packages/core/src/context/`, `llm/providers/ollama.ts`), adapted
to short, tool-heavy HeadlessOS runs.

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
(`source: 'default'`). `source` names the input that won. Two earlier agent projects take the first
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
(An earlier agent project's `planCompaction`, constants unchanged so the golden numbers carry over):

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
- The loop guard (EX9.4), the planner/executor/reflector structure, templates, the Observatory.
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

## EX10.2 — Context plan and manager (as built)

`server/src/agent/context/`:
- `plan.ts` — `planContext(limits)`, `planForProvider(provider)`, `windowTier(window)`.
- `tokens.ts` — `estimateTokens(messages)`, `estimateText`, `estimateToolsTokens(tools)`
  (tool list JSON / 4 + 256 for the chat template).
- `layers.ts` — pure layers: `collapseViews`, `stubResults`, `dropOldest`, `transcriptOf`, plus
  `headLength` / `groupsOf` / `shieldFrom` / `recentFrom`.
- `manager.ts` — `ContextManager` (`prepare`, `observe`, `used`, `lengthStrike` / `resetLength`,
  `isOverflowError`), `chatSummarizer(chat)` and `SUMMARY_SYSTEM`.

The wire wall differs from an earlier agent project on purpose: an earlier agent project applies `window − maxOutput − 1024`
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

## Inspiration (read-only sibling repos)

- An earlier agent project's `packages/core/src`: `llm/providers/ollama.ts` (`/api/show` detection,
  `num_ctx`/`num_predict` on the wire, `think` fallback), `context/compactionPlan.ts` (the plan
  formulas and golden tests), `context/compactor.ts` + `context/compactionLayers.ts` (layers,
  recency shield, survival, breaker, monotonicity), `llm/resilience.ts` (overflow regex,
  forced compaction + retry), `agent/agentLoop.ts` (cut-off reminder, overhead calibration),
  `llm/contextWindows.ts` (window tiers 24k/96k). ADRs 037, 038, 039, 052, 078.
- An earlier agent project: the same engine in `packages/core`; ADR-039 (one `num_ctx` per model for side
  calls), ADR-044 (KV-cache arithmetic for qwen3.5).
