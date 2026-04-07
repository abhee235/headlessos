// EX2.6: Post-Generation Reflector — Tests
// @see docs/phases/phase-ex2.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostGenerationReflector,
  ReflectionSchema,
  REFLECTOR_SYSTEM_PROMPT,
  type Reflection,
} from '../../src/agent/reflector.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import type { PlannerHints } from '../../src/agent/planner.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Helpers ──

function createMockModelRouter(responseData: Reflection): ModelRouter {
  return {
    reason: vi.fn().mockResolvedValue({
      data: responseData,
      tokensUsed: { input: 500, output: 300 },
      latencyMs: 800,
      model: 'o4-mini',
    }),
    chat: vi.fn(),
    fast: vi.fn(),
    summarize: vi.fn(),
    getModel: vi.fn(),
    getRoleConfig: vi.fn(),
    getModelMap: vi.fn(),
    hasProvider: vi.fn(),
    updateConfig: vi.fn(),
  } as unknown as ModelRouter;
}

function createDefaultHints(overrides?: Partial<PlannerHints>): PlannerHints {
  return {
    intent: 'Show disk usage information',
    interactivityLevel: 'display-only',
    expectedWidgets: ['stat-card', 'table'],
    templateHint: null,
    dataSourceHints: ['filesystem usage'],
    securityRequirements: {
      needsWrite: false,
      needsSFTP: false,
      sensitiveData: false,
    },
    estimatedComplexity: 'simple',
    skipPostReflection: true,
    ...overrides,
  };
}

function createMockSchema(overrides?: Partial<DynamicView>): DynamicView {
  return {
    title: 'Disk Usage',
    root: {
      layout: 'stack',
      gap: 'md',
      children: [
        {
          type: 'table',
          title: 'Filesystem Usage',
          columns: [
            { key: 'filesystem', label: 'Filesystem' },
            { key: 'size', label: 'Size' },
          ],
          rows: [{ filesystem: '/dev/sda1', size: '50G' }],
        },
      ],
    },
    ...overrides,
  } as DynamicView;
}

function createApprovedReflection(overrides?: Partial<Reflection>): Reflection {
  return {
    approved: true,
    issues: [],
    summary: 'Schema accurately represents the data.',
    ...overrides,
  };
}

function createRejectedReflection(overrides?: Partial<Reflection>): Reflection {
  return {
    approved: false,
    issues: [{
      severity: 'critical',
      description: 'Missing form widget for editable config',
      fix: 'Add a form widget with writeBack config',
      widget: 'config section',
      actualData: 'Config has 5 editable fields',
      didYouMean: 'widget.type should be form, not code-block',
    }],
    summary: 'Schema is missing interactive editing capability.',
    ...overrides,
  };
}

// ── Tests ──

describe('ReflectionSchema', () => {
  it('validates approved reflection', () => {
    const result = ReflectionSchema.safeParse(createApprovedReflection());
    expect(result.success).toBe(true);
  });

  it('validates rejected reflection with issues', () => {
    const result = ReflectionSchema.safeParse(createRejectedReflection());
    expect(result.success).toBe(true);
  });

  it('validates reflection with multiple issues', () => {
    const reflection = createRejectedReflection({
      issues: [
        { severity: 'critical', description: 'Missing form', fix: 'Add form' },
        { severity: 'minor', description: 'Wrong badge color', fix: 'Use success variant' },
        { severity: 'suggestion', description: 'Could add chart', fix: 'Add chart widget' },
      ],
    });
    const result = ReflectionSchema.safeParse(reflection);
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const reflection = {
      approved: false,
      issues: [{ severity: 'invalid', description: 'test', fix: 'test' }],
      summary: 'test',
    };
    const result = ReflectionSchema.safeParse(reflection);
    expect(result.success).toBe(false);
  });

  it('allows optional fields in issues', () => {
    const reflection: Reflection = {
      approved: false,
      issues: [{
        severity: 'critical',
        description: 'Missing data',
        fix: 'Add data',
        // widget, actualData, didYouMean are all optional
      }],
      summary: 'test',
    };
    const result = ReflectionSchema.safeParse(reflection);
    expect(result.success).toBe(true);
  });
});

