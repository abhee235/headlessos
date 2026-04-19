// EX3-D.4: Template QA & Progressive Rendering tests
// Tests for: new templates, FakeLLMGenerator, WorkingView, multi-step prompt
// @see docs/phases/phase-ex3.md

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { ALL_TEMPLATES } from '../../src/dynamic-ui/templates/index.js';
import { TemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import { FakeLLMGenerator } from '../../src/dynamic-ui/fake-generator.js';
import { WorkingView, createSkeleton } from '../../src/dynamic-ui/working-view.js';
import { buildMultiStepPrompt, formatClassification } from '../../src/dynamic-ui/prompts/multi-step.js';
import type { Widget, Layout } from 'headlessos-shared/schemas/dynamic-view';

// ─── EX3-B.3: Template Count Validation ────────────────────────────

describe('EX3-B.3: Template Library — Expanded to 27', () => {
  it('has at least 25 templates (target: 27)', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(25);
  });

  it('has exactly 27 templates', () => {
    expect(ALL_TEMPLATES.length).toBe(27);
  });

  const newTemplateIds = [
    'docker-images',
    'docker-compose',
    'memory-analysis',
    'network-interfaces',
    'system-logs-journal',
    'ssl-certificates',
    'environment-variables',
    'git-repositories',
    'database-status',
    'backup-status',
    'kernel-modules',
    'port-scan',
  ];

  it.each(newTemplateIds)('new template "%s" exists in ALL_TEMPLATES', (id) => {
    const found = ALL_TEMPLATES.find((t) => t.id === id);
    expect(found).toBeDefined();
  });

  it.each(newTemplateIds)('new template "%s" passes DynamicViewSchema validation', (id) => {
    const template = ALL_TEMPLATES.find((t) => t.id === id)!;
    const result = DynamicViewSchema.safeParse(template.schema);
    if (!result.success) {
      throw new Error(
        `Template "${id}" failed validation:\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it.each(newTemplateIds)('new template "%s" has a layoutPattern', (id) => {
    const template = ALL_TEMPLATES.find((t) => t.id === id)!;
    expect(template.layoutPattern).toBeTruthy();
  });

  it.each(newTemplateIds)('new template "%s" has valid matchPatterns', (id) => {
    const template = ALL_TEMPLATES.find((t) => t.id === id)!;
    expect(template.matchPatterns.length).toBeGreaterThan(0);
    for (const pattern of template.matchPatterns) {
      expect(() => new RegExp(pattern, 'i')).not.toThrow();
    }
  });
});

// ─── EX3-B.3: New Template Command Matching ────────────────────────

describe('EX3-B.3: New Template Command Matching', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
    registry.registerAll(ALL_TEMPLATES);
  });

  it('matches "docker images" to docker-images', () => {
    const matches = registry.matchCommand('docker images');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('docker-images');
  });

  it('matches "docker image ls" to docker-images', () => {
    const matches = registry.matchCommand('docker image ls');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('docker-images');
  });

  it('matches "docker compose ps" to a docker template', () => {
    const matches = registry.matchCommand('docker compose ps');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // May match docker-overview or docker-compose — both have docker patterns
    expect(matches.some((m) => m.template.id === 'docker-compose')).toBe(true);
  });

  it('matches "docker-compose config" to docker-compose', () => {
    // docker-compose config is specific to compose only
    const matches = registry.matchCommand('docker compose config');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('docker-compose');
  });

  it('matches "free -m" to memory-analysis', () => {
    const matches = registry.matchCommand('free -m');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('memory-analysis');
  });

  it('matches "cat /proc/meminfo" to memory-analysis', () => {
    const matches = registry.matchCommand('cat /proc/meminfo');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('memory-analysis');
  });

  it('matches "ip link show" to network-interfaces', () => {
    const matches = registry.matchCommand('ip link show');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('network-interfaces');
  });

  it('matches "journalctl --since today" to a journal/log template', () => {
    const matches = registry.matchCommand('journalctl --since today');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // May match log-viewer or system-logs-journal — both have journalctl patterns
    expect(matches.some((m) => m.template.id === 'system-logs-journal')).toBe(true);
  });

  it('matches "openssl s_client -connect example.com:443" to ssl-certificates', () => {
    const matches = registry.matchCommand('openssl s_client -connect example.com:443');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('ssl-certificates');
  });

  it('matches "printenv" to environment-variables', () => {
    const matches = registry.matchCommand('printenv');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('environment-variables');
  });

  it('matches "env" to environment-variables', () => {
    const matches = registry.matchCommand('env');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('environment-variables');
  });

  it('matches "find / -name .git -type d" to git-repositories', () => {
    const matches = registry.matchCommand('find / -name .git -type d');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('git-repositories');
  });

  it('matches "pg_isready" to a database template', () => {
    const matches = registry.matchCommand('pg_isready');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // May match database-info or database-status — both have postgres patterns
    expect(matches[0].template.id).toMatch(/^database-/);
  });

  it('matches "mysqladmin status" to a database template', () => {
    const matches = registry.matchCommand('mysqladmin status');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toMatch(/^database-/);
  });

  it('matches "restic snapshots" to backup-status', () => {
    const matches = registry.matchCommand('restic snapshots');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('backup-status');
  });

  it('matches "lsmod" to kernel-modules', () => {
    const matches = registry.matchCommand('lsmod');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('kernel-modules');
  });

  it('matches "nmap -sT localhost" to port-scan', () => {
    const matches = registry.matchCommand('nmap -sT localhost');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('port-scan');
  });
});

// ─── EX3-B.4: FakeLLM Generator ────────────────────────────────────

describe('EX3-B.4: FakeLLMGenerator', () => {
  let generator: FakeLLMGenerator;

  beforeEach(() => {
    generator = new FakeLLMGenerator();
  });

  it('initializes with all templates', () => {
    expect(generator.size).toBe(ALL_TEMPLATES.length);
  });

  it('initializes with custom subset of templates', () => {
    const subset = ALL_TEMPLATES.slice(0, 3);
    const gen = new FakeLLMGenerator(subset);
    expect(gen.size).toBe(3);
  });

  it('generate() returns a valid DynamicView for known template', () => {
    const view = generator.generate('docker-overview');
    const result = DynamicViewSchema.safeParse(view);
    expect(result.success).toBe(true);
    expect(view.title).toBeTruthy();
  });

  it('generate() throws for unknown template', () => {
    expect(() => generator.generate('nonexistent-template')).toThrow('Template not found');
  });

  it('generateFromCommand() matches and generates a view', () => {
    const view = generator.generateFromCommand('docker ps');
    expect(view).not.toBeNull();
    expect(view!.title).toBeTruthy();
    const result = DynamicViewSchema.safeParse(view);
    expect(result.success).toBe(true);
  });

  it('generateFromCommand() returns null for unrecognized command', () => {
    const view = generator.generateFromCommand('some-random-tool --help');
    expect(view).toBeNull();
  });

  it('generateAll() generates views for all templates', () => {
    const results = generator.generateAll();
    expect(results.length).toBe(ALL_TEMPLATES.length);
    for (const { templateId, templateName, view } of results) {
      expect(templateId).toBeTruthy();
      expect(templateName).toBeTruthy();
      const parsed = DynamicViewSchema.safeParse(view);
      expect(parsed.success).toBe(true);
    }
  });

  it('getAvailableTemplates() returns all template IDs', () => {
    const ids = generator.getAvailableTemplates();
    expect(ids.length).toBe(ALL_TEMPLATES.length);
    expect(ids).toContain('docker-overview');
    expect(ids).toContain('docker-images');
    expect(ids).toContain('memory-analysis');
  });

  it('hasTemplate() returns true for known template', () => {
    expect(generator.hasTemplate('docker-overview')).toBe(true);
    expect(generator.hasTemplate('memory-analysis')).toBe(true);
  });

  it('hasTemplate() returns false for unknown template', () => {
    expect(generator.hasTemplate('nonexistent')).toBe(false);
  });

  // Test all 12 new templates can be generated
  const newTemplateIds = [
    'docker-images',
    'docker-compose',
    'memory-analysis',
    'network-interfaces',
    'system-logs-journal',
    'ssl-certificates',
    'environment-variables',
    'git-repositories',
    'database-status',
    'backup-status',
    'kernel-modules',
    'port-scan',
  ];

  it.each(newTemplateIds)('generates valid view for new template "%s"', (id) => {
    const view = generator.generate(id);
    const result = DynamicViewSchema.safeParse(view);
    if (!result.success) {
      throw new Error(
        `FakeLLMGenerator failed for "${id}":\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      );
    }
    expect(result.success).toBe(true);
    expect(view.title).toBeTruthy();
  });
});

