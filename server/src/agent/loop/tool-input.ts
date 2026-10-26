// EX9.3: Weak-model input handling — what small local models send, made usable
// @see docs/phases/phase-ex9.md §8 (after an earlier agent project's JSON repair,
//      prose tool-call and input-normalizer code)
//
// 1. Tool arguments arrive as an object (Ollama) or a string (OpenAI). Strings that
//    are not valid JSON go through a syntax-only repair ladder.
// 2. A model that writes its tool call as text instead of using the tool channel
//    gets that call executed, if it names a tool it was offered.
// 3. Wrong argument names are mapped to the right ones — only after validation
//    fails, and never over a key the model actually sent.
// 4. EX10.6: for every tool, top-level nulls mean "not given", and a non-action tool's
//    arguments are checked against its schema with one-line errors (as actions are).

import type { ZodError } from 'zod';
export interface ParsedArgs {
  input: unknown;
  via: 'exact' | 'repaired' | 'raw';
  /** the text the model sent, when it could not be parsed */
  raw?: string;
}

/** Parse tool-call arguments; repair broken JSON; never throw. */
export function parseToolArgs(args: unknown): ParsedArgs {
  if (args === undefined || args === null || args === '') return { input: {}, via: 'exact' };
  if (typeof args === 'object') return { input: args, via: 'exact' };
  const text = String(args).trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (isPlainObject(parsed)) return { input: parsed, via: 'exact' };
  } catch { /* fall through to repair */ }
  const repaired = repairJson(text);
  if (repaired !== undefined) return { input: repaired, via: 'repaired' };
  return { input: {}, via: 'raw', raw: text.slice(0, 2000) };
}

/**
 * Syntax-only repairs, re-parsing after each step: cut to the outermost object,
 * drop trailing commas, quote bare keys, single → double quotes, close a
 * truncated object; last (EX10.5 follow-up), drop closing brackets that do not
 * match the open one. Returns a plain object or undefined.
 */
export function repairJson(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  const end = text.lastIndexOf('}');
  let cur = end > start ? text.slice(start, end + 1) : text.slice(start);
  const attempt = (candidate: string) => {
    try {
      const value: unknown = JSON.parse(candidate);
      return isPlainObject(value) ? value : undefined;
    } catch {
      return undefined;
    }
  };
  let ok = attempt(cur);
  if (ok) return ok;

  cur = cur.replace(/,\s*([}\]])/g, '$1');
  if ((ok = attempt(cur))) return ok;

  cur = cur.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  if ((ok = attempt(cur))) return ok;

  const doubled = cur.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
  if ((ok = attempt(doubled))) return ok;

  return attempt(closeTruncated(cur))
    ?? attempt(closeTruncated(doubled))
    ?? attempt(closeTruncated(dropMismatchedClosers(cur)))
    ?? attempt(closeTruncated(dropMismatchedClosers(doubled)));
}

/**
 * EX10.5 follow-up: a bracket in the wrong place, found by trying small edits near where
 * JSON.parse stopped — remove one of the last few `}`/`]` before that point, or add a `]`/`}`
 * right after one of them — for up to `rounds` errors in a row. The first candidate that
 * parses and that `accept` takes wins (e.g. a valid view), else the first that parses.
 * Models writing nested views close an object too early (`…"x"}]},"gap":"sm"}},…`) or
 * leave an array open (`…"x"},"layout":"stack"}],…`).
 */
export function repairNearError(
  text: string,
  accept: (value: Record<string, unknown>) => boolean = () => true,
  rounds = 3,
): Record<string, unknown> | undefined {
  const NEAR = 6;
  const BEAM = 48;
  let fallback: Record<string, unknown> | undefined;
  let frontier = [text];
  const seen = new Set(frontier);
  for (let round = 0; round <= rounds && frontier.length; round++) {
    const next: string[] = [];
    for (const candidate of frontier) {
      let message: string;
      try {
        const value: unknown = JSON.parse(candidate);
        if (isPlainObject(value)) {
          if (accept(value)) return value;
          fallback ??= value;
        }
        continue;
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      if (round === rounds) continue;
      const pos = Number(/position (\d+)/.exec(message)?.[1]);
      const stop = Number.isFinite(pos) ? pos : candidate.length;
      const closers = closerPositions(candidate, stop).slice(-NEAR).reverse();
      const edits: string[] = [];
      for (const i of closers) edits.push(candidate.slice(0, i) + candidate.slice(i + 1));
      for (const i of closers) for (const ch of [']', '}']) edits.push(candidate.slice(0, i + 1) + ch + candidate.slice(i + 1));
      for (const ch of [']', '}']) edits.push(candidate.slice(0, stop) + ch + candidate.slice(stop));
      for (const e of edits) {
        if (!seen.has(e)) {
          seen.add(e);
          next.push(e);
        }
      }
    }
    frontier = next.slice(0, BEAM);
  }
  return fallback;
}

/** Indexes of `}` and `]` outside strings, before `stop` */
function closerPositions(text: string, stop: number): number[] {
  const out: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < Math.min(stop, text.length); i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '}' || ch === ']') out.push(i);
  }
  return out;
}

