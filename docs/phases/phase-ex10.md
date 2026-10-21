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
trigger         = floor(max(0.7 × window, effectiveWindow − 13 000))
                  if maxOutput + 1024 < window / 2: trigger = min(trigger, window − maxOutput − 1024)
hard            = min(window, max(effectiveWindow − 3 000, trigger + 3 000))
keepRecent      = floor(effectiveWindow × 0.25)            tokens kept verbatim at the end
stopAt          = local: min(trigger, max(keepRecent + min(2000, window/8), floor(window × 0.55)))
                  hosted: trigger
maskChars       = clamp(floor(window × 4 × 0.01), 1 000, 8 000)   older results longer than this are stubbed first
resultChars     = clamp(floor(effectiveWindow × 4 × 0.06), 1 500, 8 000)   cap on one tool result as the model first sees it
actionBudget    = hosted 40, local clamp(floor(0.10 × window / 120), 8, 40)
tier            = window < 24 000 ? 'minimal' : window < 96 000 ? 'lean' : 'full'
```

Invariant (tested): `stopAt ≤ trigger ≤ hard ≤ window`. Worked numbers:

| Window | Out | Reserve | Trigger | Hard | Keep recent | stopAt (local) | resultChars | Actions | Tier |
|--------|-----|---------|---------|------|-------------|----------------|-------------|---------|------|
| 8,192 | 2,048 | 2,048 | 5,120 | 8,120 | 1,536 | 4,505 | 1,500 | 8 | minimal |
| 16,384 | 2,048 | 2,048 | 11,468 | 14,468 | 3,584 | 9,011 | 3,440 | 13 | minimal |
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
  5. **Survival** — if still at or over `hard`: the recency shield drops to one group and
     the oldest groups are dropped.

  Kept always: the system prompt, the first user message, the latest four tool calls with
  their results (the recency shield), and every tool result's own call. A compaction that
  does not shrink the history is discarded.
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
- The reviewer (post-reflector) gets every tool output cut to fit half the effective window,
  60% head / 40% tail per output.

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
| EX10.1 | Model limits: min(owner setting, Modelfile `num_ctx`, trained length, 64K auto cap); hosted table; `num_ctx` / `num_predict` / `think: false` on the wire; KV estimate + CPU-spill check; Settings → AI context window | ⬜ |
| EX10.2 | Context plan + context manager (layered compaction, calibration, length/overflow handling, events) in the shared loop; EX9.4 trimming and EX2.13 context manager retired | ⬜ |
| EX10.3 | Window tiers for both agents' system prompts; offered actions, result caps and reviewer input from the plan | ⬜ |
| EX10.4 | UI Agent executor on the context manager; cut-off handling; stop with the last good view and an honest reason | ⬜ |
| EX10.5 | View tools: object or string, JSON repair, error position, no echo of the view, short outputs | ⬜ |
| EX10.6 | Tool input for every tool: `jsonSchema7`, nulls dropped, one-line errors | ⬜ |
| EX10.7 | Trace cost keeps the span's own cost; no default price | ⬜ |
| EX10.8 | Action selection favours request words; `cpu_usage`, `network_traffic`; actions reuse deterministic parsers | ⬜ |
| EX10.9 | Follow-up requests refine the open view; unclear requests get a question | ⬜ |
| EX10.10 | Widget-by-widget building with server-filled data (`add_widget`, `WorkingView`, `finish`) — own ADR | ⬜ |

## Inspiration (read-only sibling repos)

- An earlier agent project's `packages/core/src`: `llm/providers/ollama.ts` (`/api/show` detection,
  `num_ctx`/`num_predict` on the wire, `think` fallback), `context/compactionPlan.ts` (the plan
  formulas and golden tests), `context/compactor.ts` + `context/compactionLayers.ts` (layers,
  recency shield, survival, breaker, monotonicity), `llm/resilience.ts` (overflow regex,
  forced compaction + retry), `agent/agentLoop.ts` (cut-off reminder, overhead calibration),
  `llm/contextWindows.ts` (window tiers 24k/96k). ADRs 037, 038, 039, 052, 078.
- An earlier agent project: the same engine in `packages/core`; ADR-039 (one `num_ctx` per model for side
  calls), ADR-044 (KV-cache arithmetic for qwen3.5).
