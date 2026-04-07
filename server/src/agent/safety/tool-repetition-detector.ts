// EX2.5: Tool Repetition Detector
// @see docs/phases/phase-ex2.md — EX2.5
//
// Detects when the LLM calls the same tool with the same arguments
// repeatedly — a sign that it's stuck. From Roo Code's pattern.

/**
 * Detects repeated tool calls (same name + same args).
 * When the same tool call is made more than `maxRepetitions` times,
 * the executor should intervene and warn the LLM to try a different approach.
 */
export class ToolRepetitionDetector {
  private callCounts = new Map<string, number>();
  private maxRepetitions: number;

  constructor(maxRepetitions = 5) {
    this.maxRepetitions = maxRepetitions;
  }

  /**
   * Check if a tool call is being repeated too many times.
   * Returns true if the call count exceeds `maxRepetitions`.
   *
   * @param key - A unique key for the tool call (typically JSON.stringify({ name, args }))
   */
  isRepeating(key: string): boolean {
    const count = (this.callCounts.get(key) ?? 0) + 1;
    this.callCounts.set(key, count);
    return count > this.maxRepetitions;
  }

  /**
   * Get the current count for a specific tool call key.
   */
  getCount(key: string): number {
    return this.callCounts.get(key) ?? 0;
  }

  /**
   * Reset all counters. Call at the start of a new execution session.
   */
  reset(): void {
    this.callCounts.clear();
  }
}
