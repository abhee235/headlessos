// EX3-A.3: Auto-Fit Grid Schema tests
// @see docs/phases/phase-ex3.md

import { describe, it, expect } from 'vitest';
import { GridLayoutSchema } from 'headlessos-shared/schemas/dynamic-view';

describe('GridLayoutSchema — Auto-Fit Grid (EX3-A.3)', () => {
  it('accepts fixed column mode (backward compatible)', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      columns: 3,
      children: [],
    });
    expect(result.columns).toBe(3);
    expect(result.autoFit).toBe(false);
    expect(result.minChildWidth).toBe(250);
  });

  it('accepts autoFit mode', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      columns: 2,
      children: [],
      autoFit: true,
      minChildWidth: 200,
    });
    expect(result.autoFit).toBe(true);
    expect(result.minChildWidth).toBe(200);
  });

  it('defaults autoFit to false', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
    });
    expect(result.autoFit).toBe(false);
  });

  it('defaults minChildWidth to 250', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: true,
    });
    expect(result.minChildWidth).toBe(250);
  });

  it('accepts null for autoFit (OpenAI compatibility)', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: null,
    });
    // null falls back to default
    expect(result.autoFit).toBeNull();
  });

  it('accepts null for minChildWidth (OpenAI compatibility)', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      minChildWidth: null,
    });
    expect(result.minChildWidth).toBeNull();
  });

  it('supports columns up to 6', () => {
    const result = GridLayoutSchema.parse({
      layout: 'grid',
      columns: 6,
      children: [],
    });
    expect(result.columns).toBe(6);
  });

  it('rejects columns > 6', () => {
    const result = GridLayoutSchema.safeParse({
      layout: 'grid',
      columns: 7,
      children: [],
    });
    expect(result.success).toBe(false);
  });

  it('validates minChildWidth range (100-600)', () => {
    expect(() => GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: true,
      minChildWidth: 50,
    })).toThrow();

    expect(() => GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: true,
      minChildWidth: 700,
    })).toThrow();
  });

  it('accepts minChildWidth at boundaries', () => {
    const min = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: true,
      minChildWidth: 100,
    });
    expect(min.minChildWidth).toBe(100);

    const max = GridLayoutSchema.parse({
      layout: 'grid',
      children: [],
      autoFit: true,
      minChildWidth: 600,
    });
    expect(max.minChildWidth).toBe(600);
  });
});