// ─── EX3-C.1: WorkingView & Mutations ──────────────────────────────

describe('EX3-C.1: WorkingView', () => {
  let skeleton: ReturnType<typeof createSkeleton>;

  beforeEach(() => {
    skeleton = createSkeleton({
      title: 'Test View',
      description: 'Test description',
      icon: 'Monitor',
      sidebarItems: [
        { id: 'overview', label: 'Overview', icon: 'LayoutDashboard' },
        { id: 'details', label: 'Details', icon: 'List' },
      ],
      sectionLayouts: {
        overview: 'stack',
        details: 'stack',
      },
    });
  });

  it('createSkeleton creates valid DynamicView', () => {
    const result = DynamicViewSchema.safeParse(skeleton);
    expect(result.success).toBe(true);
    expect(skeleton.title).toBe('Test View');
    expect(skeleton.sidebarItems).toHaveLength(2);
    expect(Object.keys(skeleton.sections)).toHaveLength(2);
  });

  it('createSkeleton creates empty sections by layout type', () => {
    const skel = createSkeleton({
      title: 'Multi Layout',
      sidebarItems: [
        { id: 'stk', label: 'Stack' },
        { id: 'grd', label: 'Grid' },
        { id: 'tbs', label: 'Tabs' },
      ],
      sectionLayouts: { stk: 'stack', grd: 'grid', tbs: 'tabs' },
    });
    expect(skel.sections.stk).toMatchObject({ layout: 'stack' });
    expect(skel.sections.grd).toMatchObject({ layout: 'grid' });
    expect(skel.sections.tbs).toMatchObject({ layout: 'tabs' });
  });

  it('constructor deep-clones the skeleton', () => {
    const wv = new WorkingView(skeleton);
    skeleton.title = 'Modified Original';
    expect(wv.getView().title).toBe('Test View');
  });

  it('addWidget appends to section children', () => {
    const wv = new WorkingView(skeleton);
    const widget: Widget = {
      type: 'stat-card',
      label: 'CPU',
      value: '45%',
      icon: 'Cpu',
      variant: 'default',
    };
    const widgetId = wv.addWidget('overview', widget);
    expect(widgetId).toBeTruthy();
    expect(widgetId).toMatch(/^w-/);

    const view = wv.getView();
    const section = view.sections.overview as Layout & { children: unknown[] };
    expect(section.children).toHaveLength(1);
  });

  it('addWidget throws for unknown section', () => {
    const wv = new WorkingView(skeleton);
    const widget: Widget = { type: 'stat-card', label: 'X', value: '1', icon: null, variant: 'default' };
    expect(() => wv.addWidget('nonexistent', widget)).toThrow('Section "nonexistent" not found');
  });

  it('replaceWidget replaces at index', () => {
    const wv = new WorkingView(skeleton);
    const w1: Widget = { type: 'stat-card', label: 'Old', value: '1', icon: null, variant: 'default' };
    const w2: Widget = { type: 'stat-card', label: 'New', value: '2', icon: null, variant: 'default' };
    wv.addWidget('overview', w1);
    wv.replaceWidget('overview', 0, w2);

    const section = wv.getView().sections.overview as Layout & { children: Widget[] };
    expect(section.children[0].label).toBe('New');
  });

  it('updateMetadata changes title, description, icon', () => {
    const wv = new WorkingView(skeleton);
    wv.updateMetadata({ title: 'Updated Title', description: 'New desc', icon: 'Server' });
    const view = wv.getView();
    expect(view.title).toBe('Updated Title');
    expect(view.description).toBe('New desc');
    expect(view.icon).toBe('Server');
  });

  it('addSidebarItem appends a nav item', () => {
    const wv = new WorkingView(skeleton);
    wv.addSidebarItem({ id: 'extra', label: 'Extra', icon: 'Plus' });
    expect(wv.getView().sidebarItems).toHaveLength(3);
    expect(wv.getView().sidebarItems[2].id).toBe('extra');
  });

  it('addSection creates a new section', () => {
    const wv = new WorkingView(skeleton);
    const layout: Layout = { layout: 'stack', gap: 'sm', children: [] };
    wv.addSection('new-section', layout);
    expect(wv.getView().sections['new-section']).toBeDefined();
  });

  it('getSnapshot returns a deep clone', () => {
    const wv = new WorkingView(skeleton);
    const snap1 = wv.getSnapshot();
    wv.updateMetadata({ title: 'Changed' });
    const snap2 = wv.getSnapshot();
    expect(snap1.title).toBe('Test View');
    expect(snap2.title).toBe('Changed');
  });

  it('getDiff reports changed widget IDs', () => {
    const wv = new WorkingView(skeleton);
    const widget: Widget = { type: 'stat-card', label: 'X', value: '1', icon: null, variant: 'default' };
    wv.addWidget('overview', widget);
    const diff = wv.getDiff();
    expect(diff.changedWidgetIds.length).toBe(1);
    expect(diff.metadataChanged).toBe(false);
    expect(diff.newTabIds.length).toBe(0);
  });

  it('getDiff resets after call', () => {
    const wv = new WorkingView(skeleton);
    const widget: Widget = { type: 'stat-card', label: 'X', value: '1', icon: null, variant: 'default' };
    wv.addWidget('overview', widget);
    wv.getDiff(); // first call resets
    const diff2 = wv.getDiff();
    expect(diff2.changedWidgetIds.length).toBe(0);
  });

  it('getDiff reports metadata changes', () => {
    const wv = new WorkingView(skeleton);
    wv.updateMetadata({ title: 'New' });
    const diff = wv.getDiff();
    expect(diff.metadataChanged).toBe(true);
  });

  it('hasChanges reflects mutations', () => {
    const wv = new WorkingView(skeleton);
    expect(wv.hasChanges()).toBe(false);
    wv.updateMetadata({ title: 'Changed' });
    expect(wv.hasChanges()).toBe(true);
  });

  it('validate returns true for valid view', () => {
    const wv = new WorkingView(skeleton);
    expect(wv.validate()).toBe(true);
  });

  it('addTab works with tabs layout', () => {
    const tabSkeleton = createSkeleton({
      title: 'Tab Test',
      sidebarItems: [{ id: 'main', label: 'Main' }],
      sectionLayouts: { main: 'tabs' },
    });
    const wv = new WorkingView(tabSkeleton);
    wv.addTab('main', {
      id: 'tab-1',
      label: 'First Tab',
      children: [
        { type: 'stat-card', label: 'X', value: '1', icon: null, variant: 'default' },
      ],
    });
    const view = wv.getView();
    const section = view.sections.main as Layout & { tabs: Array<{ id: string }> };
    expect(section.tabs).toHaveLength(1);
    expect(section.tabs[0].id).toBe('tab-1');

    const diff = wv.getDiff();
    expect(diff.newTabIds).toContain('tab-1');
  });

  it('addTab throws for non-tabs section', () => {
    const wv = new WorkingView(skeleton);
    expect(() =>
      wv.addTab('overview', { id: 't', label: 'T', children: [] }),
    ).toThrow('No tabs layout found');
  });
});

