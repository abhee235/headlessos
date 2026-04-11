// EX3-A.6: Tests for formatUnit utility
// @see docs/phases/phase-ex3.md

import { describe, it, expect } from 'vitest';
import { formatUnit } from '../../src/lib/format-utils';

describe('formatUnit', () => {
  describe('no unit (passthrough)', () => {
    it('returns raw number as string when unit is null', () => {
      expect(formatUnit(42, null)).toBe('42');
    });

    it('returns raw number as string when unit is undefined', () => {
      expect(formatUnit(42)).toBe('42');
    });

    it('returns 0 as string', () => {
      expect(formatUnit(0)).toBe('0');
    });
  });

  describe('bytes', () => {
    it('formats 0 bytes', () => {
      expect(formatUnit(0, 'bytes')).toBe('0 B');
    });

    it('formats bytes < 1KB', () => {
      expect(formatUnit(512, 'bytes')).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatUnit(1024, 'bytes')).toBe('1.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatUnit(1048576, 'bytes')).toBe('1.0 MB');
    });

    it('formats gigabytes', () => {
      expect(formatUnit(1073741824, 'bytes')).toBe('1.0 GB');
    });

    it('formats terabytes', () => {
      expect(formatUnit(1099511627776, 'bytes')).toBe('1.0 TB');
    });

    it('rounds large values', () => {
      // 15.7 GB → rounds
      expect(formatUnit(16864835584, 'bytes')).toBe('16 GB');
    });

    it('handles negative bytes', () => {
      const result = formatUnit(-1024, 'bytes');
      expect(result).toBe('-1.0 KB');
    });
  });

  describe('percent', () => {
    it('appends % to value', () => {
      expect(formatUnit(85, 'percent')).toBe('85%');
    });

    it('works with 0', () => {
      expect(formatUnit(0, 'percent')).toBe('0%');
    });

    it('works with 100', () => {
      expect(formatUnit(100, 'percent')).toBe('100%');
    });
  });

  describe('duration', () => {
    it('formats seconds', () => {
      expect(formatUnit(30, 'duration')).toBe('30s');
    });

    it('formats minutes', () => {
      expect(formatUnit(90, 'duration')).toBe('1.5m');
    });

    it('formats hours', () => {
      expect(formatUnit(7200, 'duration')).toBe('2.0h');
    });

    it('formats days', () => {
      expect(formatUnit(172800, 'duration')).toBe('2.0d');
    });

    it('boundary: 59s stays in seconds', () => {
      expect(formatUnit(59, 'duration')).toBe('59s');
    });

    it('boundary: 60s becomes minutes', () => {
      expect(formatUnit(60, 'duration')).toBe('1.0m');
    });
  });

  describe('count', () => {
    it('formats small numbers directly', () => {
      expect(formatUnit(42, 'count')).toBe('42');
    });

    it('formats thousands', () => {
      expect(formatUnit(1500, 'count')).toBe('1.5K');
    });

    it('formats millions', () => {
      expect(formatUnit(2500000, 'count')).toBe('2.5M');
    });

    it('formats billions', () => {
      expect(formatUnit(3000000000, 'count')).toBe('3.0B');
    });

    it('handles 999 (no suffix)', () => {
      expect(formatUnit(999, 'count')).toBe('999');
    });

    it('handles negative count', () => {
      expect(formatUnit(-2500, 'count')).toBe('-2.5K');
    });
  });

  describe('custom', () => {
    it('appends custom unit suffix', () => {
      expect(formatUnit(42, 'custom', ' req/s')).toBe('42 req/s');
    });

    it('falls back to plain number when customUnit is null', () => {
      expect(formatUnit(42, 'custom', null)).toBe('42');
    });

    it('falls back to plain number when customUnit is undefined', () => {
      expect(formatUnit(42, 'custom')).toBe('42');
    });
  });
});
