// EX3-A.2: Layout Pattern Library tests
// @see docs/phases/phase-ex3.md

import { describe, it, expect } from 'vitest';
import {
  LAYOUT_PATTERNS,
  LAYOUT_PATTERN_IDS,
  getLayoutPattern,
  getPatternForContentType,
  getPatternRulesText,
  generateDesignSystemRules,
} from '../../src/dynamic-ui/layout-patterns.js';
import type { LayoutPattern } from '../../src/dynamic-ui/types.js';

describe('Layout Pattern Library', () => {
  describe('LAYOUT_PATTERNS', () => {
    it('has exactly 10 patterns', () => {
      expect(Object.keys(LAYOUT_PATTERNS)).toHaveLength(10);
    });

    it('has all expected pattern IDs', () => {
      const expectedIds = [
        'dashboard-metrics',
        'single-table',
        'tabbed-detail',
        'config-viewer',
        'status-overview',
        'log-viewer',
        'tree-explorer',
        'audit-report',
        'comparison-grid',
        'detail-overview',
      ];
      for (const id of expectedIds) {
        expect(LAYOUT_PATTERNS[id]).toBeDefined();
      }
    });

    it('LAYOUT_PATTERN_IDS matches LAYOUT_PATTERNS keys', () => {
      expect(LAYOUT_PATTERN_IDS.sort()).toEqual(Object.keys(LAYOUT_PATTERNS).sort());
    });
  });

  describe('pattern structure validation', () => {
    it.each(Object.entries(LAYOUT_PATTERNS))('pattern %s has all required fields', (id, pattern) => {
      expect(pattern.id).toBe(id);
      expect(pattern.name).toBeTruthy();
      expect(pattern.description).toBeTruthy();
      expect(pattern.contentTypes).toBeDefined();
      expect(pattern.contentTypes.length).toBeGreaterThan(0);
      expect(pattern.skeleton).toBeDefined();
      expect(pattern.skeleton.layout).toBeTruthy();
      expect(pattern.skeleton.widgetSlots.length).toBeGreaterThan(0);
      expect(pattern.populationRules.length).toBeGreaterThan(0);
      expect(pattern.recommendedWidgets.length).toBeGreaterThan(0);
      expect(pattern.discouragedWidgets.length).toBeGreaterThan(0);
    });

    it.each(Object.entries(LAYOUT_PATTERNS))('pattern %s has no overlap between recommended and discouraged', (_id, pattern) => {
      const overlap = pattern.recommendedWidgets.filter(w =>
        pattern.discouragedWidgets.includes(w),
      );
      expect(overlap).toEqual([]);
    });

    it.each(Object.entries(LAYOUT_PATTERNS))('pattern %s widget slots have required fields', (_id, pattern) => {
      for (const slot of pattern.skeleton.widgetSlots) {
        expect(slot.id).toBeTruthy();
        expect(slot.location).toBeTruthy();
        expect(slot.widgetTypes.length).toBeGreaterThan(0);
        expect(typeof slot.required).toBe('boolean');
      }
    });

    it.each(Object.entries(LAYOUT_PATTERNS))('pattern %s has at least one required widget slot', (_id, pattern) => {
      const requiredSlots = pattern.skeleton.widgetSlots.filter(s => s.required);
      expect(requiredSlots.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('content type mapping', () => {
    it('every contentType maps to exactly one pattern', () => {
      const allContentTypes = [
        'metrics-overview', 'data-table', 'multi-dataset', 'config-review',
        'status-board', 'log-analysis', 'tree-hierarchy', 'audit-report',
        'comparison', 'detail-view',
      ];

      for (const ct of allContentTypes) {
        const pattern = getPatternForContentType(ct);
        expect(pattern).toBeDefined();
      }
    });

    it('metrics-overview maps to dashboard-metrics', () => {
      const pattern = getPatternForContentType('metrics-overview');
      expect(pattern?.id).toBe('dashboard-metrics');
    });

    it('data-table maps to single-table', () => {
      const pattern = getPatternForContentType('data-table');
      expect(pattern?.id).toBe('single-table');
    });

    it('multi-dataset maps to tabbed-detail', () => {
      const pattern = getPatternForContentType('multi-dataset');
      expect(pattern?.id).toBe('tabbed-detail');
    });

    it('config-review maps to config-viewer', () => {
      const pattern = getPatternForContentType('config-review');
      expect(pattern?.id).toBe('config-viewer');
    });

    it('log-analysis maps to log-viewer', () => {
      const pattern = getPatternForContentType('log-analysis');
      expect(pattern?.id).toBe('log-viewer');
    });
  });

  describe('getLayoutPattern()', () => {
    it('returns pattern by ID', () => {
      const pattern = getLayoutPattern('dashboard-metrics');
      expect(pattern).toBeDefined();
      expect(pattern!.id).toBe('dashboard-metrics');
    });

    it('returns undefined for unknown ID', () => {
      const pattern = getLayoutPattern('nonexistent');
      expect(pattern).toBeUndefined();
    });
  });

  describe('getPatternRulesText()', () => {
    it('returns formatted rules for a valid pattern', () => {
      const text = getPatternRulesText('dashboard-metrics');
      expect(text).toContain('Dashboard Metrics');
      expect(text).toContain('Population Rules:');
      expect(text).toContain('Recommended widgets:');
      expect(text).toContain('Discouraged widgets:');
      expect(text).toContain('stat-card');
    });

    it('returns empty string for unknown pattern', () => {
      const text = getPatternRulesText('nonexistent');
      expect(text).toBe('');
    });

    it('includes all population rules', () => {
      const pattern = LAYOUT_PATTERNS['dashboard-metrics'];
      const text = getPatternRulesText('dashboard-metrics');
      for (const rule of pattern.populationRules) {
        expect(text).toContain(rule);
      }
    });
  });

  describe('specific pattern rules', () => {
    it('dashboard-metrics discourages chart', () => {
      const pattern = LAYOUT_PATTERNS['dashboard-metrics'];
      expect(pattern.discouragedWidgets).toContain('chart');
    });

    it('dashboard-metrics recommends stat-card', () => {
      const pattern = LAYOUT_PATTERNS['dashboard-metrics'];
      expect(pattern.recommendedWidgets).toContain('stat-card');
    });

    it('single-table has table in required slot', () => {
      const pattern = LAYOUT_PATTERNS['single-table'];
      const tableSlot = pattern.skeleton.widgetSlots.find(s => s.id === 'main-table');
      expect(tableSlot).toBeDefined();
      expect(tableSlot!.required).toBe(true);
      expect(tableSlot!.widgetTypes).toContain('table');
    });

    it('tabbed-detail has summary-stats slot with grid-auto-fit', () => {
      const pattern = LAYOUT_PATTERNS['tabbed-detail'];
      const statsSlot = pattern.skeleton.widgetSlots.find(s => s.id === 'summary-stats');
      expect(statsSlot).toBeDefined();
      expect(statsSlot!.layout).toBe('grid-auto-fit');
    });

    it('config-viewer requires code-block', () => {
      const pattern = LAYOUT_PATTERNS['config-viewer'];
      const codeSlot = pattern.skeleton.widgetSlots.find(s => s.id === 'config-content');
      expect(codeSlot).toBeDefined();
      expect(codeSlot!.required).toBe(true);
      expect(codeSlot!.widgetTypes).toContain('code-block');
    });

    it('audit-report requires alert and stat-cards', () => {
      const pattern = LAYOUT_PATTERNS['audit-report'];
      expect(pattern.recommendedWidgets).toContain('alert');
      expect(pattern.recommendedWidgets).toContain('stat-card');
    });

    it('log-viewer requires log-viewer widget', () => {
      const pattern = LAYOUT_PATTERNS['log-viewer'];
      const logSlot = pattern.skeleton.widgetSlots.find(s => s.id === 'log-content');
      expect(logSlot).toBeDefined();
      expect(logSlot!.required).toBe(true);
      expect(logSlot!.widgetTypes).toContain('log-viewer');
    });
  });

  // EX3-B.1: generateDesignSystemRules
  describe('generateDesignSystemRules', () => {
    const rules = generateDesignSystemRules();

    it('returns a non-empty string', () => {
      expect(rules.length).toBeGreaterThan(0);
    });

    it('includes all 10 pattern IDs', () => {
      for (const id of LAYOUT_PATTERN_IDS) {
        expect(rules).toContain(id);
      }
    });

    it('includes content-type to pattern mapping', () => {
      expect(rules).toContain('metrics-overview');
      expect(rules).toContain('data-table');
      expect(rules).toContain('multi-dataset');
    });

    it('includes pattern-derived structural rules', () => {
      expect(rules).toContain('autoFit:true');
      expect(rules).toContain('minChildWidth:200');
      expect(rules).toContain('ROOT level');
    });

    it('mentions recommended widgets for patterns', () => {
      // dashboard-metrics recommends stat-card
      expect(rules).toContain('stat-card');
      // log-viewer recommends log-viewer
      expect(rules).toContain('log-viewer');
    });

    it('stays under ~2000 tokens (roughly 8000 chars)', () => {
      // Rough approximation: 1 token ≈ 4 chars
      expect(rules.length).toBeLessThan(8000);
    });
  });
});
