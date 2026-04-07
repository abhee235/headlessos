# Phase EX2: UI Generation Agent

> **Experimental Track** — Multi-model, reactive-loop agent for generating interactive Dynamic UIs.
> This agent is the "brain" behind the Dynamic UI Engine. It plans at a high level, executes
> reactively using native function calling, self-corrects inline, and optionally reflects
> to produce high-quality `DynamicViewSchema` JSON with interactive capabilities.
>
> **ADR:** [ADR-016](../DECISIONS.md) — Multi-Model UI Generation Agent
> **Research:** [Agent Architecture Research](AGENT_RESEARCH_EX2.md) — Roo Code, Continue, Aider analysis
> **Depends on:** EX1.1 (DynamicViewSchema), EX1.2 (Renderer), EX1.7 (Template Library)
> **Task IDs:** EX2.1 – EX2.13

---

## Overview

The UI Generation Agent replaces the simple "LLM call → JSON" approach in EX1.8 with a
sophisticated **reactive agent** that:

1. **Plans** at a high level — intent, expected widgets, hints (reasoning model)
2. **Executes reactively** — LLM calls tools via native function calling in a loop, deciding
   each tool dynamically based on observed results (structured output model)
3. **Self-corrects inline** — Zod validation, SSH errors, and tool failures become tool results
   fed back into the same loop for immediate correction
4. **Reflects optionally** — post-generation quality review for complex UIs (reasoning model)
5. **Supports write-back** — editable forms that save configs back to the server

### Design Informed by Real Coding Agents

This architecture is based on deep analysis of three production coding agents:
- **Roo Code** — stack-based reactive loop, native function calling, consecutive mistake detection
- **Continue** — error-as-context-item, tool policy system, context compaction at 80%
- **Aider** — architect→editor delegation, typed reflection errors, weak model for cheap ops

See [AGENT_RESEARCH_EX2.md](AGENT_RESEARCH_EX2.md) for the full research analysis.

### Why a Reactive Loop Instead of a Single LLM Call?

A single `zodResponseFormat()` call works for simple displays (e.g., "show me disk usage").
But for complex requests like "show me the full nginx config with editable settings, validate
before saving, and show related logs" — the agent needs to:
- Run multiple commands (`nginx -T`, `cat /var/log/nginx/error.log`, `systemctl status nginx`)
- Read files via SFTP (the actual config file for editing)
- Decide which template fits best
- Generate a multi-tab UI with forms, code blocks, and log viewers
- Validate the generated schema makes sense for the data
- Handle errors gracefully (nginx not installed → suggest installing)

A rigid plan-then-execute approach (like our original design) fails here because the agent
can't predict in advance which commands will succeed, what format configs are in, or what
errors will occur. **Real coding agents** (Roo Code, Continue, Aider) all use **reactive
tool-calling loops** where the LLM observes tool results and decides the next action
dynamically — exactly what we need.

### Comparison: Current Agent vs UI Agent

| Feature | InvestigationAgent (M11.5) | UI Agent (EX2) |
|---------|---------------------------|----------------|
| Purpose | Diagnose server issues | Generate interactive UI schemas |
| Output | Text answer | `DynamicViewSchema` JSON |
| Models | Single (whatever is configured) | Multi: reasoning + structured + fast |
| Loop | Flat ReAct (think→act→observe) | Plan → Reactive Loop → Inline Reflect |
| Tool invocation | System prompt + text parsing | **Native function calling** (OpenAI `tools` param) |
| Tools | `exec_command` only | 8 tools (exec, SFTP, template, validate, grep, etc.) |
| Writing | Read-only always | Three-tier: read / write-allowlisted / deny |
| Error recovery | Retry once, then stop | Inline self-correction + fallback commands + model fallback |
| Safety rails | None | consecutiveMistakeDetection + toolRepetitionDetection + maxSteps |
| Streaming | Step text only | CoT thinking + progressive JSON + widget animations |
| Steps | Max 10 | Max 20 (configurable) |
| Self-correction | None | Zod errors fed as tool results → LLM fixes inline |
| Context management | None | Token counting + history compaction at 80% |

```
┌────────────────────────────────────────────────────────────────┐
│                     UI AGENT PIPELINE (v2 — Reactive)           │
│                                                                  │
│  User: "Show nginx config, make it editable"                    │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────┐                │
│  │  PLANNER (Reasoning Model: o3 / o4-mini)     │                │
│  │                                               │                │
│  │  1. Parse user intent                         │                │
│  │  2. Identify expected widgets & interactivity │                │
│  │  3. Suggest template if applicable            │                │
│  │  4. Classify security requirements            │                │
│  │                                               │                │
│  │  Output: PlannerHints {                       │                │
│  │    intent: "Show and edit nginx config",      │                │
│  │    expectedWidgets: ["form", "code-block"],   │                │
│  │    templateHint: "config-file",               │                │
│  │    interactivityLevel: "interactive",          │                │
│  │    securityNote: "needs sftp_read + write",   │                │
│  │    estimatedComplexity: "medium"              │                │
│  │  }                                            │                │
│  │                                               │                │
│  │  NOTE: Planner does NOT produce a step-by-    │                │
│  │  step tool list. It produces high-level hints │                │
│  │  that guide the reactive executor.            │                │
│  └──────────────────┬──────────────────────────────┘               │
│                     │ Stream: 💭 thinking steps                   │
│                     ▼                                              │
│  ┌─────────────────────────────────────────────┐                │
│  │  REACTIVE EXECUTOR (GPT-4.1 + Native Fn     │                │
│  │  Calling — stack-based loop)                  │                │
│  │                                               │                │
│  │  System prompt has: intent, hints, tools      │                │
│  │  Tools passed as ChatCompletionTool[]         │                │
│  │                                               │                │
│  │  LOOP (stack-based, max 20 iterations):       │                │
│  │    1. Call LLM with messages + tools           │                │
│  │    2. LLM responds with tool_calls OR text    │                │
│  │    3. If tool_calls:                           │                │
│  │       a. Guardrail check each call             │                │
│  │       b. Execute tool → get result             │                │
│  │       c. Send tool results as 'tool' messages │                │
│  │       d. Check safety rails:                   │                │
│  │          - consecutiveMistakeCount             │                │
│  │          - toolRepetitionDetector              │                │
│  │          - didToolFailInCurrentTurn            │                │
│  │       e. Push next iteration onto stack        │                │
│  │    4. If tool_calls includes generate_schema:  │                │
│  │       → Stream partial JSON → Zod validate     │                │
│  │       → If Zod fails: error becomes tool_result│                │
│  │         and LLM self-corrects in next turn     │                │
│  │    5. If no tool_calls and text only:           │                │
│  │       → Agent is done (final response)         │                │
│  │                                               │                │
│  │  Safety rails prevent infinite loops:          │                │
│  │    - 3 consecutive mistakes → abort with msg   │                │
│  │    - Same tool called 5x → intervene          │                │
│  │    - maxSteps (20) → force completion          │                │
│  └──────────────────┬──────────────────────────────┘               │
│                     │ Stream: 🔧 tool calls + 📦 partial schema  │
│                     ▼                                              │
│  ┌─────────────────────────────────────────────┐                │
│  │  POST-GENERATION REFLECTOR (optional)        │                │
│  │  (Reasoning Model: o4-mini)                   │                │
│  │                                               │                │
│  │  Only runs for complex UIs (interactive,      │                │
│  │  multi-tab, write-back).                      │                │
│  │                                               │                │
│  │  For simple displays: Zod validation in the   │                │
│  │  executor loop is sufficient (skip reflector). │                │
│  │                                               │                │
│  │  1. Review: does UI match collected data?      │                │
│  │  2. Check: form fields editable where needed? │                │
│  │  3. Check: writeBack configured correctly?     │                │
│  │                                               │                │
│  │  If rejected → fix instructions sent back to  │                │
│  │  executor (max 2 reflection retries)           │                │
│  └──────────────────┬──────────────────────────────┘               │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────────────┐                │
│  │  WRITE-BACK HANDLER (on user save)           │                │
│  │                                               │                │
│  │  1. Receive edited form data from frontend    │                │
│  │  2. Validate changes (run validation command) │                │
│  │  3. Write file via SFTP                       │                │
│  │  4. Reload service if configured              │                │
│  │  5. Confirm success → update UI               │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Agent Core

### EX2.1: Multi-Model Router

**Goal:** Route LLM calls to the optimal model based on task type, including a "weak" model
for cheap operations (inspired by Aider's three-model-role pattern).

**Location:** `server/src/llm/model-router.ts`

**Design:**

```typescript
export type ModelRole = 'reasoning' | 'structured-output' | 'fast' | 'weak';

export interface ModelConfig {
  reasoning: {
    provider: 'openai';
    model: string;        // e.g., 'o3', 'o4-mini'
    maxTokens: number;
  };
  structuredOutput: {
    provider: 'openai';
    model: string;        // e.g., 'gpt-4.1', 'gpt-4o'
    maxTokens: number;
  };
  fast: {
    provider: 'openai';
    model: string;        // e.g., 'gpt-4o-mini' — for simple tasks, cheap
    maxTokens: number;
  };
  weak: {
    provider: 'openai';
    model: string;        // e.g., 'gpt-4o-mini' or 'gpt-3.5-turbo' — cheapest available
    maxTokens: number;
  };
}

export class ModelRouter extends BaseService {
  private config: ModelConfig;