// ─── EX3-C.4: Multi-Step Prompt ────────────────────────────────────

describe('EX3-C.4: Multi-Step Executor Prompt', () => {
  it('buildMultiStepPrompt returns a non-empty string', () => {
    const prompt = buildMultiStepPrompt({
      skeleton: '{"title": "Test"}',
      classification: 'monitoring',
      terminalOutput: 'some output',
      patternName: 'dashboard-metrics',
      populationRules: ['Use stat-cards for KPIs', 'Use tables for lists'],
      expectedWidgets: ['stat-card', 'table'],
      useVisualization: true,
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('buildMultiStepPrompt includes skeleton in prompt', () => {
    const prompt = buildMultiStepPrompt({
      skeleton: '{"title": "Docker Overview"}',
      classification: 'containers',
      terminalOutput: 'CONTAINER ID ...',
      patternName: 'single-table',
      populationRules: ['Parse container list'],
      expectedWidgets: ['table'],
      useVisualization: false,
    });
    expect(prompt).toContain('Docker Overview');
  });

  it('buildMultiStepPrompt includes population rules', () => {
    const prompt = buildMultiStepPrompt({
      skeleton: '{}',
      classification: 'system',
      terminalOutput: 'data',
      patternName: 'dashboard-metrics',
      populationRules: ['Rule Alpha', 'Rule Beta'],
      expectedWidgets: ['stat-card'],
      useVisualization: false,
    });
    expect(prompt).toContain('Rule Alpha');
    expect(prompt).toContain('Rule Beta');
  });

  it('buildMultiStepPrompt includes expected widgets', () => {
    const prompt = buildMultiStepPrompt({
      skeleton: '{}',
      classification: 'network',
      terminalOutput: 'data',
      patternName: 'single-table',
      populationRules: [],
      expectedWidgets: ['table', 'badge-grid'],
      useVisualization: false,
    });
    expect(prompt).toContain('table');
    expect(prompt).toContain('badge-grid');
  });

  it('buildMultiStepPrompt includes build order instructions', () => {
    const prompt = buildMultiStepPrompt({
      skeleton: '{}',
      classification: 'monitoring',
      terminalOutput: 'data',
      patternName: 'dashboard-metrics',
      populationRules: [],
      expectedWidgets: [],
      useVisualization: false,
    });
    // Should contain ordering guidance keywords
    expect(prompt).toMatch(/summary|primary|secondary|polish/i);
  });

  it('formatClassification returns formatted string', () => {
    const result = formatClassification({
      contentType: 'container-management',
      layoutPattern: 'dashboard-metrics',
      expectedWidgets: ['stat-card', 'table'],
      sectionCount: 2,
      designNotes: 'Show container stats',
      useVisualization: false,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('container-management');
  });
});

// ─── Layout Pattern Distribution ────────────────────────────────────

describe('Template Layout Pattern Distribution', () => {
  it('templates cover multiple layout patterns', () => {
    const patterns = new Set(ALL_TEMPLATES.map((t) => t.layoutPattern));
    expect(patterns.size).toBeGreaterThanOrEqual(5);
  });

  it('has at least one dashboard-metrics template', () => {
    expect(ALL_TEMPLATES.some((t) => t.layoutPattern === 'dashboard-metrics')).toBe(true);
  });

  it('has at least one single-table template', () => {
    expect(ALL_TEMPLATES.some((t) => t.layoutPattern === 'single-table')).toBe(true);
  });

  it('has at least one tabbed-detail template', () => {
    expect(ALL_TEMPLATES.some((t) => t.layoutPattern === 'tabbed-detail')).toBe(true);
  });

  it('has at least one log-viewer template', () => {
    expect(ALL_TEMPLATES.some((t) => t.layoutPattern === 'log-viewer')).toBe(true);
  });
});