/**
 * EX10.5 follow-up: outside strings, skip a `}` or `]` that does not close the bracket
 * currently open. Models writing nested views put a `}` where a `]` belongs, e.g.
 * `…"gap":"sm"}}],…` after an inner stack (2026-10-22 runs).
 */
export function dropMismatchedClosers(text: string): string {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let out = '';
  for (const ch of text) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') open.push('}');
    else if (ch === '[') open.push(']');
    else if (ch === '}' || ch === ']') {
      if (open[open.length - 1] !== ch) continue; // a stray closer: leave it out
      open.pop();
    }
    out += ch;
  }
  return out;
}

/** Close strings, drop a dangling key or comma, and close open brackets. */
function closeTruncated(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
  }
  let out = text;
  if (out.endsWith('\\')) out = out.slice(0, -1);
  if (inString) out += '"';
  let prev: string;
  do {
    prev = out;
    out = out.replace(/("([^"\\]|\\.)*"\s*:\s*|,\s*)$/, '');
  } while (out !== prev);
  return out + stack.reverse().join('');
}

// ── Prose tool calls ────────────────────────────────────

export interface ProseToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool calls a model wrote as text (a ```json fence, a <tool_call> block, or a
 * bare object) that name a tool it was offered. Case-insensitive names.
 */
export function extractProseToolCalls(text: string, toolNames: string[]): ProseToolCall[] {
  if (!text || !/"(name|tool)"\s*:/.test(text)) return [];
  const byLower = new Map(toolNames.map((n) => [n.toLowerCase(), n]));
  const regions: string[] = [];
  for (const m of text.matchAll(/```(?:json|javascript|js|tool_code)?\s*([\s\S]*?)(?:```|$)/g)) regions.push(m[1]!);
  for (const m of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g)) regions.push(m[1]!);
  if (regions.length === 0) regions.push(text);

  const calls: ProseToolCall[] = [];
  for (const region of regions) {
    const trimmed = region.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr: unknown = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          for (const item of arr) pushCall(calls, item, byLower);
          continue;
        }
      } catch { /* scan objects instead */ }
    }
    for (const slice of topLevelObjects(trimmed)) {
      try { pushCall(calls, JSON.parse(slice), byLower); } catch { /* skip malformed */ }
    }
  }
  return calls;
}

function pushCall(out: ProseToolCall[], obj: unknown, byLower: Map<string, string>): void {
  if (!isPlainObject(obj)) return;
  const fn = isPlainObject(obj.function) ? obj.function : undefined;
  const rawName = obj.name ?? obj.tool ?? fn?.name;
  if (typeof rawName !== 'string') return;
  const name = byLower.get(rawName.toLowerCase());
  if (!name) return;
  let input: Record<string, unknown> = {};
  for (const source of [obj, fn]) {
    if (!source) continue;
    for (const key of ['parameters', 'arguments', 'input', 'args']) {
      const value = source[key];
      if (isPlainObject(value)) { input = value; break; }
      if (typeof value === 'string') {
        const parsed = parseToolArgs(value);
        if (parsed.via !== 'raw' && isPlainObject(parsed.input)) { input = parsed.input; break; }
      }
    }
  }
  out.push({ name, input });
}

/** Balanced top-level {…} slices, string- and escape-aware. */
function topLevelObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"' && depth > 0) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0) { depth--; if (depth === 0) out.push(text.slice(start, i + 1)); }
  }
  return out;
}

// ── Key aliases ─────────────────────────────────────────

/** Names small models use for parameters, keyed by the parameter they mean. */
export const GENERIC_ALIASES: Record<string, string[]> = {
  unit: ['service', 'service_name', 'unit_name', 'svc', 'name'],
  container: ['container_id', 'container_name', 'id', 'name'],
  lines: ['n', 'count', 'limit', 'tail', 'num_lines', 'line_count', 'number'],
  path: ['file', 'file_path', 'filepath', 'filename', 'dir', 'directory', 'folder'],
  pid: ['process_id', 'process', 'id'],
  program: ['tool', 'binary', 'command', 'cmd', 'cli', 'name'],
  host: ['hostname', 'domain', 'address', 'target', 'ip'],
  url: ['link', 'endpoint', 'address'],
  name: ['package', 'package_name', 'pkg', 'process_name'],
  text: ['query', 'pattern', 'search', 'term', 'string'],
  user: ['username', 'user_name', 'account'],
  reason: ['why', 'justification', 'because', 'explanation'],
  subcommands: ['subcommand', 'args', 'arguments'],
};

/**
 * Move misnamed keys onto the schema's keys: case/dash folding first, then
 * aliases. Only fills keys that are missing, only from keys the schema does not
 * have, and never overwrites. Returns null when nothing changed.
 */
export function normalizeKeys(
  input: unknown,
  schemaKeys: string[],
  extraAliases: Record<string, string[]> = {},
): Record<string, unknown> | null {
  if (!isPlainObject(input)) return null;
  const out: Record<string, unknown> = { ...input };
  const known = new Set(schemaKeys);
  let changed = false;

  for (const key of Object.keys(out)) {
    if (known.has(key)) continue;
    const folded = key.toLowerCase().replace(/-/g, '_');
    if (known.has(folded) && !(folded in out)) {
      out[folded] = out[key];
      delete out[key];
      changed = true;
    }
  }
  for (const target of schemaKeys) {
    if (target in out) continue;
    const aliases = [...(extraAliases[target] ?? []), ...(GENERIC_ALIASES[target] ?? [])];
    const source = aliases.find((a) => a in out && !known.has(a));
    if (source) {
      out[target] = out[source];
      delete out[source];
      changed = true;
    }
  }
  return changed ? out : null;
}

/** "X was called with arguments that are not valid JSON…" */
export function malformedArgsMessage(tool: string, raw: string, keys: string[]): string {
  const sent = raw.length > 300 ? `${raw.slice(0, 300)}…` : raw;
  return `${tool} was called with arguments that are not valid JSON and could not be repaired. You sent: ${sent}. `
    + `Call ${tool} again with one JSON object${keys.length ? ` using these keys: ${keys.join(', ')}` : ''}.`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── EX10.6: arguments for every tool ───────────────────

/** Top-level nulls mean "not given" (models send them for optional parameters). */
export function dropNullArgs(raw: unknown): unknown {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null));
}

/** One short line per Zod issue: "tag: expected string, you sent null" */
export function describeZodIssues(error: ZodError, raw: unknown, max = 3): string[] {
  return error.issues.slice(0, max).map((issue) => {
    const field = issue.path.join('.') || 'params';
    if (issue.code === 'unrecognized_keys') return `unknown parameter(s) ${issue.keys.map(String).join(', ')}`;
    const sent = describeValue(valueAt(raw, issue.path));
    if (issue.code === 'invalid_type') {
      return sent === 'nothing' ? `${field}: required (${issue.expected})` : `${field}: expected ${issue.expected}, you sent ${sent}`;
    }
    const message = issue.message.startsWith('expected') ? issue.message : `expected ${lowerFirst(issue.message)}`;
    return `${field}: ${message}, you sent ${sent}`;
  });
}

/** name(a, b?) from a Zod object schema */
export function zodSignature(name: string, schema: unknown): string {
  const shape = (schema as { shape?: Record<string, { isOptional?: () => boolean }> })?.shape;
  if (!shape) return `${name}(…)`;
  return `${name}(${Object.entries(shape).map(([k, v]) => (v.isOptional?.() ? `${k}?` : k)).join(', ')})`;
}

/**
 * Validate a tool call's arguments against the tool's own schema before running it.
 * Errors are one line, like the action runner's: what was wrong, and the signature.
 */
export function checkToolArgs(
  tool: { name: string; parameters: { safeParse: (v: unknown) => { success: true } | { success: false; error: ZodError } } },
  input: unknown,
): { ok: true } | { ok: false; error: string } {
  const result = tool.parameters.safeParse(input);
  if (result.success) return { ok: true };
  return { ok: false, error: `${tool.name}: ${describeZodIssues(result.error, input).join('; ')}. Parameters: ${zodSignature(tool.name, tool.parameters)}` };
}

function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = raw;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[key];
  }
  return cur;
}

function describeValue(value: unknown): string {
  if (value === undefined) return 'nothing';
  const text = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function lowerFirst(text: string): string {
  return text ? text[0]!.toLowerCase() + text.slice(1) : text;
}