  /** Route a task to the appropriate model */
  getModel(role: ModelRole): LLMProvider {
    switch (role) {
      case 'reasoning':
        return this.getProvider(this.config.reasoning);
      case 'structured-output':
        return this.getProvider(this.config.structuredOutput);
      case 'fast':
        return this.getProvider(this.config.fast);
      case 'weak':
        return this.getProvider(this.config.weak);
    }
  }

  /** Parse with reasoning model (for planning, post-generation reflection) */
  async reason<T>(input: ReasoningInput<T>): Promise<ParseResult<T>> {
    return this.getModel('reasoning').parseText(input);
  }

  /** Generate structured output with native function calling (for reactive executor) */
  async chat(input: ChatWithToolsInput): Promise<ChatCompletionMessage> {
    return this.getModel('structured-output').chatWithTools(input);
  }

  /** Stream structured output (for progressive UI rendering) */
  async *stream<T>(input: StreamParseInput<T>): AsyncGenerator<string> {
    yield* this.getModel('structured-output').streamParse!(input);
  }

  /** Cheap operation — context summarization, simple classification (from Aider) */
  async summarize(input: SummarizeInput): Promise<string> {
    return this.getModel('weak').parseText({
      rawOutput: input.text,
      command: 'summarize',
      systemPrompt: 'Summarize the following conversation concisely, preserving key facts and decisions.',
    });
  }
}
```

**Model role assignment (informed by Aider's three-model pattern):**

| Task | Model Role | Example Models | Why |
|------|-----------|----------------|-----|
| Parse user intent | reasoning | o3, o4-mini | Needs understanding of nuance and context |
| High-level plan hints | reasoning | o3, o4-mini | Requires understanding what's needed |
| **Reactive tool calling** | **structured-output** | **gpt-4.1, gpt-4o** | **Native function calling + zodResponseFormat** |
| Generate DynamicViewSchema | structured-output | gpt-4.1, gpt-4o | Needs `zodResponseFormat()` for reliable JSON |
| Post-generation reflection | reasoning | o4-mini | Needs critical thinking about schema quality |
| Analyze Zod errors | fast | gpt-4o-mini | Needs speed; errors are structured context |
| **Context compaction** | **weak** | **gpt-4o-mini** | **Cheap summarization (from Aider)** |
| **Token counting / classification** | **weak** | **gpt-4o-mini** | **Simple tasks — minimize cost** |
| Simple cache lookups | none | — | No LLM needed — pure cache hit |

**Acceptance Criteria:**
- [ ] ModelRouter selects model by role
- [ ] Falls back to default model if preferred unavailable
- [ ] Configurable via server config / environment variables
- [ ] Usage tracking per model (via existing `LLMUsageTracker`)
- [ ] Unit tests: routing logic, fallback behavior

**Files:**
- `server/src/llm/model-router.ts`
- `server/src/config/models.ts` — model configuration
- Tests: `server/tests/llm/model-router.test.ts`

---

### EX2.2: Agent Tool System

**Goal:** Define the tools the agent can use, with type safety, guardrails, and native
OpenAI function calling integration.

**Location:** `server/src/agent/tools/`

**Architecture:**

```
agent/tools/
├── types.ts              # Tool interface, ToolResult type
├── tool-registry.ts      # Tool registration and lookup
├── tool-converter.ts     # Convert tools → OpenAI ChatCompletionTool[]
├── exec-command.ts       # exec_command (READ tier)
├── exec-write.ts         # exec_write_command (WRITE tier)
├── sftp-read.ts          # sftp_read
├── sftp-write.ts         # sftp_write (WRITE tier)
├── search-templates.ts   # search_templates
├── validate-schema.ts    # validate_schema (Zod validation — acts as "linter")
├── generate-schema.ts    # generate_schema (final output tool)
├── grep-output.ts        # grep_output (local, no SSH)
└── get-server-context.ts # get_server_context
```

**Tool interface:**

```typescript
// agent/tools/types.ts

export interface AgentTool {
  name: string;
  description: string;
  parameters: ZodSchema;        // Zod schema for tool arguments
  securityTier: 'read' | 'write' | 'local'; // Determines guardrail check
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  serverId: string;
  ssh: ConnectionManager;
  templateLibrary: TemplateLibrary;
  previousOutputs: Map<string, string>; // Cached command outputs for grep_output
}

export interface ToolResult {
  success: boolean;
  output: string;
  metadata?: Record<string, unknown>;
  error?: string;
}
```

**Tool definitions:**

| Tool | Security Tier | Description |
|------|--------------|-------------|
| `exec_command` | read | Run read-only command from allowlist |
| `exec_write_command` | write | Run write command from write-allowlist |
| `sftp_read` | read | Read file content via SFTP |
| `sftp_write` | write | Write file via SFTP (path must be in write-allowed paths) |
| `search_templates` | local | Search template library by tool/tags |
| `validate_schema` | local | **Validate JSON against `DynamicViewSchema` — acts as "linter" (from Aider pattern)** |
| `generate_schema` | local | **Generate final `DynamicViewSchema` — the terminal tool** |
| `grep_output` | local | Regex search within previously fetched output (no SSH) |
| `get_server_context` | read | Return cached server metadata (OS, tools, etc.) |

**Native Function Calling Integration (from Roo Code research):**

Tools are passed to the LLM as `ChatCompletionTool[]` objects. The LLM returns `tool_calls`
in its response, which we parse and execute.

```typescript
// tool-converter.ts

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export function toolsToOpenAIFunctions(tools: AgentTool[]): ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.parameters) as Record<string, unknown>,
    },
  }));
}
```

**Tool-Result-per-Tool-Use Guarantee (from Roo Code — CRITICAL):**

For OpenAI's native function calling, every `tool_calls` entry in the assistant message
MUST have a corresponding `tool` role message in the next user turn. Missing results cause
API errors. This means:

1. **Blocked tools still get a result**: If guardrails block a tool, we send back a `tool`
   message with the denial reason (not silence).
2. **Failed tools still get a result**: If a tool throws, we catch the error and send back
   a `tool` message with the error string.
3. **Every tool call is accounted for**: No exceptions.

```typescript
// In the reactive executor loop:
for (const toolCall of response.tool_calls) {
  const tool = this.toolRegistry.get(toolCall.function.name);
  let toolResult: string;

  // Guardrail check
  const guard = this.guardrails.check(tool, toolCall.function.arguments);
  if (!guard.allowed) {
    // MUST still send tool_result — with denial reason
    toolResult = JSON.stringify({
      success: false,
      error: `Tool blocked: ${guard.reason}`,
      tier: guard.tier,
    });
    didToolFailInCurrentTurn = true;
  } else {
    try {
      const result = await tool.execute(toolCall.function.arguments, context);
      toolResult = JSON.stringify(result);
      if (!result.success) didToolFailInCurrentTurn = true;
    } catch (err) {
      // MUST still send tool_result — with error
      toolResult = JSON.stringify({
        success: false,
        error: `Tool execution failed: ${(err as Error).message}`,
      });
      didToolFailInCurrentTurn = true;
    }
  }

  // Always append tool result message
  messages.push({
    role: 'tool',
    content: toolResult,
    tool_call_id: toolCall.id,
  });
}
```

**Acceptance Criteria:**
- [ ] All 9 tools implemented with Zod parameter schemas
- [ ] Tool registry with lookup by name
- [ ] Tools convert to OpenAI `ChatCompletionTool[]` format via `toolsToOpenAIFunctions()`
- [ ] **Tool-result-per-tool-use guarantee** enforced — every tool_call gets a result
- [ ] Blocked tools return denial reason as tool result (not silence)
- [ ] `validate_schema` tool acts as inline "linter" (from Aider's auto-lint pattern)
- [ ] Each tool has unit tests
- [ ] `exec_command` reuses existing `AGENT_READ_ONLY_ALLOWLIST`
- [ ] Each tool has unit tests
- [ ] `exec_command` reuses existing `AGENT_READ_ONLY_ALLOWLIST`

**Files:**
- `server/src/agent/tools/` — all tool files
- Tests: `server/tests/agent/tools/`

---

### EX2.3: Three-Tier Security Guardrails

**Goal:** Enforce read/write/deny tiers on all agent tool calls.

**Location:** `server/src/agent/guardrails.ts`

**Tiers:**

```typescript
export type SecurityTier = 'read' | 'write' | 'deny';

export interface GuardrailResult {
  allowed: boolean;
  tier: SecurityTier;
  reason?: string; // Why denied, if denied
}
```

**READ Tier (always allowed):**
- All commands from `AGENT_READ_ONLY_ALLOWLIST` (existing 50+ patterns)
- SFTP read from any path
- Local tools (template search, schema validate, grep)

**WRITE Tier (allowlisted, auto-approved):**

```typescript
const WRITE_COMMAND_ALLOWLIST: RegExp[] = [
  // Service management
  /^systemctl\s+(restart|reload|start|stop|enable|disable)\s+[\w@.-]+$/,
  /^service\s+[\w.-]+\s+(restart|reload|start|stop)$/,

  // Nginx
  /^nginx\s+-s\s+(reload|reopen|stop|quit)$/,

  // Docker
  /^docker\s+(start|stop|restart|pause|unpause)\s+[\w.-]+$/,
  /^docker\s+compose\s+(up|down|restart|stop)\s+/,

  // Package management (install/update only, not remove)
  /^apt\s+(install|update|upgrade)\s+/,
  /^yum\s+(install|update)\s+/,

  // Cron
  /^crontab\s+-l$/,     // read is always fine
  /^crontab\s+-e$/,     // edit — but actual content goes through SFTP
];

