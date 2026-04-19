// EX2.4: Planner Phase — Tests
// @see docs/phases/phase-ex2.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Planner,
  PlannerHintsSchema,
  PLANNER_SYSTEM_PROMPT,
  type PlannerHints,
} from '../../src/agent/planner.js';
import type { ModelRouter } from '../../src/llm/model-router.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import type { UITemplate } from '../../src/dynamic-ui/types.js';

// ── Test helpers ──

function createMockModelRouter(responseData: PlannerHints): ModelRouter {
  return {
    reason: vi.fn().mockResolvedValue({
      data: responseData,
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
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
    suggestedLayout: 'stack',
    suggestedSections: ['Disk Usage'],
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

function createMockTemplate(id: string, overrides?: Partial<UITemplate>): UITemplate {
  return {
    id,
    name: `Template ${id}`,
    description: `Description for ${id}`,
    tags: ['test'],
    matchPatterns: [],
    schema: {
      title: 'Test',
      sidebarItems: [{ id: 'main', label: 'Test' }],
      sections: {
        main: {
          layout: 'stack',
          children: [],
        },
      },
    },
    ...overrides,
  } as UITemplate;
}

// ── Tests ──

describe('PlannerHintsSchema', () => {
  it('validates a correct hints object', () => {
    const hints = createDefaultHints();
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(true);
  });

  it('validates all interactivity levels', () => {
    for (const level of ['display-only', 'interactive', 'full-management'] as const) {
      const hints = createDefaultHints({ interactivityLevel: level });
      const result = PlannerHintsSchema.safeParse(hints);
      expect(result.success).toBe(true);
    }
  });

  it('validates all complexity levels', () => {
    for (const level of ['simple', 'medium', 'complex'] as const) {
      const hints = createDefaultHints({ estimatedComplexity: level });
      const result = PlannerHintsSchema.safeParse(hints);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid interactivity level', () => {
    const hints = { ...createDefaultHints(), interactivityLevel: 'invalid' };
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = PlannerHintsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('allows null templateHint', () => {
    const hints = createDefaultHints({ templateHint: null });
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(true);
  });

  it('allows undefined templateHint', () => {
    const hints = createDefaultHints();
    delete (hints as Record<string, unknown>).templateHint;
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(true);
  });

  it('allows string templateHint', () => {
    const hints = createDefaultHints({ templateHint: 'system-overview' });
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(true);
  });

  it('validates security requirements', () => {
    const hints = createDefaultHints({
      securityRequirements: {
        needsWrite: true,
        needsSFTP: true,
        sensitiveData: false,
      },
    });
    const result = PlannerHintsSchema.safeParse(hints);
    expect(result.success).toBe(true);
  });
});

describe('Planner', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  describe('plan()', () => {
    it('calls reasoning model and returns valid hints', async () => {
      const expectedHints = createDefaultHints();
      const mockRouter = createMockModelRouter(expectedHints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show me disk usage');

      expect(result.intent).toBe('Show disk usage information');
      expect(result.interactivityLevel).toBe('display-only');
      expect(result.expectedWidgets).toContain('stat-card');
      expect(result.estimatedComplexity).toBe('simple');
      expect(mockRouter.reason).toHaveBeenCalledOnce();
    });

    it('passes user request as rawOutput to reason()', async () => {
      const mockRouter = createMockModelRouter(createDefaultHints());
      const planner = new Planner(mockRouter, registry);

      await planner.plan('Show me nginx config');

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.rawOutput).toContain('Show me nginx config');
      expect(call.command).toBe('planner');
      expect(call.schema).toBe(PlannerHintsSchema);
    });

    it('includes system prompt with template context', async () => {
      registry.register(createMockTemplate('disk-usage', {
        name: 'Disk Usage',
        description: 'Shows disk usage stats',
        tags: ['system', 'disk'],
      }));
      const mockRouter = createMockModelRouter(createDefaultHints());
      const planner = new Planner(mockRouter, registry);

      await planner.plan('Show disk usage');

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('disk-usage');
      expect(call.systemPrompt).toContain('Disk Usage');
      expect(call.systemPrompt).toContain('Templates');
    });

    it('includes server context in user prompt when provided', async () => {
      const mockRouter = createMockModelRouter(createDefaultHints());
      const planner = new Planner(mockRouter, registry);

      await planner.plan('Show me disk usage', 'Ubuntu 22.04, 4GB RAM, nginx installed');

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.rawOutput).toContain('Ubuntu 22.04');
      expect(call.rawOutput).toContain('Server context');
    });

    it('handles no templates gracefully', async () => {
      const mockRouter = createMockModelRouter(createDefaultHints());
      const planner = new Planner(mockRouter, registry);

      await planner.plan('Show me disk usage');

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('No templates are currently registered');
    });

    it('uses custom system prompt when provided', async () => {
      const customPrompt = 'Custom system prompt for testing';
      const mockRouter = createMockModelRouter(createDefaultHints());
      const planner = new Planner(mockRouter, registry, {
        systemPrompt: customPrompt,
      });

      await planner.plan('Test request');

      const call = (mockRouter.reason as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain(customPrompt);
    });
  });

  describe('enrichHints() — template matching', () => {
    it('validates template hint against registry', async () => {
      registry.register(createMockTemplate('disk-usage'));
      const hints = createDefaultHints({ templateHint: 'disk-usage' });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show disk usage');

      expect(result.templateHint).toBe('disk-usage');
    });

    it('clears invalid template hint', async () => {
      const hints = createDefaultHints({ templateHint: 'nonexistent-template' });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show something');

      expect(result.templateHint).toBeNull();
    });

    it('recovers invalid template hint via command matching', async () => {
      registry.register(createMockTemplate('disk-usage', {
        matchPatterns: ['df -h'],
      }));
      const hints = createDefaultHints({ templateHint: 'wrong-template' });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('df -h');

      expect(result.templateHint).toBe('disk-usage');
    });

    it('auto-matches template when LLM returns null hint', async () => {
      registry.register(createMockTemplate('docker-ps', {
        matchPatterns: ['^docker ps'],
      }));
      const hints = createDefaultHints({ templateHint: null });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('docker ps');

      expect(result.templateHint).toBe('docker-ps');
    });

    it('does not auto-match template with low confidence', async () => {
      registry.register(createMockTemplate('docker-ps', {
        matchPatterns: ['^docker ps'],
      }));
      const hints = createDefaultHints({ templateHint: null });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      // This request won't match the docker ps pattern well
      const result = await planner.plan('show me the server overview dashboard');

      expect(result.templateHint).toBeNull();
    });
  });

  describe('enrichHints() — widget validation', () => {
    it('keeps valid widget types', async () => {
      const hints = createDefaultHints({
        expectedWidgets: ['table', 'stat-card', 'chart'],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show overview');

      expect(result.expectedWidgets).toEqual(['table', 'stat-card', 'chart']);
    });

    it('filters out unknown widget types', async () => {
      const hints = createDefaultHints({
        expectedWidgets: ['table', 'unknown-widget', 'chart', 'another-unknown'],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show overview');

      expect(result.expectedWidgets).toEqual(['table', 'chart']);
    });

    it('defaults to table when all widgets are unknown', async () => {
      const hints = createDefaultHints({
        expectedWidgets: ['totally-unknown', 'another-fake'],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show something');

      expect(result.expectedWidgets).toEqual(['table']);
    });

    it('defaults to table when widgets array is empty', async () => {
      const hints = createDefaultHints({
        expectedWidgets: [],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show something');

      expect(result.expectedWidgets).toEqual(['table']);
    });
  });

  describe('enrichHints() — data source hints', () => {
    it('uses intent as data source when hints are empty', async () => {
      const hints = createDefaultHints({
        intent: 'Show disk usage information',
        dataSourceHints: [],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show disk usage');

      expect(result.dataSourceHints).toEqual(['Show disk usage information']);
    });

    it('preserves existing data source hints', async () => {
      const hints = createDefaultHints({
        dataSourceHints: ['filesystem usage', 'mount points'],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show disk usage');

      expect(result.dataSourceHints).toEqual(['filesystem usage', 'mount points']);
    });
  });

  describe('enrichHints() — skipPostReflection', () => {
    it('forces skipPostReflection=true for simple display-only', async () => {
      const hints = createDefaultHints({
        estimatedComplexity: 'simple',
        interactivityLevel: 'display-only',
        skipPostReflection: false, // LLM said false, but we override
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show disk usage');

      expect(result.skipPostReflection).toBe(true);
    });

    it('respects skipPostReflection for complex requests', async () => {
      const hints = createDefaultHints({
        estimatedComplexity: 'complex',
        interactivityLevel: 'interactive',
        skipPostReflection: false,
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Manage Docker containers');

      expect(result.skipPostReflection).toBe(false);
    });

    it('respects skipPostReflection for medium interactive', async () => {
      const hints = createDefaultHints({
        estimatedComplexity: 'medium',
        interactivityLevel: 'interactive',
        skipPostReflection: false,
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Edit nginx config');

      expect(result.skipPostReflection).toBe(false);
    });
  });

  describe('diverse request types', () => {
    it('handles simple display request', async () => {
      const hints = createDefaultHints({
        intent: 'Display current disk usage',
        interactivityLevel: 'display-only',
        expectedWidgets: ['stat-card', 'table'],
        estimatedComplexity: 'simple',
        skipPostReflection: true,
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show me disk usage');

      expect(result.interactivityLevel).toBe('display-only');
      expect(result.estimatedComplexity).toBe('simple');
      expect(result.skipPostReflection).toBe(true);
      expect(result.securityRequirements.needsWrite).toBe(false);
    });

    it('handles interactive config editing request', async () => {
      const hints = createDefaultHints({
        intent: 'Show nginx configuration with editing capability',
        interactivityLevel: 'interactive',
        expectedWidgets: ['form', 'code-block'],
        estimatedComplexity: 'medium',
        skipPostReflection: false,
        securityRequirements: {
          needsWrite: true,
          needsSFTP: true,
          sensitiveData: false,
        },
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show nginx config and let me edit it');

      expect(result.interactivityLevel).toBe('interactive');
      expect(result.securityRequirements.needsWrite).toBe(true);
      expect(result.securityRequirements.needsSFTP).toBe(true);
      expect(result.skipPostReflection).toBe(false);
    });

    it('handles full management request', async () => {
      const hints = createDefaultHints({
        intent: 'Full Docker container management with CRUD operations',
        interactivityLevel: 'full-management',
        expectedWidgets: ['table', 'stat-card', 'form'],
        estimatedComplexity: 'complex',
        skipPostReflection: false,
        dataSourceHints: ['container list', 'docker stats', 'container logs'],
        securityRequirements: {
          needsWrite: true,
          needsSFTP: false,
          sensitiveData: false,
        },
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Manage Docker containers');

      expect(result.interactivityLevel).toBe('full-management');
      expect(result.estimatedComplexity).toBe('complex');
      expect(result.expectedWidgets).toContain('table');
      expect(result.expectedWidgets).toContain('form');
      expect(result.dataSourceHints).toHaveLength(3);
    });

    it('handles security-sensitive request', async () => {
      const hints = createDefaultHints({
        intent: 'Show SSH configuration with security details',
        interactivityLevel: 'display-only',
        expectedWidgets: ['key-value', 'code-block'],
        estimatedComplexity: 'medium',
        skipPostReflection: false,
        securityRequirements: {
          needsWrite: false,
          needsSFTP: true,
          sensitiveData: true,
        },
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show SSH config');

      expect(result.securityRequirements.sensitiveData).toBe(true);
      expect(result.securityRequirements.needsSFTP).toBe(true);
    });

    it('handles monitoring dashboard request', async () => {
      const hints = createDefaultHints({
        intent: 'Show real-time system monitoring dashboard',
        interactivityLevel: 'display-only',
        expectedWidgets: ['stat-card', 'chart', 'progress-bar', 'table'],
        estimatedComplexity: 'medium',
        skipPostReflection: false,
        dataSourceHints: ['CPU usage', 'memory usage', 'disk I/O', 'network traffic', 'process list'],
      });
      const mockRouter = createMockModelRouter(hints);
      const planner = new Planner(mockRouter, registry);

      const result = await planner.plan('Show me a system monitoring dashboard');

      expect(result.expectedWidgets).toContain('chart');
      expect(result.expectedWidgets).toContain('progress-bar');
      expect(result.dataSourceHints.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('PLANNER_SYSTEM_PROMPT', () => {
    it('contains key sections', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('WHAT, not HOW');
      expect(PLANNER_SYSTEM_PROMPT).toContain('display-only');
      expect(PLANNER_SYSTEM_PROMPT).toContain('interactive');
      expect(PLANNER_SYSTEM_PROMPT).toContain('full-management');
      expect(PLANNER_SYSTEM_PROMPT).toContain('Widget Types Available');
      expect(PLANNER_SYSTEM_PROMPT).toContain('Template Matching');
    });

    it('lists all widget types', () => {
      const widgetTypes = [
        'table', 'key-value', 'badge-grid', 'stat-card', 'progress-bar',
        'code-block', 'alert', 'chart', 'tree', 'log-viewer', 'form',
      ];
      for (const w of widgetTypes) {
        expect(PLANNER_SYSTEM_PROMPT).toContain(w);
      }
    });

    it('includes examples', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('disk usage');
      expect(PLANNER_SYSTEM_PROMPT).toContain('nginx config');
      expect(PLANNER_SYSTEM_PROMPT).toContain('Docker containers');
    });

    it('does NOT mention specific commands', () => {
      // The planner should think about WHAT, not HOW
      // It should not mention specific shell commands
      expect(PLANNER_SYSTEM_PROMPT).not.toContain('df -h');
      expect(PLANNER_SYSTEM_PROMPT).not.toContain('docker ps');
      expect(PLANNER_SYSTEM_PROMPT).not.toContain('nginx -T');
    });

    // EX5-A.3: CLI Introspection Prompt Engineering
    it('includes CLI tool UI pattern section', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('CLI Tool UI Pattern');
    });

    it('includes cli-introspection as a recognized dataSourceHint pattern', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('cli-introspection');
    });

    it('includes CLI tool UI examples (restic, nginx)', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('Build me a UI for restic');
      expect(PLANNER_SYSTEM_PROMPT).toContain('Create a management UI for nginx');
    });

    it('instructs setting full-management for CLI tool requests', () => {
      expect(PLANNER_SYSTEM_PROMPT).toContain('full-management');
      expect(PLANNER_SYSTEM_PROMPT).toContain('needsWrite');
    });

    it('instructs setting complex estimatedComplexity for CLI tool requests', () => {
      // The CLI Tool UI Pattern section should mention complex
      const cliSection = PLANNER_SYSTEM_PROMPT.split('CLI Tool UI Pattern')[1];
      expect(cliSection).toContain('complex');
    });
  });
});
