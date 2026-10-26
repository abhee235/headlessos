# Phase EX11 — Claude Models (Experimental)

> The owner can choose Claude in Settings → AI with their own Anthropic key. The models
> offered are Haiku 5.5, Sonnet 5.5 and Opus 5.5. Parsing, the AI Agent, Dynamic UI and
> the UI Agent then run on the chosen model through Anthropic's own SDK, the same way they
> run on OpenAI or a local Ollama model.
>
> Decision record: [ADR-027](../DECISIONS.md). Builds on [phase-ex9.md](phase-ex9.md)
> §8 (a second provider in Settings → AI) and [phase-ex10.md](phase-ex10.md) (the context
> plan every agent budget comes from).

## Why

The owner has an Anthropic key and wants to test the agent workflows on Claude:
- Haiku 5.5 for speed and cost;
- Sonnet 5.5 or Opus 5.5 for harder runs.

Today:
- `ModelRouter.createProvider` throws "Unsupported LLM provider" for anything but OpenAI.
- `provider.ts` lists Anthropic as a future implementation.
- Settings → AI offers only None, OpenAI and Ollama.

## Design

### 1. The provider (EX11.1)

`llm/providers/anthropic.ts`: `AnthropicProvider implements LLMProvider`, named
`anthropic`.

**Client:**
- `@anthropic-ai/sdk` 0.135, the beta Messages API, with every request streamed and read
  with `finalMessage()`.
- The key is passed in explicitly. The SDK's own lookup of `ANTHROPIC_*` environment
  variables is not used.
- The SDK retries 408/409/429/5xx and dropped connections twice.

**History → Messages API** (`toAnthropicMessages`):
- Leading `system` messages become the top-level `system`. A later one becomes user text
  (the agents never send one).
- **Assistant messages** become text and `tool_use` blocks. The input is the parsed
  arguments, repaired as for Ollama. The message's stored thinking blocks go back
  unchanged, in their original places.
- **Tool results:** consecutive `tool` messages become one user message of `tool_result`
  blocks, in order. A user message that follows them joins it as a text block after the
  results (results lead).
- **Missing pairs:** a call with no result gets one "Not run." result (`is_error`). A
  result whose call is gone (compacted away) is left out. Either one, sent as it stands,
  is a 400 on that turn and every later one.
- A history that starts with an assistant message gets a user line before it.

**Tools:**
- The OpenAI function shape becomes `{ name, description, input_schema,
  eager_input_streaming: true }`.
- `tool_choice` mapping:
  - `auto` → `auto`;
  - `none` → `none`, with the tools still sent, so the list stays the same between turns;
  - `required` → `auto`, because Opus 5.5 and Sonnet 5.5 refuse a forced call.

**Thinking:**
- Adaptive; current models cannot turn it off. Effort is `medium` on agent turns and
  `low` for parsing.
- `max_tokens` is the caller's reply cap (the context plan's), plus room for thinking:
  16K at medium, 8K at low. The total is at most 128K.
- Thinking blocks come back with empty text and a signature. They are kept on the
  assistant `ChatMessage` as `reasoning: { provider: 'anthropic', blocks }`, together with
  the reply's other blocks, so the order is known. They are sent back unchanged.
- Beta `thinking-binding-controls-2026-08-01` with
  `block_binding.prefix_mismatch_behavior: 'drop_block'` is on every request. Several
  things change the history: compaction, collapsed views, notes on tool results, and the
  wrap-up turn's smaller tool list. On accounts created from 2026-08-31, a changed history
  replayed with old thinking blocks is a 400. With `drop_block`, the API drops the stale
  blocks instead.

**Cache:**
- A 5-minute mark on the system prompt, and top-level automatic caching (the mark moves
  to the end of each request), so each step reads the run so far from the cache.
- Usage reports `input` as uncached + cache written + cache read: the whole prompt, which
  is what the context manager calibrates against.

**Replies:**

| Claude | Agents see |
|--------|------------|
| text blocks | `content` |
| `tool_use` blocks | `tool_calls` (arguments as JSON) |
| `end_turn`, `pause_turn` | `finishReason: 'stop'` |
| `tool_use` | `'tool_calls'` |
| `max_tokens`, `model_context_window_exceeded` | `'length'`; a trailing call cut off by the cap is dropped |
| `refusal` | `'content_filter'`; its calls are dropped, and the text says Claude declined (and the category) |

**Fallbacks:**
- Opus 5.5 and Sonnet 5.5 requests carry `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`). A request Anthropic's safety check declines is
  finished by another Claude model instead of stopping.
- Haiku 5.5 has no fallback.
- After a fallback switch, the first model's thinking and calls are not sent back; its
  text is.