const WRITE_PATH_ALLOWLIST: RegExp[] = [
  // Config directories
  /^\/etc\/nginx\//,
  /^\/etc\/apache2\//,
  /^\/etc\/systemd\//,
  /^\/etc\/cron\.d\//,
  /^\/etc\/logrotate\.d\//,
  /^\/etc\/supervisor\//,

  // Docker configs
  /^\/opt\/[\w.-]+\/docker-compose\.ya?ml$/,
  /^\/home\/[\w.-]+\/[\w.-]+\/docker-compose\.ya?ml$/,

  // Application configs (in user home or /opt)
  /^\/home\/[\w.-]+\/\.[\w.-]+/,    // dotfiles
  /^\/opt\/[\w.-]+\/config/,         // app configs in /opt
];
```

**DENY Tier (always blocked — hardcoded, no override):**

```typescript
const DENY_COMMANDS: RegExp[] = [
  // Filesystem destruction
  /\brm\s+(-[rRfdi]+\s+)*\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
  /\brm\b.*--no-preserve-root/,

  // System shutdown
  /\bshutdown\b/,
  /\breboot\b/,
  /\binit\s+[06]\b/,
  /\bhalt\b/,
  /\bpoweroff\b/,

  // Dangerous permissions
  /\bchmod\s+(-R\s+)?777\s+\//,
  /\bchown\s+-R\s+.*\s+\//,

  // Remote code execution
  /\bwget\b.*\|\s*(sh|bash)/,
  /\bcurl\b.*\|\s*(sh|bash)/,

  // User/auth modification
  /\bpasswd\b/,
  /\busermod\b/,
  /\buserdel\b/,
  /\bsudo\s+su\b/,
  /\bvisudo\b/,

  // Fork bomb
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,

  // Critical system files
  />\s*\/etc\/(passwd|shadow|sudoers|fstab)/,

  // iptables flush (would lock out SSH)
  /\biptables\s+-F\b/,
  /\bufw\s+disable\b/,
];

const DENY_PATHS: RegExp[] = [
  /^\/etc\/(passwd|shadow|sudoers)$/,
  /^\/etc\/ssh\/sshd_config$/,
  /^\/boot\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/dev\//,
];
```

**Guardrail check flow:**

```typescript
export function checkGuardrails(tool: AgentTool, args: unknown): GuardrailResult {
  // 1. DENY check first — always checked, overrides everything
  if (isDenied(tool, args)) {
    return { allowed: false, tier: 'deny', reason: 'Command or path is in the deny list' };
  }

  // 2. Local tools — always allowed
  if (tool.securityTier === 'local') {
    return { allowed: true, tier: 'read' };
  }

  // 3. Read tier — check read allowlist
  if (tool.securityTier === 'read') {
    const readAllowed = isReadAllowed(tool, args);
    return readAllowed
      ? { allowed: true, tier: 'read' }
      : { allowed: false, tier: 'read', reason: 'Command not in read allowlist' };
  }

  // 4. Write tier — check write allowlist
  if (tool.securityTier === 'write') {
    const writeAllowed = isWriteAllowed(tool, args);
    return writeAllowed
      ? { allowed: true, tier: 'write' }
      : { allowed: false, tier: 'write', reason: 'Command/path not in write allowlist' };
  }

  return { allowed: false, tier: 'deny', reason: 'Unknown security tier' };
}
```

**Acceptance Criteria:**
- [ ] DENY tier blocks all destructive commands (comprehensive test suite)
- [ ] READ tier allows all existing investigation agent commands
- [ ] WRITE tier allows service restart, config edit, but not dangerous operations
- [ ] SFTP write validates path against `WRITE_PATH_ALLOWLIST`
- [ ] SFTP write to `/etc/passwd`, `/boot/`, etc. always denied
- [ ] Guardrails cannot be bypassed — checked at tool execution layer, not at LLM output layer
- [ ] Complete test suite covering injection attacks, path traversal, edge cases

**Files:**
- `server/src/agent/guardrails.ts`
- Tests: `server/tests/agent/guardrails.test.ts` (EXTENSIVE — most important tests in this phase)

---

### EX2.4: Planner Phase

**Goal:** Reasoning model parses user intent and produces **high-level hints** that guide the
reactive executor. The planner is the "Architect" (from Aider's pattern) — it thinks about
WHAT is needed, not HOW to do it step-by-step.

**Key design change (from research):** Real coding agents (Roo Code, Continue, Aider) do NOT
produce step-by-step tool lists upfront. The LLM in the execution loop decides tool calls
dynamically. The planner's job is to provide **context and constraints** that help the executor
make better tool choices.

**Location:** `server/src/agent/planner.ts`

**Design:**

```typescript
const PlannerHintsSchema = z.object({
  intent: z.string().describe('What the user wants, in one clear sentence'),
  interactivityLevel: z.enum(['display-only', 'interactive', 'full-management']).describe(
    'display-only = just show data; interactive = editable fields + save; full-management = CRUD operations'
  ),
  expectedWidgets: z.array(z.string()).describe(
    'Widget types we expect in the final UI (e.g., table, stat-card, form, code-block, log-viewer)'
  ),
  templateHint: z.string().optional().describe('Template ID to use as a starting point, if known'),
  dataSourceHints: z.array(z.string()).describe(
    'Types of information needed (e.g., "nginx config", "process list", "disk usage"). NOT specific commands — the executor decides commands.'
  ),
  securityRequirements: z.object({
    needsWrite: z.boolean().describe('Will the UI need write-back capability?'),
    needsSFTP: z.boolean().describe('Will the UI need to read/write files?'),
    sensitiveData: z.boolean().describe('Does this involve passwords, keys, or secrets?'),
  }),
  estimatedComplexity: z.enum(['simple', 'medium', 'complex']).describe(
    'simple = 1-2 commands, single widget; medium = 3-5 commands, multi-widget; complex = 6+ commands, tabs, forms'
  ),
  skipPostReflection: z.boolean().describe(
    'If true, Zod validation in the executor loop is sufficient — skip the post-generation reflector. True for simple display-only UIs.'
  ),
});

type PlannerHints = z.infer<typeof PlannerHintsSchema>;
```

**Planner system prompt (reasoning model):**

```typescript
const PLANNER_SYSTEM_PROMPT = `You are the planning module of HeadlessOS's UI Generation Agent.
Your job is to analyze a user's request and produce HIGH-LEVEL HINTS that guide the executor.

## IMPORTANT: You are the "Architect" — you think about WHAT, not HOW
- You do NOT produce a step-by-step tool list
- You do NOT name specific commands to run
- You describe what INFORMATION is needed, and what WIDGETS to expect
- The executor (a separate LLM with tool access) will decide which specific tools/commands to use

## Your Output
- Intent: what the user wants (one clear sentence)
- Expected widgets: what UI components should appear
- Data source hints: what categories of data are needed (not specific commands)
- Security requirements: does this need write access, SFTP, or involve secrets?
- Complexity estimate: simple / medium / complex
- Whether to skip post-generation reflection

## Interactivity Levels
- display-only: User just wants to see data (monitoring, logs, status)
- interactive: User wants to edit values and save back (configs, settings)
- full-management: User wants CRUD operations (create/delete users, manage containers)

## Examples
User: "Show me disk usage"
→ simple, display-only, expectedWidgets: [stat-card, table], dataSourceHints: ["filesystem usage"],
  skipPostReflection: true

User: "Show nginx config and let me edit it"
→ medium, interactive, expectedWidgets: [form, code-block], needsWrite: true, needsSFTP: true,
  dataSourceHints: ["nginx configuration", "nginx status"], skipPostReflection: false

User: "Manage Docker containers"
→ complex, full-management, expectedWidgets: [table, stat-card, form],
  dataSourceHints: ["container list", "docker stats", "container logs"],
  skipPostReflection: false
`;
```

**Acceptance Criteria:**
- [ ] Planner produces valid `PlannerHints` from natural language input
- [ ] Planner does NOT produce tool lists or specific commands
- [ ] Hints include correct interactivity level for the request type
- [ ] `skipPostReflection` is true for simple display-only requests
- [ ] Template hints matched when applicable
- [ ] Unit tests with diverse request types

**Files:**
- `server/src/agent/planner.ts`
- Tests: `server/tests/agent/planner.test.ts`

---

### EX2.5: Reactive Executor

**Goal:** A **reactive tool-calling loop** where the LLM decides which tools to call
dynamically, based on observed results. Uses native OpenAI function calling.

**Key design change (from research):** Every real coding agent (Roo Code, Continue, Aider)
uses a reactive loop — NOT a pre-planned sequence. The LLM receives tool definitions as
`ChatCompletionTool[]`, calls tools via `tool_calls` in its response, sees results, and
decides the next action. This is dramatically more reliable than executing a static plan.

**Location:** `server/src/agent/executor.ts`

**Design:**

```typescript
import { toolsToOpenAIFunctions } from './tools/tool-converter.js';
import { ToolRepetitionDetector } from './safety/tool-repetition-detector.js';

export interface ExecutorConfig {
  maxSteps: number;              // Default: 20
  maxConsecutiveMistakes: number; // Default: 3 (from Roo Code)
  maxToolRepetitions: number;    // Default: 5 (from Roo Code)
}

export class ReactiveExecutor {
  private toolRepetitionDetector: ToolRepetitionDetector;

