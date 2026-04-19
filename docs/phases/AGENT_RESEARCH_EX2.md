# Agent Architecture Research — Lessons for EX2

> Research conducted on 3 major open-source coding agents to inform the UI Agent design.
> All repos cloned to `temp/` for deep source-code analysis.

---

## Repos Studied

| Agent | Repo | Language | Architecture |
|-------|------|----------|-------------|
| **Roo Code** (v3.x) | `temp/roo-code/` | TypeScript | VS Code extension, recursive tool-calling loop |
| **Continue** (v1.x) | `temp/continue/` | TypeScript | IDE-agnostic core + VS Code/JetBrains extensions |
| **Aider** (v0.7x) | `temp/aider/` | Python | Terminal-based, polymorphic coder class hierarchy |

---

## Critical Design Insight: Reactive Loop > Rigid Plan

**Our original EX2 design** had a 3-phase pipeline: Planner creates a full execution plan → Executor runs all steps sequentially → Reflector checks quality.

**What every real agent does instead:** The LLM decides tool calls **in real-time** via native function calling. It's a **reactive loop** — call a tool, observe the result, decide the next tool based on what it sees. The "plan" is emergent from the LLM's chain-of-thought, not a pre-determined JSON array.

### Evidence from Each Agent

**Roo Code:** One giant `while` loop where the LLM is called, it responds with tool calls, tools execute, results feed back as the next user message, and the LLM decides the next step. No upfront planning.

**Continue:** Same pattern — `while (toolCalls.length > 0) { callTools → feedResults → getLLMResponse }`. The "shouldContinue" flag is simply whether the LLM called any tools.

**Aider:** The LLM generates edits inline. If edits fail to apply, the error is fed back as a "reflection" and the LLM tries again. No upfront planning phase — just edit → validate → retry.

### How We Should Adapt

We keep the **Plan → Execute → Reflect** structure because our use case genuinely benefits from upfront planning (SSH commands on remote servers have real consequences). But the Executor phase must change from "run a static plan" to a **reactive tool-calling loop**:

```
Plan (reasoning model)
  → High-level intent, expected widgets, template hint
  → NOT a step-by-step tool list

Execute (structured output model with native function calling)
  → Reactive loop: LLM calls tools dynamically
  → LLM sees tool results and decides next action
  → Generates DynamicViewSchema when it has enough data

Reflect (reasoning model)
  → Quality check on the generated schema
  → Fix instructions if rejected
```

---

## Top Patterns to Adopt (Ranked by Impact)

### 1. Native Function Calling as Primary Tool Invocation
**Source:** Roo Code + Continue (both use OpenAI function calling exclusively)

The LLM receives tool definitions as `ChatCompletionTool[]` objects and returns `tool_calls` in its response. This is dramatically more reliable than asking the LLM to output tool calls as JSON/XML in its text response.

**Implication for EX2:** The Executor should use `tools` parameter + `tool_choice: "auto"` in the OpenAI API call. The LLM naturally alternates between text (thinking) and tool calls. We parse `tool_calls` from the streaming response, execute them, and send results back as `tool` role messages.

```typescript
// BEFORE (our original design — Planner outputs a tool list)
const plan = await planner.plan(request); // LLM outputs JSON array of steps
for (const step of plan.steps) { ... }   // Sequential execution

// AFTER (reactive loop with native function calling)
while (!done) {
  const response = await llm.chat({
    messages: history,
    tools: toolDefinitions,
    tool_choice: 'auto',
  });
  // LLM decides on its own which tools to call
  for (const toolCall of response.tool_calls) {
    const result = await executeTool(toolCall);
    history.push({ role: 'tool', content: result, tool_call_id: toolCall.id });
  }
  if (response.tool_calls.length === 0) done = true;
}
```

### 2. Stack-Based Loop (Not Recursion)
**Source:** Roo Code (`Task.ts` line 2506)

Uses an explicit `stack: StackItem[]` instead of recursive function calls. Prevents stack overflow on long agent sessions (SSH troubleshooting could run 20+ steps).

