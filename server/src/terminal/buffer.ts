// EX1.11: Terminal Output Buffer + Pattern Detection
// @see docs/phases/phase-ex1.md

import stripAnsi from 'strip-ansi';

// ── Types ──────────────────────────────────────────────────────────

export interface ParseableHint {
  /** What type of parseable output was detected */
  pattern: 'table' | 'json' | 'log' | 'config' | 'list';
  /** Confidence level 0..1 */
  confidence: number;
  /** Suggested tool name for dynamic UI generation */
  suggestedTool: string;
  /** The detected command (if extractable from prompt) */
  detectedCommand?: string;
  /** Number of lines in the output block */
  lineCount: number;
}

export interface BufferSnapshot {
  /** Raw lines (with ANSI stripped) */
  lines: string[];
  /** Full text (lines joined with newline) */
  text: string;
  /** Number of lines */
  lineCount: number;
}

// ── Pattern Regexes ────────────────────────────────────────────────

/**
 * Patterns for common prompt formats to detect "end of command output".
 * Matches typical bash/zsh prompts like:
 *   user@host:~$
 *   [user@host ~]$
 *   root@server:~#
 *   $
 */
const PROMPT_PATTERN =
  /^(?:\[?[\w.-]+@[\w.-]+[:\s~\/]+[\]$#]|\$|#|>>>|>>>\s|\w+>\s*$)/;

/**
 * Patterns that suggest output is "parseable" — i.e., worth visualizing.
 */
const TABLE_PATTERN = /^(\S+\s{2,}){2,}/; // 3+ columns separated by 2+ spaces
const JSON_START_PATTERN = /^\s*[\[{]/;
const JSON_END_PATTERN = /^\s*[\]}]/;
const LOG_PATTERN =
  /^\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}|^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/;
const CONFIG_PATTERN = /^\s*[\w.]+\s*[=:]\s*.+/;
const LIST_PATTERN = /^(\s*[-*●▸▹]\s+|\s*\d+[.)]\s+)/;

// ── Terminal Buffer ────────────────────────────────────────────────

const DEFAULT_MAX_LINES = 500;

export class TerminalBuffer {
  private lines: string[] = [];
  private maxLines: number;
  private lastPromptIndex = -1;
  private currentCommandOutput: string[] = [];

  constructor(maxLines = DEFAULT_MAX_LINES) {
    this.maxLines = maxLines;
  }

  /**
   * Append raw terminal data to the buffer.
   * Returns a parseable hint if interesting output is detected.
   */
  append(data: string | Buffer): ParseableHint | null {
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    const clean = stripAnsi(text);

    // Split into lines, handling \r\n and \n
    const newLines = clean.split(/\r?\n/);

    for (const line of newLines) {
      // Skip empty lines from split artifacts
      if (line === '' && newLines.length === 1) continue;

      this.lines.push(line);
      this.currentCommandOutput.push(line);

      // Detect prompt — indicates end of a command's output
      if (PROMPT_PATTERN.test(line.trim())) {
        // We reached a prompt; analyze the accumulated output
        const output = this.currentCommandOutput.slice(0, -1); // exclude the prompt line
        this.currentCommandOutput = [];
        this.lastPromptIndex = this.lines.length - 1;

        if (output.length >= 3) {
          const hint = detectPattern(output);
          if (hint) return hint;
        }
      }
    }

    // Enforce max lines
    if (this.lines.length > this.maxLines) {
      const excess = this.lines.length - this.maxLines;
      this.lines.splice(0, excess);
      this.lastPromptIndex = Math.max(-1, this.lastPromptIndex - excess);
    }

    return null;
  }

  /** Get a snapshot of the last N lines. */
  getSnapshot(lastN?: number): BufferSnapshot {
    const count = lastN ?? this.lines.length;
    const sliced = this.lines.slice(-count);
    return {
      lines: sliced,
      text: sliced.join('\n'),
      lineCount: sliced.length,
    };
  }