  constructor(
    private modelRouter: ModelRouter,
    private toolRegistry: ToolRegistry,
    private guardrails: Guardrails,
    private config: ExecutorConfig = { maxSteps: 20, maxConsecutiveMistakes: 3, maxToolRepetitions: 5 },
  ) {
    this.toolRepetitionDetector = new ToolRepetitionDetector(config.maxToolRepetitions);
  }

  /**
   * Reactive execution loop with native function calling.
   *
   * The LLM sees all tool definitions and calls them dynamically.
   * It decides on its own which tools to call and in what order.
   * When it has enough data, it calls `generate_schema` to produce the final output.
   *
   * Inline self-correction: Zod validation failures, SSH errors, and tool blocks
   * are sent back as tool results — the LLM sees them and self-corrects.
   */
  async *execute(
    hints: PlannerHints,
    context: ToolContext,
  ): AsyncGenerator<AgentEvent> {
    const tools = this.toolRegistry.getAllForContext(hints);
    const openAITools = toolsToOpenAIFunctions(tools);

    // Build initial messages
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildExecutorSystemPrompt(hints, context) },
      { role: 'user', content: this.buildInitialUserMessage(hints) },
    ];

    let stepCount = 0;
    let consecutiveMistakes = 0;  // From Roo Code
    let didToolFailInCurrentTurn = false; // From Roo Code
    this.toolRepetitionDetector.reset();

    // ── REACTIVE LOOP ──
    while (stepCount < this.config.maxSteps) {
      stepCount++;
      didToolFailInCurrentTurn = false;

      yield { type: 'thinking', message: `Step ${stepCount}...` };

      // Call LLM with native function calling
      const response = await this.modelRouter.chat({
        messages,
        tools: openAITools,
        tool_choice: stepCount === 1 ? 'auto' : 'auto', // First step always uses tools
      });

      // Append assistant message to history
      messages.push(response);

      // ── Case 1: LLM called tools ──
      if (response.tool_calls && response.tool_calls.length > 0) {
        consecutiveMistakes = 0; // Reset — LLM is doing something

        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          const tool = this.toolRegistry.get(toolName);

          // Tool repetition detection (from Roo Code)
          const repetitionKey = JSON.stringify({ name: toolName, args: toolArgs });
          if (this.toolRepetitionDetector.isRepeating(repetitionKey)) {
            const warningResult = JSON.stringify({
              success: false,
              error: `You have called ${toolName} with the same arguments ${this.config.maxToolRepetitions} times. Please try a different approach.`,
            });
            messages.push({ role: 'tool', content: warningResult, tool_call_id: toolCall.id });
            yield { type: 'safety_warning', warning: 'tool_repetition', tool: toolName };
            continue;
          }

          // Guardrail check
          const guard = this.guardrails.check(tool, toolArgs);
          if (!guard.allowed) {
            // Tool-result-per-tool-use guarantee — always send result
            const denialResult = JSON.stringify({
              success: false,
              error: `Tool blocked by guardrails: ${guard.reason}`,
            });
            messages.push({ role: 'tool', content: denialResult, tool_call_id: toolCall.id });
            yield { type: 'tool_blocked', tool: toolName, reason: guard.reason! };
            didToolFailInCurrentTurn = true;
            continue;
          }

          // Execute tool
          const startTime = Date.now();
          try {
            const result = await tool.execute(toolArgs, context);
            const latencyMs = Date.now() - startTime;
            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: toolCall.id,
            });
            yield {
              type: 'tool_result',
              tool: toolName,
              success: result.success,
              outputPreview: result.output.substring(0, 200),
              latencyMs,
            };

            if (!result.success) didToolFailInCurrentTurn = true;

            // Cache output for grep_output tool
            if (result.success && result.output) {
              context.previousOutputs.set(
                `${toolName}:${JSON.stringify(toolArgs)}`,
                result.output,
              );
            }
          } catch (err) {
            // Tool-result-per-tool-use guarantee — always send result
            const errorResult = JSON.stringify({
              success: false,
              error: `Tool execution failed: ${(err as Error).message}`,
            });
            messages.push({ role: 'tool', content: errorResult, tool_call_id: toolCall.id });
            yield { type: 'error', message: `${toolName} failed: ${(err as Error).message}` };
            didToolFailInCurrentTurn = true;
          }
        }

        // If generate_schema was called, handle it specially
        const schemaCall = response.tool_calls.find(
          tc => tc.function.name === 'generate_schema'
        );
        if (schemaCall && !didToolFailInCurrentTurn) {
          const schema = JSON.parse(schemaCall.function.arguments);

          // Inline Zod validation — acts as "linter" (from Aider pattern)
          const zodResult = DynamicViewSchema.safeParse(schema);
          if (zodResult.success) {
            yield { type: 'generation_complete', view: zodResult.data };
            return; // Exit loop — we have a valid schema
          } else {
            // Zod error becomes a tool result → LLM self-corrects
            const zodErrorResult = JSON.stringify({
              success: false,
              error: `Schema validation failed. Fix these issues:\n${zodResult.error.message}`,
              zodErrors: zodResult.error.issues.map(i => ({
                path: i.path.join('.'),
                message: i.message,
                code: i.code,
              })),
            });
            messages.push({
              role: 'tool',
              content: zodErrorResult,
              tool_call_id: schemaCall.id,
            });
            yield { type: 'reflection', feedback: `Zod validation failed, self-correcting...`, action: 'fix' };
            // Loop continues — LLM will try to fix inline
          }
        }

        // didToolFailInCurrentTurn guard (from Roo Code):
        // If a tool failed and the LLM also tried to generate_schema, the schema
        // attempt is ignored — the LLM should handle the error first.
        // (Already handled above by the `!didToolFailInCurrentTurn` check)

      // ── Case 2: LLM responded with text only (no tool calls) ──
      } else {
        consecutiveMistakes++;

        // Consecutive mistake detection (from Roo Code)
        if (consecutiveMistakes >= this.config.maxConsecutiveMistakes) {
          yield {
            type: 'safety_warning',
            warning: 'consecutive_mistakes',
            message: `Agent has not called any tools for ${consecutiveMistakes} consecutive turns. Aborting.`,
          };
          yield {
            type: 'error',
            message: 'Agent stopped making progress. Please try rephrasing your request.',
          };
          return;
        }

        // If the LLM wrote text without calling tools, nudge it to use tools
        messages.push({
          role: 'user',
          content: 'Please use the available tools to gather information and then call generate_schema to produce the final UI. Do not just respond with text.',
        });
      }
    }

    // Max steps reached
    yield {
      type: 'error',
      message: `Agent reached maximum step limit (${this.config.maxSteps}). Returning best available result.`,
    };
  }

  private buildExecutorSystemPrompt(hints: PlannerHints, context: ToolContext): string {
    return `You are HeadlessOS's UI Generation Agent (Executor).
Your job is to gather data from a Linux server via tools and produce a DynamicViewSchema.

## User's Intent
${hints.intent}

## Expected Output
A DynamicViewSchema JSON object with these widgets: ${hints.expectedWidgets.join(', ')}
Interactivity: ${hints.interactivityLevel}
${hints.templateHint ? `Template hint: Use "${hints.templateHint}" as a starting point.` : ''}

## Data Sources Needed
${hints.dataSourceHints.map(h => `- ${h}`).join('\n')}

## Workflow
1. Call get_server_context() to understand the server
2. Use exec_command() and sftp_read() to gather information
3. Optionally search_templates() for a matching template
4. When you have enough data, call generate_schema() with a complete DynamicViewSchema
5. If generate_schema() fails Zod validation, you'll see the errors — fix and retry

## Rules
- Gather all needed data BEFORE calling generate_schema()
- Use specific commands over broad ones
- If a command fails, try a fallback (e.g., nginx -T failed → try cat /etc/nginx/nginx.conf)
- If you need to read actual file content for editing, use sftp_read()
${hints.securityRequirements.needsWrite ? '- This request may need write-back capability. Include writeBack config in form widgets.' : ''}
${hints.securityRequirements.sensitiveData ? '- This involves sensitive data. Mask passwords in the UI.' : ''}
`;
  }
}
```

**Agent event types (streamed to frontend — updated with safety events):**

```typescript
export type AgentEvent =
  | { type: 'thinking'; message: string }
  | { type: 'tool_result'; tool: string; success: boolean; outputPreview: string; latencyMs: number }
  | { type: 'tool_blocked'; tool: string; reason: string }
  | { type: 'partial_schema'; view: DeepPartial<DynamicView> }
  | { type: 'generation_complete'; view: DynamicView }
  | { type: 'reflection'; feedback: string; action: 'approve' | 'fix' }
  | { type: 'safety_warning'; warning: 'consecutive_mistakes' | 'tool_repetition'; tool?: string; message?: string }
  | { type: 'rate_limited'; retryInMs: number; attempt: number }
  | { type: 'context_compacted'; originalTokens: number; compactedTokens: number }
  | { type: 'complete'; view: DynamicView; meta: AgentMeta }
  | { type: 'error'; message: string };
