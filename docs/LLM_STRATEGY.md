# LLM Strategy

> How HeadlessOS uses LLMs, when to use them vs deterministic parsers, provider configuration, cost optimization, and parser migration plan.

## Philosophy

```
                    PRIORITY HIERARCHY

    ┌────────────────────────────────────────┐
    │  1. Native JSON output                 │  ← Best: command outputs JSON directly
    │     (docker --format '{{json .}}')     │     Zero cost, zero latency, perfect accuracy
    ├────────────────────────────────────────┤
    │  2. SFTP / structured APIs             │  ← sftp.readdir() returns structured data
    │     (file operations)                  │     Zero parsing needed
    ├────────────────────────────────────────┤
    │  3. Deterministic parsers              │  ← Regex/template for known command formats
    │     (df -h, ps aux, free -m)           │     <1ms, free, very reliable
    ├────────────────────────────────────────┤
    │  4. LLM text parsing                   │  ← Send raw text + Zod schema to LLM
    │     (unknown commands, complex output)  │     1-3s, costs money, but flexible
    ├────────────────────────────────────────┤
    │  5. LLM vision parsing                 │  ← Screenshot terminal, send image to LLM
    │     (ncurses apps, colored/visual UIs)  │     2-5s, more expensive, but handles anything
    └────────────────────────────────────────┘
```

**Rule:** Always use the highest-priority option available. LLM is the fallback, not the default — except during prototyping phase where LLM handles everything while deterministic parsers are being built.

## Provider Architecture

```typescript
// Core interface — every provider must implement this
interface LLMProvider {
  name: string;

  parseText<T>(input: {
    rawOutput: string;       // ANSI-stripped terminal output
    command: string;         // the command that produced it
    schema: ZodSchema<T>;   // expected output shape
    context?: string;        // optional hints
  }): Promise<ParseResult<T>>;

  parseImage<T>(input: {
    image: Buffer;           // PNG screenshot of terminal
    command: string;
    schema: ZodSchema<T>;
    context?: string;
  }): Promise<ParseResult<T>>;
}

interface ParseResult<T> {
  data: T;                   // validated, typed result
  tokensUsed: { input: number; output: number };
  latencyMs: number;
  model: string;
  cost?: number;             // estimated USD cost
}
```

## Provider Implementations

### OpenAI (Primary)

**File:** `server/src/llm/providers/openai.ts`

- Uses **Structured Outputs** API with `zodResponseFormat()`
- Guarantees response matches Zod schema exactly (not just "valid JSON")
- Recommended models:
  - **Text parsing:** `gpt-4o-mini` (fast, cheap, good enough for tabular data)
  - **Vision parsing:** `gpt-4o-mini` (supports image input)
  - **Complex parsing:** `gpt-4o` (when mini fails or output is very complex)

**Cost estimates** (per 1K parse calls, assuming ~500 input + 200 output tokens avg):

| Model | Input Cost | Output Cost | Total per 1K calls |
|-------|-----------|-------------|---------------------|
| gpt-4o-mini | $0.075 | $0.060 | ~$0.14 |
| gpt-4o | $1.25 | $1.00 | ~$2.25 |

### Anthropic (Alternative)

**File:** `server/src/llm/providers/anthropic.ts`

- Uses **tool_use** (function calling) to enforce structured output
- Define output schema as a tool's `input_schema`
- Recommended: Claude 3.5 Sonnet

### Ollama (Local / Free)

**File:** `server/src/llm/providers/ollama.ts`

- Runs models locally — **zero cost, zero latency** (TTFT <100ms on GPU)
- Requires user to install Ollama and pull a model
- Recommended models:
  - `qwen3:8b` — small, fast, good at structured extraction
  - `llama3.3:latest` — larger, better accuracy
  - `gemma3:12b` — good balance of size and quality
- JSON mode: supported via `format: "json"` in API call
- **Limitation:** No guaranteed schema conformance — must validate with Zod after

### Custom Provider

**File:** `server/src/llm/providers/custom.ts`

- Users can configure any OpenAI-compatible API endpoint
- Useful for: Azure OpenAI, vLLM, LM Studio, Together AI, etc.
- Config: `{ baseUrl: "...", apiKey: "...", model: "..." }`

## System Prompt

All LLM calls use this system prompt:

```
You are a terminal output parser for a Linux server management tool called HeadlessOS.

Given a Linux command and its raw terminal output, extract structured data according to the provided schema.

RULES:
1. Extract ONLY data that exists in the output. Never invent, guess, or hallucinate values.
2. If a value is unclear or missing, use null (if the schema allows optional/nullable) or omit it.
3. Numbers must be actual numbers, not strings — convert "15.3%" to 15.3, "4096" to 4096.
4. File sizes: if the schema expects bytes, convert human-readable sizes (e.g., "1.2G" → 1288490188).
5. Dates: use ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) when possible.
6. For tabular output: each row becomes one object in the array. Do not skip rows.
7. If the output indicates an error (command not found, permission denied), return an empty result — do not attempt to parse error messages as data.
8. Trim whitespace from string values.
```

## Parsing Pipeline

**File:** `server/src/parsers/pipeline.ts`

```
┌─────────────────────────────────────────────────────────┐
│                   ParsingPipeline                        │
│                                                         │
│   Input: (command, rawOutput, zodSchema)                │
│                                                         │
│   Step 1: Strip ANSI codes                              │
│           └─ strip-ansi library                         │
│                                                         │
│   Step 2: Check cache                                   │
│           └─ hash(rawOutput) → cache lookup             │
│           └─ if cached + TTL valid → return cached      │
│                                                         │
│   Step 3: Try deterministic parser                      │
│           └─ lookup parser by command prefix             │
│           └─ if found + parse succeeds → validate → ✅  │
│           └─ if found + parse fails → fall through      │
│                                                         │
│   Step 4: LLM parse                                     │
│           └─ send (cleanOutput, command, schema) to LLM │
│           └─ receive structured JSON                    │
│           └─ validate with Zod                          │
│           └─ if validation fails → retry once            │
│           └─ if retry fails → return error               │
│                                                         │
│   Step 5: Cache result                                  │
│           └─ store (data, outputHash, TTL) in cache     │
│                                                         │
│   Output: { data: T, parsedBy, latencyMs, cached }     │
└─────────────────────────────────────────────────────────┘
```

## Deterministic Parser Registry

File: `server/src/parsers/deterministic/`

Each parser is a simple function: `(output: string) => unknown`

| Command | Parser File | Status | Strategy |
|---------|-------------|--------|----------|
| `df -h` | `df.ts` | Phase 4 | Split lines by whitespace, skip header |
| `free -m` | `free.ts` | Phase 4 | Match "Mem:" and "Swap:" rows |
| `ps aux` | `ps.ts` | Phase 4 | Split by whitespace, max 11 fields (last field captures rest) |
| `ls -la` | `ls.ts` | Phase 4 | Regex per line, handle symlink arrows |
| `ip -brief addr` | `ip.ts` | Phase 4 | Simple 3-column split |
| `systemctl list-units` | `systemctl.ts` | Phase 4 | Column detection by header positions |
| `docker ps` | N/A | Phase 1 | Native JSON via `--format` flag |
| `docker images` | N/A | Phase 1 | Native JSON via `--format` flag |

**Registration:**
```typescript
// server/src/parsers/register-parsers.ts
import { dfParser } from './deterministic/df';
import { freeParser } from './deterministic/free';
// ...

export function registerDeterministicParsers(pipeline: ParsingPipeline) {
  pipeline.registerParser('df', dfParser);
  pipeline.registerParser('free', freeParser);
  pipeline.registerParser('ps aux', psParser);
  pipeline.registerParser('ls -la', lsParser);
  pipeline.registerParser('ip -brief', ipParser);
  pipeline.registerParser('systemctl list-units', systemctlParser);
}
```

## Cache Strategy

**Goal:** Avoid re-parsing identical output.

```typescript
interface CacheEntry<T> {
  data: T;
  outputHash: string;          // MD5 of cleaned terminal output
  parsedBy: 'deterministic' | 'llm';
  timestamp: number;
  ttlMs: number;
}
```

**Cache logic:**
1. Before parsing, compute `hash(cleanOutput)`
2. Check if cache has entry for `(serverId, command, hash)`
3. If found AND within TTL → return cached data (skip LLM entirely)
4. If output hash changed → re-parse
5. If TTL expired → re-parse

**TTL defaults:**

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| System info (hostname, kernel) | 5 minutes | Rarely changes |
| Disk usage | 30 seconds | Can change frequently |
| Memory | 15 seconds | Changes constantly |
| Docker containers | 10 seconds | State changes matter |
| File listings | 0 (manual) | Only refresh on user action |
| Processes | 10 seconds | Highly dynamic |

## Vision Pipeline

**When to use:** For commands that produce visual output (ncurses, color-dependent, box-drawing characters).

