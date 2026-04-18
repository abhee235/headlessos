// EX1.8: DynamicUIGenerator tests
// @see docs/phases/phase-ex1.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import {
  DynamicUIGenerator,
  DYNAMIC_UI_SYSTEM_PROMPT,
  type GenerateInput,
} from '../../src/dynamic-ui/generator.js';
import type { LLMProvider, ParseResult, ParseTextInput } from '../../src/llm/provider.js';
import { OutputCache } from '../../src/cache/output-cache.js';
import { LLMUsageTracker } from '../../src/llm/usage-tracker.js';

// ── Mock LLM Provider ──────────────────────────────────────────────

function createMockLLM(response?: DynamicView): LLMProvider {
  const defaultView: DynamicView = {
    title: 'Test View',
    sidebarItems: [{ id: 'main', label: 'Test' }],
    sections: {
      main: {
        layout: 'stack',
        gap: 'md',
        children: [
          {
            type: 'code-block',
            title: 'Output',
            code: 'parsed data',
            language: 'text',
          },
        ],
      },
    },
  };
  const view = response ?? defaultView;

  return {
    name: 'mock-llm',
    parseText: vi.fn().mockResolvedValue({
      data: view,
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
      model: 'gpt-4o-mini',
    } satisfies ParseResult<DynamicView>),
    parseImage: vi.fn().mockRejectedValue(new Error('Not implemented')),
  };
}

function createFailingLLM(): LLMProvider {
  return {
    name: 'failing-llm',
    parseText: vi.fn().mockRejectedValue(new Error('LLM API error')),
    parseImage: vi.fn().mockRejectedValue(new Error('Not implemented')),
  };
}

// ── Test Helpers ────────────────────────────────────────────────────

const baseInput: GenerateInput = {
  tool: 'system',
  command: 'df -h',
  rawOutput: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   20G   28G  42% /',
  serverId: 'test-server-1',
};

// ── Tests ───────────────────────────────────────────────────────────