```

**Acceptance Criteria:**
- [ ] Reactive loop with native function calling (not sequential plan execution)
- [ ] LLM decides tools dynamically based on observed results
- [ ] Tool-result-per-tool-use guarantee (blocked & failed tools always get results)
- [ ] `generate_schema` tool call produces DynamicViewSchema with inline Zod validation
- [ ] Zod validation failures fed back as tool results → LLM self-corrects
- [ ] `consecutiveMistakeCount` detection (3 consecutive turns without tools → abort)
- [ ] `ToolRepetitionDetector` (same tool call 5x → warning + intervention)
- [ ] `didToolFailInCurrentTurn` guard (no schema generation after tool failure)
- [ ] `maxSteps` limit (default 20 — configurable)
- [ ] All events streamed to frontend via WebSocket
- [ ] Integration tests with mocked SSH + LLM

**Files:**
- `server/src/agent/executor.ts`
- `server/src/agent/safety/tool-repetition-detector.ts` (from Roo Code pattern)
- Tests: `server/tests/agent/executor.test.ts`

---

### EX2.6: Post-Generation Reflector

**Goal:** Optional reasoning-model quality review for complex UIs. Runs AFTER the reactive
executor produces a schema. For simple display-only UIs, this is skipped — the inline Zod
validation in the executor loop is sufficient.

**Key design change (from research):** In real coding agents, "reflection" is NOT always a
separate phase. Aider and Continue both feed errors directly back into the loop. Our primary
reflection mechanism is now **inline** — Zod validation failures in the executor loop are sent
back as tool results. This post-generation reflector is a **secondary** quality gate for
complex interactive UIs only.

**Location:** `server/src/agent/reflector.ts`

**When to run:**
- **Skip** if `PlannerHints.skipPostReflection === true` (simple display-only UIs)
- **Run** if the UI is interactive, has write-back, or has multiple tabs

**Design:**

```typescript
const ReflectionSchema = z.object({
  approved: z.boolean().describe('Is the schema good enough to show the user?'),
  issues: z.array(z.object({
    severity: z.enum(['critical', 'minor', 'suggestion']),
    widget: z.string().optional().describe('Which widget has the issue (by title or index)'),
    description: z.string(),
    fix: z.string().describe('Specific instruction for fixing this issue'),
    // Typed error context from Aider's reflection pattern:
    actualData: z.string().optional().describe('What the data actually looks like'),
    didYouMean: z.string().optional().describe('Suggested correction — "did you mean X?"'),
  })).describe('Issues found with the schema. Empty if approved.'),
  summary: z.string().describe('One-line quality summary'),
});

export class PostGenerationReflector {
  constructor(private modelRouter: ModelRouter) {}

  async reflect(
    originalRequest: string,
    hints: PlannerHints,
    collectedData: Map<string, string>,
    generatedSchema: DynamicView,
  ): Promise<Reflection> {
    // Ask reasoning model to evaluate quality
    const result = await this.modelRouter.reason({
      rawOutput: JSON.stringify({
        request: originalRequest,
        hints,
        dataCollected: Object.fromEntries(collectedData),
        generatedSchema,
      }),
      command: 'agent-reflect',
      schema: ReflectionSchema,
      systemPrompt: REFLECTOR_SYSTEM_PROMPT,
    });

    return result.data;
  }
}
```

**Reflector system prompt:**

```typescript
const REFLECTOR_SYSTEM_PROMPT = `You are the quality reviewer for HeadlessOS's UI Generation Agent.
You evaluate whether a generated DynamicViewSchema is good enough to show the user.

NOTE: The schema has ALREADY passed Zod validation. You are checking semantic quality, not syntax.

## Check for:
1. Does the schema accurately represent the collected data?
2. Are widget types appropriate? (tables for lists, stat-cards for metrics, forms for editable configs)
3. If the user requested an interactive/editable UI, are there form widgets with writeBack configs?
4. Are there any missing data points that were in the collected output but not in the schema?
5. Is the layout sensible? (not too many widgets, logical grouping, good use of tabs/sidebar for complex data)
6. Are badge variants correct? (success for running/active, destructive for error/failed)

## Typed Feedback (inspired by Aider)
When reporting issues, include:
- actualData: what the data actually looks like (e.g., "CPU shows 85%")
- didYouMean: a specific suggestion (e.g., "widget.type should be 'form' not 'table' since user wants to edit")

## When to REJECT:
- Widget type doesn't match the data (e.g., chart for non-numeric data)
- User asked for editable UI but no form widgets generated
- Critical data missing from the output
- writeBack config incorrect or missing for interactive UIs

## When to APPROVE:
- Widgets match the data types
- Layout is reasonable
- Most data is represented
- Minor imperfections are OK (suggest improvements but still approve)
`;
```

**Reflection flow (simplified — max 2 post-reflection retries, down from 3):**

```
Executor reactive loop produces validated schema
  → If simple (skipPostReflection): done
  → If complex: Reflector evaluates
    → If approved → done
    → If rejected → Executor regenerates with fix instructions (max 2 retries)
      → If still failing → emit best attempt + warning
```

**Acceptance Criteria:**
- [ ] Reflector checks semantic quality (not just syntax — Zod handles that inline)
- [ ] Reflector identifies missing data in schema
- [ ] Reflector catches wrong widget types for data
- [ ] Typed error feedback with `actualData` and `didYouMean` (from Aider)
- [ ] **Skipped for simple display-only UIs** (controlled by `skipPostReflection`)
- [ ] Max 2 post-reflection retries
- [ ] Graceful degradation: after 2 failures, show best attempt with warning
- [ ] Unit tests: approval and rejection scenarios

**Files:**
- `server/src/agent/reflector.ts`
- Tests: `server/tests/agent/reflector.test.ts`

---

### EX2.7: UI Agent Orchestrator

**Goal:** The top-level agent class that orchestrates Planner → Reactive Executor → optional
Post-Generation Reflector. Uses a **stack-based loop** (from Roo Code) for the overall
execution to prevent stack overflow on long sessions.

**Location:** `server/src/agent/ui-agent.ts`

**Design:**

```typescript
/**
 * Stack-based agent loop (from Roo Code research).
 * Using an explicit stack instead of recursion prevents stack overflow
 * on long sessions with many reflection retries.
 */
interface StackItem {
  phase: 'plan' | 'execute' | 'reflect' | 're-execute';
  hints?: PlannerHints;
  view?: DynamicView;
  reflectionIssues?: ReflectionIssue[];
  attempt: number;
}

export class UIAgent extends BaseService {
  private modelRouter: ModelRouter;
  private planner: AgentPlanner;
  private executor: ReactiveExecutor;
  private reflector: PostGenerationReflector;
  private guardrails: Guardrails;
  private toolRegistry: ToolRegistry;
  private contextManager: ContextManager; // EX2.13

  public events = new EventEmitter();

  async *generate(
    serverId: string,
    request: string,
    options: UIAgentOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const sessionId = crypto.randomUUID();
    const maxPostReflections = options.maxPostReflections ?? 2;
    const startTime = Date.now();
    let totalSteps = 0;

    const context: ToolContext = {
      serverId,
      ssh: this.services.get('ssh') as ConnectionManager,
      templateLibrary: this.services.get('template-library') as TemplateLibrary,
      previousOutputs: new Map(),
    };

    // ── STACK-BASED LOOP (from Roo Code) ──
    const stack: StackItem[] = [{ phase: 'plan', attempt: 0 }];

    while (stack.length > 0) {
      const item = stack.pop()!;

      switch (item.phase) {
        // ── PLAN ──
        case 'plan': {
          yield { type: 'thinking', message: 'Understanding your request...' };
          const hints = await this.planner.plan(request, serverId);
          yield {
            type: 'thinking',
            message: `Plan: expecting ${hints.expectedWidgets.join(', ')} (${hints.estimatedComplexity})`,
          };

          stack.push({ phase: 'execute', hints, attempt: 0 });
          break;
        }

        // ── EXECUTE (reactive loop) ──
        case 'execute': {
          const hints = item.hints!;
          let generatedView: DynamicView | undefined;

          for await (const event of this.executor.execute(hints, context)) {
            yield event;
            totalSteps++;

            if (event.type === 'generation_complete') {
              generatedView = event.view;
            }
          }

          if (!generatedView) {
            yield { type: 'error', message: 'Executor did not produce a schema' };
            break; // Stack empty → done
          }

          // Decide: skip reflection or run it?
          if (hints.skipPostReflection) {
            // Simple UI — Zod validation in executor is sufficient
            const meta: AgentMeta = {
              sessionId,
              latencyMs: Date.now() - startTime,
              stepsCompleted: totalSteps,
              reflectionLoops: 0,
              modelUsage: this.modelRouter.getUsageSummary(),
            };
            yield { type: 'complete', view: generatedView, meta };
          } else {
            // Complex UI — run post-generation reflector
            stack.push({
              phase: 'reflect',
              hints,
              view: generatedView,
              attempt: 0,
            });
          }
          break;
        }

        // ── REFLECT (post-generation, optional) ──
        case 'reflect': {
          const hints = item.hints!;
          const view = item.view!;

          const reflection = await this.reflector.reflect(
            request, hints, context.previousOutputs, view,
          );

          yield {
            type: 'reflection',
            feedback: reflection.summary,
            action: reflection.approved ? 'approve' : 'fix',
          };

          if (reflection.approved) {
            const meta: AgentMeta = {
              sessionId,
              latencyMs: Date.now() - startTime,
              stepsCompleted: totalSteps,
              reflectionLoops: item.attempt + 1,
              modelUsage: this.modelRouter.getUsageSummary(),
            };
            yield { type: 'complete', view, meta };
          } else if (item.attempt < maxPostReflections - 1) {
            // Re-execute with fix instructions
            stack.push({
              phase: 're-execute',
              hints,
              reflectionIssues: reflection.issues,
              attempt: item.attempt + 1,
            });
          } else {
            // Max reflections — send best attempt
            yield {
              type: 'complete',
              view,
              meta: {
                sessionId,
                latencyMs: Date.now() - startTime,
                stepsCompleted: totalSteps,
                reflectionLoops: item.attempt + 1,
                warning: 'Schema may have quality issues — reflection could not fully resolve them',
                modelUsage: this.modelRouter.getUsageSummary(),
              },
            };
          }
          break;
        }

        // ── RE-EXECUTE (with reflection fix instructions) ──
        case 're-execute': {
          yield {
            type: 'thinking',
            message: `Fixing: ${item.reflectionIssues?.[0]?.description}`,
          };

          // Run executor again with fix context injected into system prompt
          let generatedView: DynamicView | undefined;
          for await (const event of this.executor.executeWithFixes(
            item.hints!,
            item.reflectionIssues!,
            context,
          )) {
            yield event;
            totalSteps++;
            if (event.type === 'generation_complete') {
              generatedView = event.view;
            }
          }

          if (generatedView) {
            stack.push({
              phase: 'reflect',
              hints: item.hints,
              view: generatedView,
              attempt: item.attempt,
            });
          } else {
            yield { type: 'error', message: 'Re-execution failed to produce a schema' };
          }
          break;
        }
      }
    }
  }
}
```

**Acceptance Criteria:**
- [ ] **Stack-based loop** (from Roo Code) — no recursion
- [ ] Full pipeline: Plan → Reactive Execute → optional Post-Reflect → output
- [ ] Streaming events for every phase
- [ ] Post-reflection retries up to 2 times (down from 3 — inline Zod handles most errors)
- [ ] `skipPostReflection` respected for simple display-only UIs
- [ ] Graceful degradation on max reflection
- [ ] Session tracking with usage summary
- [ ] Abort support (via AbortController)
- [ ] Integration test with mocked providers

**Files:**
- `server/src/agent/ui-agent.ts`
- Tests: `server/tests/agent/ui-agent.test.ts`

---

## Phase 2: Interactive UIs + Write-Back

### EX2.8: FormWidget Schema + Component

**Goal:** Add `form` widget type to `DynamicViewSchema` for editable fields.

**Location:** Schema in `shared/schemas/dynamic-view.ts`, Component in `client/src/components/DynamicUI/widgets/FormWidget.tsx`

**Schema:**

```typescript
export const FormFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'boolean', 'select', 'textarea', 'password']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().optional(),
  required: z.boolean().default(true),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional().describe('Options for select fields'),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional().describe('Regex pattern for text validation'),
    message: z.string().optional().describe('Custom validation error message'),
  }).optional(),
});