**`parseText` / `parseImage`:**
- The schema goes into the system prompt as JSON Schema: "Reply with one JSON value that
  matches this JSON Schema, and nothing else." The reply is parsed, repaired as for
  Ollama, and checked with Zod.
- A string schema (summaries) gets plain text.
- Structured outputs are not used. The view and planner schemas use unions and recursion
  that their schema subset may not cover.
- Images go as base64 PNG blocks.

**Errors.** The SDK's typed errors become messages the owner can act on:

| Error | Message |
|-------|---------|
| 401 | "Anthropic rejected the API key" |
| 403 | "This key is not allowed to use <model>" |
| 404 | "<model> is not available to this key" |
| 429 | rate limited, after the SDK's retries |
| 529 | overloaded |

A "prompt is too long" 400 keeps its words, so the context manager's overflow path
compacts and tries again.

**Limits:** the hosted table gains `^claude-` at 1M tokens. The hosted plan cap holds it
at 128K, as for GPT-6, with a 16K reply cap.

### 2. Settings → AI, wiring, cost and benchmark (EX11.2)

**Settings file** (`llm.json`):
- `provider: 'anthropic'` and `anthropic: { model, apiKey }`, with the key encrypted like
  the OpenAI key.
- Choosing Claude keeps the OpenAI key and the Ollama settings, and choosing either of
  those keeps the Claude key and model, so switching back needs no re-entry.
- None deletes them all, as today.

**Route:**
- `PUT /api/llm/config { provider: 'anthropic', apiKey?, model }` uses a new key, or the
  one already in memory.
- Before saving, `models.retrieve(model)` checks the key, and that the key can use the
  model.
- `GET /api/llm/config` reports `provider: 'anthropic'` and the model, plus `anthropic: {
  model, hasKey }` while another provider is active.
- `GET /api/llm/models` lists `anthropic`:
  - Claude Haiku 5.5: the default, fastest and lowest cost;
  - Claude Sonnet 5.5;
  - Claude Opus 5.5.

**Wiring:**
- As with Ollama, one Claude model serves parsing, the AI Agent, Dynamic UI and every UI
  Agent role (`ModelRouter.useProvider`).
- Startup reads the saved key and model.

**Cost:**
- Traces and the usage summary price Claude per 1M tokens:

  | Model | Input | Output |
  |-------|-------|--------|
  | Haiku 5.5 | $0.10 | $0.50 |
  | Sonnet 5.5 | $2 | $10 |
  | Opus 5.5 | $4 | $20 |

- The span cost no longer reads 0 for every provider that serves all roles: only a local
  model (`limits.local`) is free.

**Client** (Settings → AI):
- A Provider row "Anthropic (Claude)", described as "Claude models through Anthropic's
  API. Prompts and server output are sent to Anthropic."
- An API Key section (`sk-ant-…`), with the same keep/replace wording as OpenAI.
- Model rows for the three models.
- Status reads Provider "Anthropic".

**Benchmark:** `npm run bench:agents -- --provider anthropic --model claude-haiku-5-5`,
with the key saved in Settings, or `ANTHROPIC_API_KEY`.

## What does not change

- OpenAI and Ollama behaviour, the prompts, the action catalog and approvals, the context
  plan and the loop guard.
- `ChatMessage` gains one optional field that only the Claude provider reads.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| EX11.1 | `AnthropicProvider`: history and tools mapped to the Messages API, thinking kept and sent back (`drop_block`), effort, caching, reply mapping, refusals and fallbacks, JSON parsing, errors, limits | ✅ |
| EX11.2 | Settings → AI: saved key and model, route with key check, startup wiring, Claude prices, client provider/key/model UI, benchmark flag | ✅ |

## EX11.1 — The provider (as built)

**Files:**
- `llm/providers/anthropic.ts` (new). Exported for tests: `toAnthropicMessages`,
  `assistantBlocks`, `toAnthropicTools`, `anthropicRequest`, `fromAnthropicReply`,
  `usageOf`, `anthropicError`, `jsonValue`, `claudeVersion`, `thinksAdaptively`.
- `llm/provider.ts`: `ChatMessage.reasoning` (`ProviderReasoning`).
- `llm/model-limits.ts`: `^claude-` in the hosted table.
- `server/package.json`: `@anthropic-ai/sdk` ^0.135.0.

**As specced, plus:**
- **Fallback blocks.** The SDK documents that a `fallback` block must be echoed back in its
  place: the server checks the boundary between the thinking before and after a switch.
  So the reply's blocks go back in order, `fallback` included. Text before a switch stays;
  calls before it never ran and are left out.
- **What gets rebuilt.** A text or call the agents changed (a collapsed view, a dropped
  call) is rebuilt from the message, and everything else goes back verbatim.
- **Thinking-only turns.** A turn that is only thinking (cut off before any text) is left
  out, since the API does not take one.