```typescript
const stack: StackItem[] = [{ userContent, retryAttempt: 0 }];
while (stack.length > 0) {
  const item = stack.pop()!;
  const response = await callLLM(item.userContent);
  const toolResults = await executeTools(response.toolCalls);
  if (toolResults.length > 0) {
    stack.push({ userContent: toolResults, retryAttempt: 0 });
  }
}
```

### 3. Consecutive Mistake Detection + Tool Repetition Detection
**Source:** Roo Code (`ToolRepetitionDetector.ts`)

Two separate guards against infinite loops:
- **consecutiveMistakeCount** — incremented when LLM doesn't use any tools. After N consecutive mistakes, asks for guidance or aborts.
- **ToolRepetitionDetector** — serializes each tool call to canonical JSON. After N identical consecutive calls, intervenes.

**Implication for EX2:** Essential safety rails. Our agent could get stuck running the same SSH command repeatedly if it doesn't understand the output.

### 4. Reflection as Error-Context-Feedback (Not Separate Phase)
**Source:** Aider's `reflected_message` pattern + Continue's error-as-context-item

In real agents, "reflection" isn't a separate LLM call — it's feeding error context back into the main loop. When a tool fails or output is invalid, the error becomes the next user message and the LLM self-corrects.

**Aider's approach:**
```python
while message:
    self.reflected_message = None
    self.send_message(message)        # LLM generates edits
    if not self.reflected_message:    # No errors? Done.
        break
    if self.num_reflections >= 3:     # Max retries? Done.
        break
    message = self.reflected_message  # Error becomes next input
```

**Implication for EX2:** Instead of Planner → Executor → separate Reflector, the Reflector should be integrated into the execution loop. Zod validation failures, SSH errors, etc. become tool results that the LLM sees and can fix inline.

### 5. Architect → Editor Delegation
**Source:** Aider's `ArchitectCoder`

A reasoning model produces a natural-language plan, then a cheaper/faster model executes it. The architect NEVER produces code — only instructions. The editor receives those instructions and produces structured output.

This maps directly to our design but with an important nuance: **the architect's output is natural language, NOT structured JSON**. The reasoning model thinks freely; the structured output model handles the schema generation.

### 6. Tool Policy with Dynamic Evaluation
**Source:** Continue's `evaluateToolCallPolicy()`

Each tool call's safety level is evaluated **dynamically based on its arguments**, not just its tool name. A `sftp_read` is normally safe, but reading `/etc/shadow` should be blocked.

```typescript
// Continue's pattern
evaluateToolCallPolicy(args) {
  if (isOutsideWorkspace(args.filepath)) return 'allowedWithPermission';
  return 'allowedWithoutPermission';
}
```

**Implication for EX2:** Our guardrails should evaluate the FULL command/path, not just the tool type. Already partially designed this way, but make it explicit.

### 7. Exponential Backoff with User Visibility
**Source:** Roo Code's `backoffAndAnnounce()`

When rate-limited, shows a countdown timer to the user. Retries with exponential backoff (doubles each time).

**Implication for EX2:** Stream a `{ type: 'rate_limited', retryInMs: 2000 }` event so the frontend can show a countdown.

### 8. Context Window Management + Compaction
**Source:** Continue (`compaction.ts`) + Aider (`history.py`)

Long agent sessions accumulate conversation history that can exceed the context window. Both agents handle this:
- **Continue:** At 80% context usage, summarize conversation and replace history with summary. Inject "continue" message to resume.
- **Aider:** Split messages into head (older) + tail (recent), summarize head with weak model, recurse if needed.

**Implication for EX2:** Our agent should track token usage and compact history when approaching the limit. Use the "fast" model role for summarization (cheap).

### 9. Tool-Result-per-Tool-Use Guarantee
**Source:** Roo Code (enforced strictly for native function calling)

For OpenAI's native function calling, every `tool_use` block in the assistant message MUST have a corresponding `tool_result` in the next user message. Missing results cause API errors.

**Implication for EX2:** Even when a tool is blocked by guardrails, we must still send a tool result back (containing the denial reason).

