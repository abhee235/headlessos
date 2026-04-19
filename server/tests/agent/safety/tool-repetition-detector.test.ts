// EX2.5: Tool Repetition Detector — Tests
// @see docs/phases/phase-ex2.md

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRepetitionDetector } from '../../../src/agent/safety/tool-repetition-detector.js';

describe('ToolRepetitionDetector', () => {
  let detector: ToolRepetitionDetector;

  beforeEach(() => {
    detector = new ToolRepetitionDetector(3);
  });

  it('does not trigger on first call', () => {
    expect(detector.isRepeating('key1')).toBe(false);
  });

  it('does not trigger below max', () => {
    detector.isRepeating('key1'); // 1
    detector.isRepeating('key1'); // 2
    expect(detector.isRepeating('key1')).toBe(false); // 3 — at max, not over
  });

  it('triggers when exceeding max', () => {
    detector.isRepeating('key1'); // 1
    detector.isRepeating('key1'); // 2
    detector.isRepeating('key1'); // 3
    expect(detector.isRepeating('key1')).toBe(true); // 4 — over max
  });

  it('tracks different keys independently', () => {
    detector.isRepeating('key1'); // 1
    detector.isRepeating('key1'); // 2
    detector.isRepeating('key1'); // 3
    expect(detector.isRepeating('key2')).toBe(false); // key2 is fresh
    expect(detector.isRepeating('key1')).toBe(true); // key1 exceeded
  });

  it('returns count correctly', () => {
    expect(detector.getCount('key1')).toBe(0);
    detector.isRepeating('key1');
    expect(detector.getCount('key1')).toBe(1);
    detector.isRepeating('key1');
    expect(detector.getCount('key1')).toBe(2);
  });

  it('resets all counters', () => {
    detector.isRepeating('key1');
    detector.isRepeating('key1');
    detector.isRepeating('key2');
    detector.reset();
    expect(detector.getCount('key1')).toBe(0);
    expect(detector.getCount('key2')).toBe(0);
  });

  it('uses default max of 5', () => {
    const defaultDetector = new ToolRepetitionDetector();
    for (let i = 0; i < 5; i++) {
      expect(defaultDetector.isRepeating('key')).toBe(false);
    }
    expect(defaultDetector.isRepeating('key')).toBe(true); // 6th call
  });
});