- **Reply cap.** It is 16,000 tokens (an eighth of the 128K plan, as for GPT-6), with
  thinking room added on top.
- **Older models.** Models before 4.6 get no `thinking` or `effort` settings; Settings
  offers only 5.5 models.
- **Parsing refusals.** A declined parse throws ("Claude declined to parse this."), so the
  pipeline's retry and fallback take over.

**Verified:**
- `tests/llm/anthropic.test.ts` (25), against a scripted SDK client:
  - the history mapping (grouped results, missing and orphaned pairs, no prefill);
  - thinking round trips, verbatim and after the agents' edits;
  - fallback echoes;
  - the request: thinking, `drop_block`, effort, caps, caching, fallbacks per model;
  - reply mapping: calls, cut-offs, refusals;
  - usage with cache tokens;
  - JSON parsing;
  - error wording: the overflow error still reads as overflow to the context manager;
  - one run of the shared agent loop, which sends the first reply's thinking back with
    its result.
- Not yet run against the API: that needs the owner's key (EX11.2 adds it to Settings).

## EX11.2 — Settings, wiring, cost and benchmark (as built)

**Server:**
- `llm/llm-settings-store.ts`:
  - `provider: 'anthropic'` and `anthropic: { model, apiKey }`, with the key encrypted.
  - Every save keeps the other providers' settings (OpenAI key and model, Ollama, Claude).
  - A Claude choice without an encrypted key loads as nothing.
- `routes/llm.ts`:
  - `provider: 'anthropic'` takes a new key, or the one kept in memory, and checks it with
    `AnthropicProvider.checkModel()` before anything changes.
  - `onChange` gets the provider without a key, so the UI Agent's OpenAI key stays.
  - GET reports `anthropic: { model, hasKey }`; `/api/llm/models` lists the three models.
  - A model must match `^claude-[a-z0-9-]{1,64}$`.
- `index.ts`: the saved Claude key builds an `AnthropicProvider` at startup. It is active
  when chosen, and kept for switching back otherwise. `onChange` routes every non-OpenAI
  provider to all UI Agent roles.
- `llm/model-router.ts`: span cost is 0 only for a local model (`limits.local`); Claude
  prices were added.
- `llm/usage-tracker.ts`: Claude prices. Haiku 5.5 uses its rate up to 100K tokens.
- `scripts/agent-bench.ts`: `--provider anthropic` uses the key saved in Settings, or
  `ANTHROPIC_API_KEY`.

**Client:**
- `lib/api.ts`: `LLMConfig.provider` gains `'anthropic'`, plus `anthropic`.
- `SettingsView.tsx` (AI / LLM):
  - the "Anthropic (Claude)" row;
  - a separate key field (`aria-label="Anthropic API key"`), so an OpenAI key typed
    earlier is never sent to Anthropic;
  - Claude model rows;
  - Save is enabled with a new key or a kept one;
  - Status shows Provider "Anthropic" and the key row.

**Verified:**
- **Tests:**
  - `llm-settings-store.test.ts` (+3): encryption, switches that keep the others,
    plaintext keys ignored;
  - `routes/llm.test.ts` (+5): the model list, the key check before switching, a refused
    key changing nothing, a missing key and a non-Claude model, back to the kept key after
    OpenAI, None forgetting it;
  - `model-router-spans.test.ts` (+1): Claude spans priced, local ones free;
  - `settings-ai.test.tsx` (+2): first key and model, then a model change on a kept key.
- **Suites:** server 2537 passed (+2 skipped), client 657; both typechecks clean.
- **Benchmark:** `npm run bench:agents -- --provider anthropic` without a key stops with
  "No Anthropic key: save one in Settings → AI or set ANTHROPIC_API_KEY".
- **Playwright** (1440×900, Local Ubuntu Dev, Settings → AI / LLM, nothing saved):
  - the provider rows sit at x 561.3, width 571.3, 1 px apart, like the others;
  - the Claude row is 80.5 px tall: its description wraps to two lines, in the same
    13 px / 18 px style as Ollama's (62.5 px, one line);
  - the key field matches OpenAI's: x 573.3, width 547.3, height 36, hint 16 px below;
  - model rows are 62.5 px, as OpenAI's;
  - Save stays disabled until a key is entered.
- **Against the API:** at 01:17:56 the owner saved their own key in Settings. That save
  needed `models.retrieve("claude-haiku-5-5")` to succeed, so the key check works against
  Anthropic. No agent run on Claude yet.

**Dev note:** editing `client/src/lib/api.ts` while Vite runs can leave a reload with two
copies of the stores that import it (`/src/store/window-store.ts` and
`…?t=<stamp>`). Windows then stop rendering, because `WindowManager` reads the empty copy.
Touching `client/src/store/window-store.ts`, `app-store.ts` and `lib/api.ts` (or
restarting Vite) brings back one copy.
