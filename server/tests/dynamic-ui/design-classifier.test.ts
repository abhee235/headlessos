// EX3-A.1: Design Classifier tests
// @see docs/phases/phase-ex3.md

import { describe, it, expect, vi } from 'vitest';
import { DesignClassificationSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { DesignClassification } from 'headlessos-shared/schemas/dynamic-view';
import {
  DesignClassifier,
  CLASSIFIER_SYSTEM_PROMPT,
} from '../../src/dynamic-ui/design-classifier.js';
import type { LLMProvider, ParseResult } from '../../src/llm/provider.js';

// ── Mock LLM Provider ──────────────────────────────────

function createMockClassifierLLM(response: DesignClassification): LLMProvider {
  return {
    name: 'mock-classifier',
    model: 'gpt-4o-mini',
    parseText: vi.fn().mockResolvedValue({
      data: response,
      tokensUsed: { input: 150, output: 80 },
      latencyMs: 200,
      model: 'gpt-4o-mini',
    } satisfies ParseResult<DesignClassification>),
    parseImage: vi.fn().mockRejectedValue(new Error('Not implemented')),
  };
}

function createFailingClassifierLLM(): LLMProvider {
  return {
    name: 'failing-classifier',
    model: 'gpt-4o-mini',
    parseText: vi.fn().mockRejectedValue(new Error('LLM API error')),
    parseImage: vi.fn().mockRejectedValue(new Error('Not implemented')),
  };
}

// ── Test data ───────────────────────────────────────────

const metricsClassification: DesignClassification = {
  contentType: 'metrics-overview',
  layoutPattern: 'dashboard-metrics',
  expectedWidgets: ['stat-card', 'progress-bar'],
  sectionCount: 1,
  designNotes: 'System metrics with disk usage percentages',
  useVisualization: false,
  visualizationReason: null,
};

const tableClassification: DesignClassification = {
  contentType: 'data-table',
  layoutPattern: 'single-table',
  expectedWidgets: ['key-value', 'table'],
  sectionCount: 1,
  designNotes: 'List of installed packages',
  useVisualization: false,
  visualizationReason: null,
};

const multiDatasetClassification: DesignClassification = {
  contentType: 'multi-dataset',
  layoutPattern: 'tabbed-detail',
  expectedWidgets: ['stat-card', 'table', 'badge-grid'],
  sectionCount: 3,
  designNotes: 'Network interfaces, routes, and listening ports',
  useVisualization: false,
  visualizationReason: null,
};

const auditClassification: DesignClassification = {
  contentType: 'audit-report',
  layoutPattern: 'audit-report',
  expectedWidgets: ['alert', 'stat-card', 'table'],
  sectionCount: 3,
  designNotes: 'Security findings categorized by severity',
  useVisualization: false,
  visualizationReason: null,
};

const configClassification: DesignClassification = {
  contentType: 'config-review',
  layoutPattern: 'config-viewer',
  expectedWidgets: ['key-value', 'code-block'],
  sectionCount: 1,
  designNotes: 'Nginx configuration file',
  useVisualization: false,
  visualizationReason: null,
};

const diskWithVisualization: DesignClassification = {
  contentType: 'metrics-overview',
  layoutPattern: 'dashboard-metrics',
  expectedWidgets: ['stat-card', 'progress-bar', 'gauge'],
  sectionCount: 1,
  designNotes: 'Disk usage with high usage on root filesystem',
  useVisualization: true,
  visualizationReason: 'Root filesystem at 87% — gauge shows severity',
};

// ── Tests ───────────────────────────────────────────────

describe('DesignClassifier', () => {
  describe('CLASSIFIER_SYSTEM_PROMPT', () => {
    it('contains content type detection rules', () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('metrics-overview');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('data-table');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('multi-dataset');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('config-review');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('audit-report');
    });

    it('contains widget selection rules', () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('stat-card');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('table');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('key-value');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('badge-grid');
    });

    it('contains chart/gauge guidance', () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('SPARINGLY');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('useVisualization:false');
    });

    it('contains layout pattern mapping', () => {
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('dashboard-metrics');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('single-table');
      expect(CLASSIFIER_SYSTEM_PROMPT).toContain('tabbed-detail');
    });
  });

  describe('classify()', () => {
    it('classifies metrics-overview content', async () => {
      const llm = createMockClassifierLLM(metricsClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'system',
        command: 'df -h',
        cleanOutput: 'Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 50G 20G 28G 42% /',
      });

      expect(result.contentType).toBe('metrics-overview');
      expect(result.layoutPattern).toBe('dashboard-metrics');
      expect(result.expectedWidgets).toContain('stat-card');
      expect(result.useVisualization).toBe(false);
    });

    it('classifies data-table content', async () => {
      const llm = createMockClassifierLLM(tableClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'dpkg',
        command: 'dpkg -l',
        cleanOutput: 'ii  bash  5.1-2  amd64  GNU Bourne Again SHell\nii  curl  7.81  amd64  command line tool',
      });

      expect(result.contentType).toBe('data-table');
      expect(result.layoutPattern).toBe('single-table');
      expect(result.expectedWidgets).toContain('table');
    });

    it('classifies multi-dataset content', async () => {
      const llm = createMockClassifierLLM(multiDatasetClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'network',
        command: 'ip addr && ss -tlnp && ip route',
        cleanOutput: 'eth0: <BROADCAST> mtu 1500\n  inet 192.168.1.100/24\nLISTEN 0 128 0.0.0.0:22 0.0.0.0:*',
      });

      expect(result.contentType).toBe('multi-dataset');
      expect(result.layoutPattern).toBe('tabbed-detail');
      expect(result.sectionCount).toBe(3);
    });

    it('classifies audit-report content', async () => {
      const llm = createMockClassifierLLM(auditClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'security',
        command: 'lynis audit system',
        cleanOutput: '[WARNING] Found 3 critical issues\nCRIT: Root password is empty',
      });

      expect(result.contentType).toBe('audit-report');
      expect(result.expectedWidgets).toContain('alert');
    });

    it('classifies config-review content', async () => {
      const llm = createMockClassifierLLM(configClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'nginx',
        command: 'cat /etc/nginx/nginx.conf',
        cleanOutput: 'worker_processes auto;\nevents {\n  worker_connections 1024;\n}',
      });

      expect(result.contentType).toBe('config-review');
      expect(result.layoutPattern).toBe('config-viewer');
      expect(result.expectedWidgets).toContain('code-block');
    });

    it('respects useVisualization flag', async () => {
      const llm = createMockClassifierLLM(diskWithVisualization);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'system',
        command: 'df -h',
        cleanOutput: '/dev/sda1 50G 43G 5G 87% /',
      });

      expect(result.useVisualization).toBe(true);
      expect(result.visualizationReason).toContain('87%');
      expect(result.expectedWidgets).toContain('gauge');
    });

    it('calls LLM with classifier system prompt', async () => {
      const llm = createMockClassifierLLM(metricsClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      await classifier.classify({
        tool: 'system',
        command: 'df -h',
        cleanOutput: 'some output',
      });

      expect(llm.parseText).toHaveBeenCalledTimes(1);
      const call = vi.mocked(llm.parseText).mock.calls[0][0];
      expect(call.systemPrompt).toBe(CLASSIFIER_SYSTEM_PROMPT);
      expect(call.schema).toBe(DesignClassificationSchema);
    });

    it('truncates output to 2000 chars in prompt', async () => {
      const llm = createMockClassifierLLM(metricsClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const longOutput = 'x'.repeat(5000);
      await classifier.classify({
        tool: 'system',
        command: 'test',
        cleanOutput: longOutput,
      });

      const call = vi.mocked(llm.parseText).mock.calls[0][0];
      // The user prompt should contain the truncated output
      expect(call.userPrompt!.length).toBeLessThan(5000);
    });

    it('includes valid layout pattern IDs in prompt', async () => {
      const llm = createMockClassifierLLM(metricsClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      await classifier.classify({
        tool: 'system',
        command: 'test',
        cleanOutput: 'output',
      });

      const call = vi.mocked(llm.parseText).mock.calls[0][0];
      expect(call.userPrompt).toContain('dashboard-metrics');
      expect(call.userPrompt).toContain('single-table');
      expect(call.userPrompt).toContain('tabbed-detail');
    });

    it('falls back to default pattern for unknown layoutPattern', async () => {
      const badClassification: DesignClassification = {
        ...metricsClassification,
        layoutPattern: 'nonexistent-pattern',
      };
      const llm = createMockClassifierLLM(badClassification);
      const classifier = new DesignClassifier({ llmProvider: llm });

      const result = await classifier.classify({
        tool: 'system',
        command: 'df -h',
        cleanOutput: 'output',
      });

      // Should fall back to the default for metrics-overview
      expect(result.layoutPattern).toBe('dashboard-metrics');
    });

    it('tracks LLM usage when tracker is provided', async () => {
      const llm = createMockClassifierLLM(metricsClassification);
      const mockTracker = {
        recordCall: vi.fn(),
        getStats: vi.fn(),
        reset: vi.fn(),
      };
      const classifier = new DesignClassifier({
        llmProvider: llm,
        usageTracker: mockTracker as unknown as import('../../src/llm/usage-tracker.js').LLMUsageTracker,
      });

      await classifier.classify({
        tool: 'system',
        command: 'df -h',
        cleanOutput: 'output',
      });

      expect(mockTracker.recordCall).toHaveBeenCalledTimes(1);
      expect(mockTracker.recordCall).toHaveBeenCalledWith(
        expect.objectContaining({
          command: 'classify:df -h',
          model: 'gpt-4o-mini',
        }),
      );
    });
  });

  describe('DesignClassificationSchema', () => {
    it('validates a correct classification', () => {
      const result = DesignClassificationSchema.parse(metricsClassification);
      expect(result.contentType).toBe('metrics-overview');
      expect(result.layoutPattern).toBe('dashboard-metrics');
    });

    it('validates all content types', () => {
      const contentTypes = [
        'metrics-overview', 'data-table', 'multi-dataset', 'config-review',
        'status-board', 'log-analysis', 'tree-hierarchy', 'audit-report',
        'comparison', 'detail-view',
      ];

      for (const ct of contentTypes) {
        const result = DesignClassificationSchema.parse({
          ...metricsClassification,
          contentType: ct,
        });
        expect(result.contentType).toBe(ct);
      }
    });

    it('rejects invalid content type', () => {
      expect(() =>
        DesignClassificationSchema.parse({
          ...metricsClassification,
          contentType: 'invalid-type',
        }),
      ).toThrow();
    });

    it('rejects invalid expected widgets', () => {
      expect(() =>
        DesignClassificationSchema.parse({
          ...metricsClassification,
          expectedWidgets: ['invalid-widget'],
        }),
      ).toThrow();
    });

    it('accepts useVisualization true with reason', () => {
      const result = DesignClassificationSchema.parse(diskWithVisualization);
      expect(result.useVisualization).toBe(true);
      expect(result.visualizationReason).toBeTruthy();
    });

    it('accepts useVisualization false without reason', () => {
      const result = DesignClassificationSchema.parse(metricsClassification);
      expect(result.useVisualization).toBe(false);
    });

    it('does NOT recommend chart for plain table data', () => {
      // This validates the classifier behavior conceptually
      const result = DesignClassificationSchema.parse(tableClassification);
      expect(result.useVisualization).toBe(false);
      expect(result.expectedWidgets).not.toContain('chart');
      expect(result.expectedWidgets).not.toContain('gauge');
    });

    it('does NOT recommend chart for multi-dataset', () => {
      const result = DesignClassificationSchema.parse(multiDatasetClassification);
      expect(result.useVisualization).toBe(false);
      expect(result.expectedWidgets).not.toContain('chart');
    });
  });
});