describe('DynamicUIGenerator', () => {
  describe('constructor', () => {
    it('creates a generator without any deps', () => {
      const gen = new DynamicUIGenerator();
      expect(gen).toBeDefined();
      expect(gen.getRegistry()).toBeDefined();
    });

    it('creates a generator with all deps', () => {
      const gen = new DynamicUIGenerator({
        llmProvider: createMockLLM(),
        outputCache: new OutputCache(),
        usageTracker: new LLMUsageTracker(),
      });
      expect(gen).toBeDefined();
    });

    it('pre-registers all templates in the registry', () => {
      const gen = new DynamicUIGenerator();
      const templates = gen.getRegistry().listAll();
      expect(templates.length).toBeGreaterThanOrEqual(15);
    });
  });

  describe('generate — with LLM', () => {
    let gen: DynamicUIGenerator;
    let mockLLM: LLMProvider;
    let cache: OutputCache;
    let tracker: LLMUsageTracker;

    beforeEach(() => {
      mockLLM = createMockLLM();
      cache = new OutputCache();
      tracker = new LLMUsageTracker();
      gen = new DynamicUIGenerator({
        llmProvider: mockLLM,
        outputCache: cache,
        usageTracker: tracker,
      });
    });

    it('calls LLM and returns a valid DynamicView', async () => {
      const result = await gen.generate(baseInput);

      expect(result.source).toBe('llm');
      expect(result.view).toBeDefined();
      expect(result.view.title).toBe('Test View');
      DynamicViewSchema.parse(result.view); // must not throw
    });

    it('includes llmStats in the result', async () => {
      const result = await gen.generate(baseInput);

      expect(result.llmStats).toBeDefined();
      expect(result.llmStats!.model).toBe('gpt-4o-mini');
      expect(result.llmStats!.inputTokens).toBe(100);
      expect(result.llmStats!.outputTokens).toBe(200);
      expect(result.llmStats!.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('passes the custom system prompt to LLM', async () => {
      await gen.generate(baseInput);

      // Two-pass: classifier call (index 0) + generator call (last)
      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      expect(generatorCall.systemPrompt).toBe(DYNAMIC_UI_SYSTEM_PROMPT);
    });

    it('passes DynamicViewSchema to LLM', async () => {
      await gen.generate(baseInput);

      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      expect(generatorCall.schema).toBe(DynamicViewSchema);
    });

    it('strips ANSI codes from rawOutput before sending to LLM', async () => {
      const ansiInput = {
        ...baseInput,
        rawOutput: '\x1b[32mGreen text\x1b[0m and \x1b[1mbold\x1b[0m',
      };
      await gen.generate(ansiInput);

      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      expect(generatorCall.rawOutput).not.toContain('\x1b[');
      expect(generatorCall.rawOutput).toContain('Green text');
    });

    it('includes template hint in user prompt when template matches', async () => {
      // 'df -h' matches disk-usage template
      await gen.generate(baseInput);

      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      expect(generatorCall.userPrompt).toContain('Template hint');
      expect(generatorCall.userPrompt).toContain('df -h');
    });

    it('does NOT include template hint for unknown commands', async () => {
      const unknownInput = {
        ...baseInput,
        command: 'some-custom-unknown-command --flag',
      };
      await gen.generate(unknownInput);

      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      expect(generatorCall.userPrompt).not.toContain('Template hint');
    });

    it('populates templateId when a matching template exists', async () => {
      const result = await gen.generate(baseInput);
      expect(result.templateId).toBe('disk-usage');
    });

    it('has no templateId for unknown commands', async () => {
      const result = await gen.generate({
        ...baseInput,
        command: 'totally-unique-no-match-possible',
      });
      expect(result.templateId).toBeUndefined();
    });

    it('truncates very long output to prevent token explosion', async () => {
      const longInput = {
        ...baseInput,
        rawOutput: 'x'.repeat(20_000),
      };
      await gen.generate(longInput);

      const calls = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls;
      const generatorCall = calls[calls.length - 1][0] as ParseTextInput<DynamicView>;
      // The user prompt truncates output to 8000 chars
      expect(generatorCall.userPrompt!.length).toBeLessThan(15_000);
    });
  });

  describe('generate — caching', () => {
    let gen: DynamicUIGenerator;
    let mockLLM: LLMProvider;
    let cache: OutputCache;

    beforeEach(() => {
      mockLLM = createMockLLM();
      cache = new OutputCache();
      gen = new DynamicUIGenerator({
        llmProvider: mockLLM,
        outputCache: cache,
      });
    });

    it('caches first LLM result and returns cache on second call', async () => {
      const result1 = await gen.generate(baseInput);
      expect(result1.source).toBe('llm');
      // Two-pass: classifier + generator = 2 calls per generate
      const callsAfterFirst = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls.length;

      const result2 = await gen.generate(baseInput);
      expect(result2.source).toBe('cache');
      // Cache hit — no new LLM calls
      expect(mockLLM.parseText).toHaveBeenCalledTimes(callsAfterFirst);
      expect(result2.view).toEqual(result1.view);
    });

    it('calls LLM again when output changes', async () => {
      await gen.generate(baseInput);
      const callsAfterFirst = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls.length;

      const changedInput = { ...baseInput, rawOutput: 'Different output' };
      await gen.generate(changedInput);
      // New input = another round of classifier + generator calls
      expect((mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('calls LLM again for a different server', async () => {
      await gen.generate(baseInput);
      const callsAfterFirst = (mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls.length;

      await gen.generate({ ...baseInput, serverId: 'server-2' });
      // Different server = new LLM calls (not cached)
      expect((mockLLM.parseText as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('generate — usage tracking', () => {
    it('records LLM call in usage tracker', async () => {
      const tracker = new LLMUsageTracker();
      const gen = new DynamicUIGenerator({
        llmProvider: createMockLLM(),
        usageTracker: tracker,
      });

      await gen.generate(baseInput);

      const summary = tracker.getSummary();
      // Two-pass: classifier (classify:) + generator (dynamic-ui:) = 2 calls
      expect(summary.totalCalls).toBeGreaterThanOrEqual(1);
      expect(summary.totalInputTokens).toBeGreaterThanOrEqual(100);
      expect(summary.totalOutputTokens).toBeGreaterThanOrEqual(200);
      expect(summary.callsByCommand['dynamic-ui:df -h']).toBe(1);
    });

    it('does not record usage for cache hits', async () => {
      const tracker = new LLMUsageTracker();
      const gen = new DynamicUIGenerator({
        llmProvider: createMockLLM(),
        outputCache: new OutputCache(),
        usageTracker: tracker,
      });

      await gen.generate(baseInput);
      const callsAfterFirst = tracker.getSummary().totalCalls;

      await gen.generate(baseInput); // cache hit — no new LLM calls
      expect(tracker.getSummary().totalCalls).toBe(callsAfterFirst);
    });
  });

  describe('generate — without LLM (offline mode)', () => {
    it('returns matching template when no LLM is configured', async () => {
      const gen = new DynamicUIGenerator(); // no LLM
      const result = await gen.generate(baseInput);

      expect(result.source).toBe('cache');
      expect(result.templateId).toBe('disk-usage');
      DynamicViewSchema.parse(result.view);
    });

    it('throws when no LLM and no matching template', async () => {
      const gen = new DynamicUIGenerator();

      await expect(
        gen.generate({
          ...baseInput,
          command: 'unknown-magic-command',
        }),
      ).rejects.toThrow('No LLM provider configured');
    });
  });

  describe('generate — LLM failure with template fallback', () => {
    it('falls back to template when LLM fails', async () => {
      const gen = new DynamicUIGenerator({
        llmProvider: createFailingLLM(),
      });

      // 'df -h' matches disk-usage template → should fallback
      const result = await gen.generate(baseInput);

      expect(result.source).toBe('cache');
      expect(result.templateId).toBe('disk-usage');
      DynamicViewSchema.parse(result.view);
    });

    it('throws when LLM fails and no matching template', async () => {
      const gen = new DynamicUIGenerator({
        llmProvider: createFailingLLM(),
      });

      await expect(
        gen.generate({
          ...baseInput,
          command: 'totally-unique-no-match',
        }),
      ).rejects.toThrow('LLM API error');
    });
  });

  describe('DYNAMIC_UI_SYSTEM_PROMPT', () => {
    it('contains key instructions for the LLM', () => {
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('UI generator');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('DynamicView JSON');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('stat-card');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('badge-grid');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('template hint');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('Maximum 10 widgets');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('REAL data');
    });

    // EX3-B.1: Design System Rules are auto-generated from layout patterns
    it('contains auto-generated layout pattern rules', () => {
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('auto-generated from pattern registry');
    });

    it('includes pattern IDs from the registry', () => {
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('dashboard-metrics');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('single-table');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('tabbed-detail');
    });

    it('includes gauge and sparkline-stat widget rules', () => {
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('gauge');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('sparkline-stat');
    });

    it('includes anti-patterns', () => {
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('Anti-Patterns');
      expect(DYNAMIC_UI_SYSTEM_PROMPT).toContain('NEVER DO');
    });
  });

  describe('getRegistry', () => {
    it('returns a populated registry', () => {
      const gen = new DynamicUIGenerator();
      const registry = gen.getRegistry();
      expect(registry.listAll().length).toBeGreaterThanOrEqual(15);
    });

    it('can search for templates through the registry', () => {
      const gen = new DynamicUIGenerator();
      const matches = gen.getRegistry().matchCommand('docker ps');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].template.id).toBe('docker-overview');
    });
  });

  describe('generate — multiple commands with template matching', () => {
    let gen: DynamicUIGenerator;

    beforeEach(() => {
      gen = new DynamicUIGenerator({
        llmProvider: createMockLLM(),
      });
    });

    const templateMatchCases: Array<[string, string]> = [
      ['df -h', 'disk-usage'],
      ['docker ps -a', 'docker-overview'],
      ['systemctl status nginx', 'service-status'],
      ['git status', 'git-status'],
      ['top -bn1', 'process-top'],
      ['ss -tulnp', 'port-table'],
      ['cat /var/log/syslog', 'system-logs-journal'],
      ['crontab -l', 'cron-schedule'],
    ];

    for (const [command, expectedTemplate] of templateMatchCases) {
      it(`matches "${command}" to template "${expectedTemplate}"`, async () => {
        const result = await gen.generate({
          ...baseInput,
          command,
        });
        expect(result.templateId).toBe(expectedTemplate);
      });
    }
  });

  describe('generate — LLM response validation', () => {
    it('returns LLM-generated views that pass DynamicViewSchema', async () => {
      const customView: DynamicView = {
        title: 'Disk Usage',
        description: 'Current disk utilization',
        sidebarItems: [{ id: 'main', label: 'Disk' }],
        sections: {
          main: {
            layout: 'grid',
            columns: 2,
            children: [
              {
                type: 'progress-bar',
                title: 'Root Partition',
                value: 42,
                label: '42% used',
              },
              {
                type: 'key-value',
                title: 'Disk Info',
                pairs: [
                  { key: 'Filesystem', value: '/dev/sda1' },
                  { key: 'Total', value: '50G' },
                ],
              },
            ],
          },
        },
      };

      const gen = new DynamicUIGenerator({
        llmProvider: createMockLLM(customView),
      });

      const result = await gen.generate(baseInput);
      DynamicViewSchema.parse(result.view);
      const mainSection = result.view.sections.main as { children: Array<{ type: string }> };
      expect(mainSection.children).toHaveLength(2);
      expect(mainSection.children[0].type).toBe('progress-bar');
    });
  });
});