describe('PostGenerationReflector', () => {
  let reflector: PostGenerationReflector;
  let mockRouter: ModelRouter;

  describe('shouldSkip()', () => {
    it('returns true when skipPostReflection is true', () => {
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter);

      const hints = createDefaultHints({ skipPostReflection: true });
      expect(reflector.shouldSkip(hints)).toBe(true);
    });

    it('returns false when skipPostReflection is false', () => {
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter);

      const hints = createDefaultHints({ skipPostReflection: false });
      expect(reflector.shouldSkip(hints)).toBe(false);
    });
  });

  describe('reflect() — approval scenario', () => {
    beforeEach(() => {
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter);
    });

    it('returns approved reflection', async () => {
      const result = await reflector.reflect(
        'Show me disk usage',
        createDefaultHints(),
        new Map(),
        createMockSchema(),
      );

      expect(result.approved).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.summary).toBeDefined();
    });

    it('calls reasoning model with correct parameters', async () => {
      const collectedData = new Map([
        ['exec_command:df -h', 'Filesystem Size Used\n/dev/sda1 50G 20G'],
      ]);

      await reflector.reflect(
        'Show me disk usage',
        createDefaultHints(),
        collectedData,
        createMockSchema(),
      );

      expect(mockRouter.reason).toHaveBeenCalledOnce();
      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.command).toBe('agent-reflect');
      expect(call.schema).toBe(ReflectionSchema);
      expect(call.systemPrompt).toContain('quality reviewer');
    });

    it('includes collected data in input', async () => {
      const collectedData = new Map([
        ['exec_command:df -h', 'Filesystem Size Used\n/dev/sda1 50G 20G'],
        ['exec_command:free -m', 'Mem: 4096 2048 1024 256'],
      ]);

      await reflector.reflect(
        'Show disk and memory usage',
        createDefaultHints(),
        collectedData,
        createMockSchema(),
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const input = JSON.parse(call.rawOutput);
      expect(input.dataCollected['exec_command:df -h']).toContain('/dev/sda1');
      expect(input.dataCollected['exec_command:free -m']).toContain('4096');
    });

    it('includes hints in input payload', async () => {
      const hints = createDefaultHints({
        intent: 'Show full system overview',
        interactivityLevel: 'interactive',
        expectedWidgets: ['table', 'form', 'stat-card'],
      });

      await reflector.reflect(
        'Show system overview',
        hints,
        new Map(),
        createMockSchema(),
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const input = JSON.parse(call.rawOutput);
      expect(input.hints.intent).toBe('Show full system overview');
      expect(input.hints.interactivityLevel).toBe('interactive');
      expect(input.hints.expectedWidgets).toContain('form');
    });

    it('includes generated schema in input payload', async () => {
      const schema = createMockSchema({ title: 'Custom Title' });

      await reflector.reflect(
        'Show disk usage',
        createDefaultHints(),
        new Map(),
        schema,
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const input = JSON.parse(call.rawOutput);
      expect(input.generatedSchema.title).toBe('Custom Title');
    });

    it('strips critical issues from approved reflection', async () => {
      const badApproval = createApprovedReflection({
        issues: [
          { severity: 'critical', description: 'Accidental critical', fix: 'fix' },
          { severity: 'minor', description: 'Minor issue', fix: 'fix' },
          { severity: 'suggestion', description: 'Suggestion', fix: 'fix' },
        ],
      });
      mockRouter = createMockModelRouter(badApproval);
      reflector = new PostGenerationReflector(mockRouter);

      const result = await reflector.reflect(
        'Show disk usage',
        createDefaultHints(),
        new Map(),
        createMockSchema(),
      );

      expect(result.approved).toBe(true);
      expect(result.issues).toHaveLength(2);
      expect(result.issues.every((i) => i.severity !== 'critical')).toBe(true);
    });
  });

  describe('reflect() — rejection scenario', () => {
    beforeEach(() => {
      mockRouter = createMockModelRouter(createRejectedReflection());
      reflector = new PostGenerationReflector(mockRouter);
    });

    it('returns rejected reflection with issues', async () => {
      const result = await reflector.reflect(
        'Show nginx config and let me edit it',
        createDefaultHints({ interactivityLevel: 'interactive' }),
        new Map(),
        createMockSchema(),
      );

      expect(result.approved).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      expect(result.issues[0].severity).toBe('critical');
    });

    it('includes typed feedback (Aider pattern)', async () => {
      const result = await reflector.reflect(
        'Edit nginx config',
        createDefaultHints({ interactivityLevel: 'interactive' }),
        new Map(),
        createMockSchema(),
      );

      const criticalIssue = result.issues.find((i) => i.severity === 'critical');
      expect(criticalIssue).toBeDefined();
      expect(criticalIssue?.actualData).toBeDefined();
      expect(criticalIssue?.didYouMean).toBeDefined();
      expect(criticalIssue?.fix).toBeDefined();
    });

    it('adds default issue when rejected with empty issues', async () => {
      const emptyRejection: Reflection = {
        approved: false,
        issues: [],
        summary: 'Schema is bad',
      };
      mockRouter = createMockModelRouter(emptyRejection);
      reflector = new PostGenerationReflector(mockRouter);

      const result = await reflector.reflect(
        'Show stuff',
        createDefaultHints(),
        new Map(),
        createMockSchema(),
      );

      expect(result.approved).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].description).toContain('no specific issues');
    });
  });

  describe('data truncation', () => {
    it('truncates long collected data values', async () => {
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter);

      const longValue = 'x'.repeat(1000);
      const collectedData = new Map([
        ['exec_command:large_output', longValue],
      ]);

      await reflector.reflect(
        'Show stuff',
        createDefaultHints(),
        collectedData,
        createMockSchema(),
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const input = JSON.parse(call.rawOutput);
      const dataValue = input.dataCollected['exec_command:large_output'];
      expect(dataValue.length).toBeLessThan(longValue.length);
      expect(dataValue).toContain('1000 chars total');
    });

    it('does not truncate short data values', async () => {
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter);

      const shortValue = 'Short output';
      const collectedData = new Map([
        ['exec_command:short', shortValue],
      ]);

      await reflector.reflect(
        'Show stuff',
        createDefaultHints(),
        collectedData,
        createMockSchema(),
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const input = JSON.parse(call.rawOutput);
      expect(input.dataCollected['exec_command:short']).toBe(shortValue);
    });
  });

  describe('custom options', () => {
    it('uses custom system prompt', async () => {
      const customPrompt = 'Custom reflector prompt for testing';
      mockRouter = createMockModelRouter(createApprovedReflection());
      reflector = new PostGenerationReflector(mockRouter, {
        systemPrompt: customPrompt,
      });

      await reflector.reflect(
        'Show stuff',
        createDefaultHints(),
        new Map(),
        createMockSchema(),
      );

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toBe(customPrompt);
    });
  });

  describe('REFLECTOR_SYSTEM_PROMPT', () => {
    it('contains key evaluation criteria', () => {
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('quality reviewer');
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('Zod validation');
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('semantic quality');
    });

    it('contains approval and rejection criteria', () => {
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('REJECT');
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('APPROVE');
    });

    it('contains Aider typed feedback instructions', () => {
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('actualData');
      expect(REFLECTOR_SYSTEM_PROMPT).toContain('didYouMean');
    });
  });
});