export const FormWidgetSchema = z.object({
  type: z.literal('form'),
  title: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
  groups: z.array(z.object({
    label: z.string(),
    fieldKeys: z.array(z.string()),
  })).optional().describe('Group fields into sections'),
  writeBack: z.object({
    type: z.enum(['config-file', 'command', 'sftp-write']),
    path: z.string().optional().describe('File path for config-file / sftp-write'),
    format: z.enum(['key-value', 'json', 'yaml', 'ini', 'nginx', 'custom']).optional(),
    validateCommand: z.string().optional().describe('Command to validate before saving, e.g., "nginx -t"'),
    reloadCommand: z.string().optional().describe('Command to run after saving, e.g., "systemctl reload nginx"'),
    customWriteTemplate: z.string().optional().describe('Template string for custom format'),
  }).optional().describe('How to save changes back to the server'),
  submitLabel: z.string().default('Save'),
  readOnly: z.boolean().default(false),
});
```

**React component:**

```tsx
// FormWidget.tsx
export function FormWidget({ widget, onSubmit }: {
  widget: FormWidgetType;
  onSubmit?: (values: Record<string, unknown>) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(widget.fields.map(f => [f.key, f.value]))
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    // Client-side validation
    const errs = validateFields(widget.fields, values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      await onSubmit?.(values);
      toast.success('Changes saved successfully');
    } catch (err) {
      toast.error('Failed to save: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        {widget.title && <CardTitle>{widget.title}</CardTitle>}
        {widget.description && <CardDescription>{widget.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {widget.fields.map(field => (
            <FormField key={field.key} field={field} value={values[field.key]} onChange={...} error={errors[field.key]} />
          ))}
        </div>
      </CardContent>
      {!widget.readOnly && (
        <CardFooter>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {widget.submitLabel}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
```

**Acceptance Criteria:**
- [ ] FormWidget schema added to `WidgetSchema` discriminated union
- [ ] All field types render correctly (text, number, boolean, select, textarea)
- [ ] Client-side validation (required, min/max, pattern)
- [ ] Submit handler calls backend write-back API
- [ ] Read-only mode disables all fields
- [ ] Field groups render as sections
- [ ] Component tests for each field type

**Files:**
- `shared/schemas/dynamic-view.ts` — updated with FormWidgetSchema
- `client/src/components/DynamicUI/widgets/FormWidget.tsx`
- Tests: `client/tests/components/DynamicUI/widgets/FormWidget.test.tsx`

---

### EX2.9: Write-Back API

**Goal:** Backend endpoint that writes form data back to the server.

**Location:** `server/src/routes/dynamic-ui.ts`

**Endpoint:**

```
POST /api/servers/:serverId/dynamic-ui/write-back
Body: {
  writeBack: WriteBackConfig,   // from the FormWidget schema
  values: Record<string, unknown>,  // edited field values
  originalValues: Record<string, unknown>, // original values (for diff)
}
Response: {
  success: boolean,
  validationOutput?: string,  // output of validateCommand
  reloadOutput?: string,      // output of reloadCommand
  error?: string,
}
```

**Write-back flow:**

```typescript
async function handleWriteBack(
  serverId: string,
  writeBack: WriteBackConfig,
  values: Record<string, unknown>,
  originalValues: Record<string, unknown>,
): Promise<WriteBackResult> {
  const ssh = container.get('ssh') as ConnectionManager;
  const guardrails = container.get('guardrails') as Guardrails;

  // 1. Security check — path must be in WRITE_PATH_ALLOWLIST
  const pathCheck = guardrails.checkPath(writeBack.path, 'write');
  if (!pathCheck.allowed) {
    throw new SecurityError(`Write to ${writeBack.path} is not allowed: ${pathCheck.reason}`);
  }

  // 2. Generate new file content from values
  const content = generateFileContent(writeBack.format, values);

  // 3. Backup original file (safety net)
  await ssh.exec(serverId, `cp ${shellEscape(writeBack.path)} ${shellEscape(writeBack.path)}.bak`);

  // 4. Write new content via SFTP
  await ssh.sftpWrite(serverId, writeBack.path, content);

  // 5. Run validation command (if configured)
  if (writeBack.validateCommand) {
    const cmdCheck = guardrails.checkCommand(writeBack.validateCommand, 'write');
    if (!cmdCheck.allowed) throw new SecurityError('Validation command not allowed');

    const validation = await ssh.exec(serverId, writeBack.validateCommand);
    if (validation.exitCode !== 0) {
      // Validation failed — restore backup
      await ssh.exec(serverId, `mv ${shellEscape(writeBack.path)}.bak ${shellEscape(writeBack.path)}`);
      return { success: false, error: `Validation failed: ${validation.stderr}`, validationOutput: validation.stdout };
    }
  }

  // 6. Run reload command (if configured)
  if (writeBack.reloadCommand) {
    const cmdCheck = guardrails.checkCommand(writeBack.reloadCommand, 'write');
    if (!cmdCheck.allowed) throw new SecurityError('Reload command not allowed');

    const reload = await ssh.exec(serverId, writeBack.reloadCommand);
    return { success: reload.exitCode === 0, reloadOutput: reload.stdout };
  }

  return { success: true };
}
```

**Key safety features:**
1. Path validated against `WRITE_PATH_ALLOWLIST`
2. Original file backed up before write (`.bak`)
3. Validation command runs BEFORE the service reloads
4. If validation fails → automatic rollback to backup
5. All commands go through guardrails

**Acceptance Criteria:**
- [ ] Write-back creates backup before writing
- [ ] Validation command failure triggers automatic rollback
- [ ] Path checked against write allowlist
- [ ] Commands checked through guardrails
- [ ] Supports config formats: key-value, JSON, YAML, INI, nginx
- [ ] Integration tests with mocked SFTP

**Files:**
- `server/src/routes/dynamic-ui.ts` — write-back endpoint
- `server/src/agent/writeback.ts` — file content generation
- Tests: `server/tests/agent/writeback.test.ts`

---

### EX2.10: Error Recovery Strategies

**Goal:** Multi-strategy error recovery so the agent can handle failures gracefully. Includes
**exponential backoff with user visibility** (from Roo Code) and **typed error context** (from Aider).

**Location:** `server/src/agent/error-recovery.ts`

**Strategies:**

```typescript
export type ErrorType =
  | 'zod_validation_failed'
  | 'ssh_command_failed'
  | 'llm_call_failed'
  | 'llm_rate_limited'       // NEW: from Roo Code
  | 'tool_blocked'
  | 'timeout'
  | 'context_overflow'       // NEW: from Continue
  | 'unknown';

export interface RecoveryStrategy {
  errorType: ErrorType;
  maxRetries: number;
  recover(error: AgentError, context: RecoveryContext): Promise<RecoveryAction>;
}

export type RecoveryAction =
  | { type: 'retry_with_context'; context: string }       // Retry same step with error info
  | { type: 'fallback_command'; command: string }          // Try alternative command
  | { type: 'fallback_model'; model: ModelRole }           // Switch to different model
  | { type: 'skip_and_continue' }                          // Skip this step, keep going
  | { type: 'partial_result'; partialView: unknown }       // Return whatever we have
  | { type: 'backoff_and_retry'; delayMs: number }         // Exponential backoff (from Roo Code)
  | { type: 'compact_context' }                            // Summarize history (from Continue)
  | { type: 'abort'; reason: string };                     // Give up
```

**Recovery examples (updated with research patterns):**

| Error | Strategy | Source |
|-------|----------|--------|
| Zod validation: `expected number, got string for cpuPercent` | Error becomes tool_result → LLM self-corrects inline (error-as-context-item) | Continue + Aider |
| SSH: `command not found: nginx` | Fallback: try `apache2ctl -t` → try `httpd -t` → inform user "nginx not installed" | Original |
| SSH: timeout | Retry once → skip step and continue with available data | Original |
| **LLM: rate limit (429)** | **Exponential backoff: 1s → 2s → 4s → 8s. Stream `rate_limited` event with countdown** | **Roo Code** |
| LLM: malformed response | Retry → retry with simpler prompt → return partial result | Original |
| **LLM: context window overflow** | **Compact history via ContextManager (EX2.13) → retry** | **Continue + Aider** |
| Tool blocked by guardrails | Denial becomes tool_result (tool-result guarantee) → LLM tries alternative | Roo Code |

**Exponential Backoff with Announcement (from Roo Code):**

```typescript
async function backoffAndRetry(
  fn: () => Promise<unknown>,
  maxRetries: number,
  onBackoff: (event: AgentEvent) => void,
): Promise<unknown> {
  let delay = 1000; // Start at 1 second
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt === maxRetries - 1) throw err;

      // Stream rate_limited event so frontend can show countdown
      onBackoff({
        type: 'rate_limited',
        retryInMs: delay,
        attempt: attempt + 1,
      });

      await sleep(delay);
      delay *= 2; // Double each time
    }
  }
}
```

**Typed Error Context (from Aider's `reflected_message`):**

When feeding errors back to the LLM, include structured context so it can fix intelligently:

```typescript
interface TypedErrorContext {
  errorType: ErrorType;
  message: string;
  actualData?: string;       // What the data looks like
  expectedFormat?: string;   // What was expected
  didYouMean?: string;       // Suggested fix: "did you mean 'table' instead of 'chart'?"
  zodPath?: string;          // e.g., "widgets.0.data.rows.2.cells.1"
}
```

**Acceptance Criteria:**
- [ ] Zod errors fed back as tool results with typed error context
- [ ] SSH command failures try fallback commands
- [ ] LLM failures retry then fall back to alternative model
- [ ] **Exponential backoff with countdown** for rate limits (from Roo Code)
- [ ] **Context overflow triggers compaction** (from Continue)
- [ ] `rate_limited` event streamed to frontend with countdown
- [ ] Typed error context with `actualData` and `didYouMean` (from Aider)
- [ ] Graceful degradation: always return something useful, even on partial failure
- [ ] Error context preserved for debugging
- [ ] Unit tests for each recovery strategy

**Files:**
- `server/src/agent/error-recovery.ts`
- Tests: `server/tests/agent/error-recovery.test.ts`

---

## Phase 3: Frontend Integration

### EX2.11: Agent UI Panel

**Goal:** Frontend panel showing agent thinking process, tool calls, and progressive UI build.
Updated to display new event types from the reactive executor.

**Location:** `client/src/components/Agent/AgentPanel.tsx`

**Layout:**

```
┌────────────────────────────────────────────────────────────┐
│  🤖 UI Agent                                    [Abort]    │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  💭 Understanding your request...                          │
│     → Intent: Show nginx config with editable settings      │
│     → Complexity: medium, Widgets: [form, code-block]       │
│                                                             │
│  🔧 get_server_context()                         ✅ 45ms  │
│     └─ Ubuntu 22.04, nginx 1.18, Docker 24.x               │
│                                                             │
│  🔧 exec_command("nginx -T")                    ✅ 340ms  │
│     └─ Got 245 lines of config output                      │
│                                                             │
│  🔧 sftp_read("/etc/nginx/nginx.conf")          ✅ 120ms  │
│     └─ Read 3.2KB config file                              │
│                                                             │
│  🔧 search_templates("config-file")              ✅ 2ms   │
│     └─ Found template: config-file                         │
│                                                             │
│  🔧 generate_schema({...})                       ✅ 1.8s  │
│     └─ Zod validation: ✅ passed                           │
│                                                             │
│  ─── or if Zod fails: ──────────────────────────────       │
│                                                             │
│  🔧 generate_schema({...})                       ⚠️ 1.8s  │
│     └─ Zod failed: widgets.0.data.rows expected array      │
│  💭 Self-correcting...                                     │
│  🔧 generate_schema({...})                       ✅ 1.2s  │
│     └─ Zod validation: ✅ passed (fixed)                   │
│                                                             │
│  ─── or if rate limited: ───────────────────────────       │
│                                                             │
│  ⏳ Rate limited. Retrying in 4s... [====    ]              │
│                                                             │
│  ─── or safety warning: ────────────────────────────       │
│                                                             │
│  ⚠️ Tool repetition detected: exec_command called 5x       │
│                                                             │
│  🔍 Post-reflection: ✅ Approved — "Schema is complete"    │
│                                                             │
├────────────────────────────────────────────────────────────┤
│  ✅ Done — 6 steps, 2.3s, $0.003 (o4-mini + GPT-4.1)     │
└────────────────────────────────────────────────────────────┘
```

**New event types to render (from research):**

| Event | Icon | UI Behavior |
|-------|------|-------------|
| `safety_warning` (consecutive_mistakes) | ⚠️ | Yellow warning badge with message |
| `safety_warning` (tool_repetition) | ⚠️ | Yellow warning showing repeated tool name |
| `rate_limited` | ⏳ | Countdown progress bar with retry time |
| `context_compacted` | 📦 | Subtle info showing token savings |

**Features:**
- Streamed thinking steps with icons (💭 thinking, 🔧 tool call, 🔍 reflection, ✅ done)
- Tool call results with timing (expandable to see full output)
- **Inline self-correction visible** — Zod failures + fixes shown in the timeline
- **Rate limit countdown** — progress bar counting down to retry
- **Safety warnings** — visible but non-blocking
- Progressive UI preview embedded in the panel
- Abort button
- Cost and model usage in footer
- Collapsible — can be minimized while the generated UI stays open

**Acceptance Criteria:**
- [ ] All agent event types rendered with appropriate styling
- [ ] Tool calls show timing and expandable output
- [ ] Progressive UI preview during generation
- [ ] Abort button works
- [ ] Cost/timing metadata in footer
- [ ] Panel is collapsible

**Files:**
- `client/src/components/Agent/AgentPanel.tsx`
- `client/src/components/Agent/AgentStepCard.tsx`
- `client/src/components/Agent/AgentMeta.tsx`
- Tests: `client/tests/components/Agent/AgentPanel.test.tsx`

---

### EX2.12: WebSocket Protocol + Hooks

**Goal:** WebSocket endpoint and React hooks for agent communication.

**Location:** Backend: `server/src/routes/agent-ui.ts`, Frontend: `client/src/hooks/useUIAgent.ts`

**WebSocket protocol (updated with new event types from research):**

```
WS /ws/ui-agent/:serverId

Client → Server:
  { type: "generate", requestId: "uuid", prompt: "show nginx config" }
  { type: "abort", requestId: "uuid" }
  { type: "write_back", requestId: "uuid", writeBack: {...}, values: {...} }

Server → Client:
  { type: "thinking", requestId: "uuid", message: "..." }
  { type: "tool_result", requestId: "uuid", tool: "...", success: true, outputPreview: "...", latencyMs: 340 }
  { type: "tool_blocked", requestId: "uuid", tool: "...", reason: "..." }
  { type: "partial_schema", requestId: "uuid", view: {...} }
  { type: "generation_complete", requestId: "uuid", view: {...} }
  { type: "reflection", requestId: "uuid", feedback: "...", action: "approve|fix" }
  { type: "safety_warning", requestId: "uuid", warning: "consecutive_mistakes|tool_repetition", tool?: "...", message?: "..." }
  { type: "rate_limited", requestId: "uuid", retryInMs: 4000, attempt: 2 }
  { type: "context_compacted", requestId: "uuid", originalTokens: 12000, compactedTokens: 3000 }
  { type: "complete", requestId: "uuid", view: {...}, meta: {...} }
  { type: "error", requestId: "uuid", message: "..." }
  { type: "write_back_result", requestId: "uuid", success: true, ... }
```

**React hook:**

```typescript
export function useUIAgent(serverId: string) {
  const [sessions, setSessions] = useState<Map<string, AgentSession>>();

  const generate = useCallback((prompt: string) => {
    const requestId = crypto.randomUUID();
    // Send generate message to WebSocket
    // Set up session tracking in state
    return requestId;
  }, []);

  const abort = useCallback((requestId: string) => {
    // Send abort message
  }, []);

  const writeBack = useCallback((requestId: string, data: WriteBackData) => {
    // Send write_back message
  }, []);

  return { generate, abort, writeBack, sessions };
}
```

**Acceptance Criteria:**
- [ ] WebSocket endpoint handles generate, abort, and write_back
- [ ] All agent events streamed to frontend in real-time
- [ ] `useUIAgent` hook manages sessions and exposes generate/abort/writeBack
- [ ] Multiple concurrent sessions supported (requestId multiplexing)
- [ ] Connection loss handled gracefully
- [ ] Integration tests

**Files:**
- `server/src/routes/agent-ui.ts`
- `client/src/hooks/useUIAgent.ts`
- `client/src/store/agent-store.ts` — Zustand store for agent sessions
- Tests: `server/tests/routes/agent-ui.test.ts`, `client/tests/hooks/useUIAgent.test.ts`

---

## EX2.13: Context Manager (NEW — from research)

**Goal:** Manage conversation history, track token usage, and compact context when approaching
the model's context window limit. Ensures long agent sessions (complex server management tasks)
don't fail due to context overflow.

**Source inspiration:**
- **Continue:** Compacts at 80% context usage — summarizes older messages, injects "continue" message
- **Aider:** Splits messages into head (older) + tail (recent), summarizes head with weak model

**Location:** `server/src/agent/context-manager.ts`

**Design:**

```typescript
export interface ContextManagerConfig {
  maxContextTokens: number;     // From model config (e.g., 128k for GPT-4.1)
  compactionThreshold: number;  // Default: 0.8 (80% — from Continue)
  preserveRecentMessages: number; // Default: 6 (keep last N messages intact)
}

export class ContextManager {
  private tokenCount = 0;

  constructor(
    private modelRouter: ModelRouter,
    private config: ContextManagerConfig,
  ) {}

  /**
   * Track tokens after each LLM call.
   * If approaching limit, trigger compaction.
   */
  async maybeCompact(
    messages: ChatCompletionMessageParam[],
  ): Promise<{
    messages: ChatCompletionMessageParam[];
    compacted: boolean;
    originalTokens: number;
    newTokens: number;
  }> {
    this.tokenCount = this.estimateTokens(messages);

    if (this.tokenCount < this.config.maxContextTokens * this.config.compactionThreshold) {
      return { messages, compacted: false, originalTokens: this.tokenCount, newTokens: this.tokenCount };
    }

    // Split: keep system prompt + recent messages, summarize the middle
    const systemMessage = messages[0]; // Always keep system prompt
    const tail = messages.slice(-this.config.preserveRecentMessages);
    const head = messages.slice(1, -this.config.preserveRecentMessages);

    if (head.length === 0) {
      return { messages, compacted: false, originalTokens: this.tokenCount, newTokens: this.tokenCount };
    }

    // Summarize with weak model (cheap — from Aider's pattern)
    const summary = await this.modelRouter.summarize({
      text: head.map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : '[complex]'}`).join('\n'),
    });

    const compactedMessages: ChatCompletionMessageParam[] = [
      systemMessage,
      {
        role: 'user',
        content: `[Context summary of ${head.length} previous messages]\n${summary}\n\n[Continue from here — the above is a summary of earlier conversation]`,
      },
      ...tail,
    ];

    const newTokens = this.estimateTokens(compactedMessages);
    return {
      messages: compactedMessages,
      compacted: true,
      originalTokens: this.tokenCount,
      newTokens,
    };
  }

  /**
   * Fast token estimation (no LLM call — from tiktoken or approximation).
   * Rule of thumb: ~4 chars per token for English text.
   */
  private estimateTokens(messages: ChatCompletionMessageParam[]): number {
    let chars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        chars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        chars += JSON.stringify(msg.content).length;
      }
      chars += 10; // Overhead per message (role, metadata)
    }
    return Math.ceil(chars / 4);
  }
}
```

**Integration in Executor:**

Context compaction is called before each LLM call in the reactive loop:

```typescript
// In ReactiveExecutor.execute():
while (stepCount < maxSteps) {
  // Check if context needs compaction
  const compaction = await this.contextManager.maybeCompact(messages);
  if (compaction.compacted) {
    messages = compaction.messages;
    yield {
      type: 'context_compacted',
      originalTokens: compaction.originalTokens,
      compactedTokens: compaction.newTokens,
    };
  }

  const response = await this.modelRouter.chat({ messages, tools, ... });
  // ... rest of loop
}
```

**Acceptance Criteria:**
- [ ] Token estimation (fast, no LLM call) within 20% accuracy
- [ ] Compaction triggers at 80% context usage
- [ ] System prompt always preserved (never summarized)
- [ ] Last N messages preserved verbatim (recent context)
- [ ] Summarization uses `weak` model role (cheap)
- [ ] `context_compacted` event streamed to frontend
- [ ] Integration with ReactiveExecutor
- [ ] Unit tests: compaction threshold, message splitting, token estimation

**Files:**
- `server/src/agent/context-manager.ts`
- Tests: `server/tests/agent/context-manager.test.ts`

---

## Dependency Graph

```
EX1.1 (DynamicViewSchema)
  │
  ├── EX2.1 (Model Router) ─────────────────────────────────┐
  │     └── includes 'weak' role for summarization            │
  │                                                           │
  ├── EX2.2 (Tool System) ──┐                                │
  │     └── native function calling + tool-result guarantee    │
  │                          │                                │
  ├── EX2.3 (Guardrails) ───┤                                │
  │                          │                                │
  │                    EX2.4 (Planner) ────┐                  │
  │                      └── high-level hints   │              │
  │                                        │                  │
  │                    EX2.5 (Executor) ───┤                  │
  │                      └── reactive loop      │              │
  │                                        │                  │
  │                    EX2.6 (Reflector) ──┘                  │
  │                      └── optional, post-gen                │
  │                                                           │
  │              EX2.13 (Context Manager) ────────────────────┤
  │                └── compaction, token tracking               │
  │                                                           │
  │                                              EX2.7 (UIAgent Orchestrator)
  │                                                │ └── stack-based loop
  │                                                │
  ├── EX2.8 (FormWidget) ── EX2.9 (WriteBack API) ┘
  │
  └── EX2.10 (Error Recovery) ── EX2.11 (Agent UI Panel) ── EX2.12 (WebSocket + Hooks)
        └── backoff, typed errors     └── new event types         └── new protocol events
```

**Build order (updated):**

```
Phase 1 (Agent Core):
  EX2.1 → EX2.2 → EX2.3 → EX2.13 → EX2.4 → EX2.5 → EX2.6 → EX2.7

Phase 2 (Interactive UIs):
  EX2.8 → EX2.9 → EX2.10

Phase 3 (Frontend Integration):
  EX2.11 → EX2.12
```

Note: EX2.13 (Context Manager) moves to early in Phase 1 because the ReactiveExecutor (EX2.5)
depends on it for token management.

---

## File Location Summary

| Location | Contents |
|----------|----------|
| `server/src/llm/model-router.ts` | Multi-model router (reasoning / structured / fast / **weak**) |
| `server/src/agent/tools/` | **9** agent tools (exec, SFTP, template, validate, generate, grep, context) |
| `server/src/agent/tools/tool-converter.ts` | **Convert tools → OpenAI ChatCompletionTool[]** |
| `server/src/agent/guardrails.ts` | Three-tier security (read / write / deny) |
| `server/src/agent/planner.ts` | Planner phase (reasoning model → **high-level hints**) |
| `server/src/agent/executor.ts` | Executor phase (**reactive tool-calling loop**) |
| `server/src/agent/safety/tool-repetition-detector.ts` | **Tool repetition detection (from Roo Code)** |
| `server/src/agent/reflector.ts` | Post-generation reflector (**optional**, semantic quality) |
| `server/src/agent/context-manager.ts` | **Context compaction + token tracking (NEW)** |
| `server/src/agent/ui-agent.ts` | Top-level orchestrator (**stack-based loop**) |
| `server/src/agent/writeback.ts` | Config file write-back with validation + rollback |
| `server/src/agent/error-recovery.ts` | Multi-strategy error recovery (**+ backoff, typed errors**) |
| `server/src/routes/agent-ui.ts` | WebSocket endpoint for agent communication |
| `client/src/components/Agent/AgentPanel.tsx` | Agent thinking/progress UI (**+ new event renders**) |
| `client/src/hooks/useUIAgent.ts` | React hook for agent sessions |
| `client/src/store/agent-store.ts` | Zustand store for agent state |
| `shared/schemas/dynamic-view.ts` | Updated with FormWidgetSchema |

---

## Success Metrics (updated with research-informed targets)

- **Schema quality:** >90% of generated schemas pass Zod validation on first attempt (inline self-correction handles rest)
- **Inline self-correction rate:** >80% of Zod failures auto-fixed within the reactive loop (no post-reflection needed)
- **Post-reflection improvement:** Reflection fixes >70% of remaining semantic issues
- **Error recovery:** >95% of requests produce some useful output (never a blank screen)
- **Safety rail accuracy:** 0 false negatives on deny-tier commands, <5% false positives on read/write
- **Write-back safety:** 0 incidents of unintended file modifications (guardrails + backup + validation)
- **Interactive rate:** >50% of generated UIs for config tools include editable forms
- **Cost efficiency:** <$0.01 average per generation (with caching, templates, and weak model for cheap ops)
- **Latency:** First widget visible in <1.5s, full view in <5s
- **Context management:** 0 context overflow failures (compaction handles all cases)
- **Infinite loop prevention:** 0 runaway agent sessions (consecutive mistake + tool repetition + maxSteps)