  /** Get the most recent command output block (between last two prompts). */
  getLastCommandOutput(): BufferSnapshot | null {
    if (this.lastPromptIndex < 0) return null;

    // Walk backwards from lastPromptIndex to find the previous prompt
    let startIdx = 0;
    for (let i = this.lastPromptIndex - 1; i >= 0; i--) {
      if (PROMPT_PATTERN.test(this.lines[i].trim())) {
        startIdx = i + 1;
        break;
      }
    }

    const outputLines = this.lines.slice(startIdx, this.lastPromptIndex);
    if (outputLines.length === 0) return null;

    return {
      lines: outputLines,
      text: outputLines.join('\n'),
      lineCount: outputLines.length,
    };
  }

  /** Get total line count in buffer. */
  get lineCount(): number {
    return this.lines.length;
  }

  /** Clear the buffer. */
  clear(): void {
    this.lines = [];
    this.currentCommandOutput = [];
    this.lastPromptIndex = -1;
  }
}

// ── Pattern Detection ──────────────────────────────────────────────

/**
 * Analyze a block of terminal output lines for parseable patterns.
 * Returns a hint if the output looks structured enough to visualize.
 */
export function detectPattern(lines: string[]): ParseableHint | null {
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return null;

  // Check JSON
  const jsonHint = detectJSON(nonEmpty);
  if (jsonHint) return jsonHint;

  // Check table
  const tableHint = detectTable(nonEmpty);
  if (tableHint) return tableHint;

  // Check log pattern
  const logHint = detectLog(nonEmpty);
  if (logHint) return logHint;

  // Check config pattern
  const configHint = detectConfig(nonEmpty);
  if (configHint) return configHint;

  // Check list pattern
  const listHint = detectList(nonEmpty);
  if (listHint) return listHint;

  return null;
}

function detectJSON(lines: string[]): ParseableHint | null {
  const text = lines.join('\n').trim();
  if (!JSON_START_PATTERN.test(text)) return null;

  // Check if the last non-empty line ends the JSON
  const lastLine = lines[lines.length - 1].trim();
  if (JSON_END_PATTERN.test(lastLine)) {
    try {
      JSON.parse(text);
      return {
        pattern: 'json',
        confidence: 0.95,
        suggestedTool: 'json',
        lineCount: lines.length,
      };
    } catch {
      // Partial JSON — still potentially interesting
      return {
        pattern: 'json',
        confidence: 0.6,
        suggestedTool: 'json',
        lineCount: lines.length,
      };
    }
  }
  return null;
}

function detectTable(lines: string[]): ParseableHint | null {
  // Count lines that match table pattern (columns separated by 2+ spaces)
  let tableLines = 0;
  for (const line of lines) {
    if (TABLE_PATTERN.test(line)) tableLines++;
  }
  const ratio = tableLines / lines.length;
  if (ratio >= 0.5 && tableLines >= 2) {
    return {
      pattern: 'table',
      confidence: Math.min(0.9, ratio),
      suggestedTool: 'system',
      lineCount: lines.length,
    };
  }
  return null;
}

function detectLog(lines: string[]): ParseableHint | null {
  let logLines = 0;
  for (const line of lines) {
    if (LOG_PATTERN.test(line)) logLines++;
  }
  const ratio = logLines / lines.length;
  if (ratio >= 0.4 && logLines >= 3) {
    return {
      pattern: 'log',
      confidence: Math.min(0.85, ratio),
      suggestedTool: 'logs',
      lineCount: lines.length,
    };
  }
  return null;
}

function detectConfig(lines: string[]): ParseableHint | null {
  let configLines = 0;
  for (const line of lines) {
    if (CONFIG_PATTERN.test(line) && !line.trim().startsWith('#')) {
      configLines++;
    }
  }
  const ratio = configLines / lines.length;
  if (ratio >= 0.4 && configLines >= 3) {
    return {
      pattern: 'config',
      confidence: Math.min(0.8, ratio),
      suggestedTool: 'config',
      lineCount: lines.length,
    };
  }
  return null;
}

function detectList(lines: string[]): ParseableHint | null {
  let listLines = 0;
  for (const line of lines) {
    if (LIST_PATTERN.test(line)) listLines++;
  }
  const ratio = listLines / lines.length;
  if (ratio >= 0.5 && listLines >= 3) {
    return {
      pattern: 'list',
      confidence: Math.min(0.75, ratio),
      suggestedTool: 'system',
      lineCount: lines.length,
    };
  }
  return null;
}