**Detection heuristic:** If terminal output contains:
- ncurses escape sequences (`\e[?1049h` — alternate screen buffer)
- Box-drawing characters (`│`, `┌`, `─`)
- Known visual tools in the command (`htop`, `top`, `nano`, `vim`, `mc`)

→ Use vision pipeline instead of text parsing.

**Implementation:**
```
1. SSH exec with PTY → stream output
2. Feed raw bytes into xterm-headless (Node.js, no DOM)
3. Use @xterm/addon-serialize to convert terminal buffer → HTML
4. Use Playwright (headless Chromium) to render HTML → PNG screenshot
5. Send PNG to LLMProvider.parseImage()
6. Receive structured JSON
```

**Optimization:** Vision pipeline is expensive. Use only when detected, never by default.

## Cost Monitoring

Track LLM usage to prevent surprise bills:

```typescript
interface LLMUsageStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  byCommand: Record<string, {
    calls: number;
    avgLatencyMs: number;
    avgInputTokens: number;
  }>;
  savedByCache: number;        // calls avoided via cache hits
  savedByDeterministic: number; // calls avoided via deterministic parsers
}
```

Expose via: `GET /api/stats/llm` — so users can see how much they're spending.

## Migration Plan: LLM → Deterministic

**Phase 1-2 (Prototype):** Everything goes through LLM (except Docker JSON).
→ Log every LLM call: command, raw output, parsed result, latency, tokens

**Phase 3 (Measurement):** Analyze logs:
- Which commands are called most frequently?
- Which outputs have the most stable format?
- What's the monthly cost projection?

**Phase 4 (Migration):** For each high-frequency, stable-format command:
1. Collect 20+ real output samples from LLM logs
2. Write deterministic parser
3. Run both parsers on all samples — compare results
4. If 100% match → register deterministic parser
5. LLM becomes fallback (used when deterministic parser throws)

**Goal:** 80% of parse calls use deterministic parsers → 80% cost reduction + 99% latency reduction for those calls.

## Error Handling & Retry Strategy

> The Command Orchestrator ([ARCHITECTURE.md § Command Orchestrator](ARCHITECTURE.md)) owns the retry loop. The parsing pipeline itself is single-shot. This table describes what the orchestrator does when things fail.

**Parse failure retry (the biggest win):**

When Zod validation fails after an LLM parse, the orchestrator retries by sending the error context back to the LLM. This works because the LLM often gets 90% of the output right but makes small type errors (e.g., returning `"15.3"` string instead of `15.3` number).

```
Attempt 1: LLM returns { cpuPercent: "15.3", memPercent: 42 }
                                      ↑ string, should be number
Zod error: "cpuPercent: expected number, received string"

Retry prompt (auto-generated by orchestrator):
  "Your previous response was almost correct but failed validation:
   Error: cpuPercent — expected number, received string.
   Original output was: [raw terminal text]
   Please return corrected JSON."

Attempt 2: LLM returns { cpuPercent: 15.3, memPercent: 42 }  ✅
```

**Full error handling table:**

| Error | Orchestrator Action | Max Retries |
|-------|-------------------|-------------|
| Zod validation fails | Retry with error context in prompt | 1 |
| LLM returns invalid JSON (not parseable) | Retry with "return valid JSON only" | 1 |
| LLM API timeout | Retry after 2s delay | 1 |
| LLM rate limit hit (429) | Queue, retry after `retry-after` header | 2 |
| API key invalid / billing issue | Return error immediately (no retry) | 0 |
| Ollama not running | Return error, suggest `ollama serve` | 0 |
| Command not found on server | Try fallback command (if defined in plan) | 1 per fallback |
| Permission denied | Return error with "may need sudo" hint | 0 |
| SSH exec timeout (>30s) | Return error for this step | 0 |
| Deterministic parser throws | Fall through to LLM (automatic) | N/A |

**Command fallback chains (defined per execution plan step):**

```typescript
// Example: network info across distros
{
  id: 'network',
  command: 'ip -brief addr',
  fallbackCommands: ['ifconfig', 'ip addr show'],
  schema: NetworkArraySchema,
  optional: true,  // dashboard works without network info
}
// Orchestrator tries: ip -brief addr → ifconfig → ip addr show → give up (optional)
```

## Configuration

```json
// ~/.headlessos/config.json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "visionModel": "gpt-4o-mini",
    "maxRetries": 1,
    "timeout": 30000,
    "maxTokens": 4096,
    "temperature": 0,

    "ollama": {
      "url": "http://localhost:11434",
      "model": "qwen3:8b"
    },

    "costAlerts": {
      "dailyLimitUsd": 1.00,
      "warningThreshold": 0.80
    }
  }
}
```