### 10. `didToolFailInCurrentTurn` Guard
**Source:** Roo Code (`AttemptCompletionTool.ts`)

If any tool fails in the current turn, the agent is prevented from claiming completion. It must handle the error first.

**Implication for EX2:** The agent shouldn't generate the final `DynamicViewSchema` in the same turn where an SSH command failed. It should handle the failure first.

---

## Patterns NOT to Adopt

| Pattern | Source | Why Not |
|---------|--------|---------|
| 4,700-line God Class | Roo Code `Task.ts` | We use ServiceContainer with decomposed modules |
| User approval per tool | Roo Code | We use auto-approval with safety rails (command allowlists) |
| Anthropic types as universal format | Roo Code | We keep our own neutral types |
| litellm dependency | Aider | We have our own LLMProvider interface |
| Git as safety net | Aider | We operate on remote servers — use SFTP backups instead |
| Recursive Redux thunks | Continue | We use WebSocket streaming, not Redux |
| System-message tools (codeblock format) | Continue | We only target OpenAI which supports native function calling |
| Local tree-sitter parsing | Aider | Our code runs on remote servers; we parse terminal output, not source code |
| Parallel tool calls in same turn | Roo Code | For SSH safety, we execute tools sequentially by default (parallel opt-in for read-only) |

---

## Revised Architecture Based on Research

### Before (Original EX2 Design)
```
User Request
  → Planner (reasoning model) → JSON execution plan
    → Executor (runs steps sequentially from plan)
      → Schema Generator (structured output model)
        → Reflector (separate reasoning model call)
```

### After (Research-Informed Design)
```
User Request
  → Planner (reasoning model) → high-level intent + context hints (NOT a step-by-step plan)
    → Reactive Executor Loop (structured output model with native function calling):
        while (not done):
          LLM response → tool_calls? → execute tools → feed results back
          No tool_calls? → expect DynamicViewSchema in response
        Safety rails:
          - consecutiveMistakeCount (no tools used for N turns)
          - toolRepetitionDetector (same tool called N times)
          - maxSteps limit (configurable, default 20)
    → Inline Reflection (Zod validate → error becomes next tool_result)
    → Post-Generation Reflection (optional — reasoning model reviews quality)
```

### Key Structural Changes

1. **Executor becomes a reactive loop** — LLM uses native function calling to decide tools dynamically
2. **Planner outputs hints, not a step-by-step plan** — the LLM in the executor loop does the real planning
3. **Reflection is inline** — Zod failures are fed back as tool results in the same loop
4. **Post-reflection is optional** — only for complex/interactive UIs, skipped for simple displays
5. **New safety rails** — consecutive mistake detection, tool repetition detection, maxSteps
6. **Context compaction** — summarize history when approaching token limit
7. **"Weak/fast" model** — used for summarization, simple classification, not just as a fallback

---

## Impact on Existing EX2 Tasks

| Task | Change | Details |
|------|--------|---------|
| EX2.1 | Minor update | Add "weak" model role for summarization/compaction |
| EX2.2 | Minor update | Add `toOpenAIFunction()` method on each tool; ensure tool_result guarantee |
| EX2.3 | No change | Guardrails design is solid |
| EX2.4 | **Major revision** | Planner outputs intent/hints, NOT step-by-step tool list |
| EX2.5 | **Major revision** | Executor becomes reactive tool-calling loop with native function calling |
| EX2.6 | **Major revision** | Reflector split: inline (Zod errors in loop) + post-generation (optional quality review) |
| EX2.7 | **Major revision** | Orchestrator uses stack-based loop, adds safety rails (mistake detection, repetition, maxSteps) |
| EX2.8-9 | No change | FormWidget + WriteBack design is fine |
| EX2.10 | Enhanced | Add exponential backoff with announcement, context compaction |
| EX2.11-12 | Minor update | Add rate_limited event type, mistake/repetition warning events |
| **NEW EX2.13** | **New task** | Context Manager — token counting, history compaction, summarization |
