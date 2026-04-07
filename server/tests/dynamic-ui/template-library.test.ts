// EX1.7: Template Library tests
// @see docs/phases/phase-ex1.md

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { TemplateRegistry, resetTemplateRegistry, getTemplateRegistry } from '../../src/dynamic-ui/template-registry.js';
import { ALL_TEMPLATES } from '../../src/dynamic-ui/templates/index.js';
import type { UITemplate } from '../../src/dynamic-ui/types.js';

// ─── Schema Validation: every template must pass DynamicViewSchema ───

describe('Template Library — Schema Validation', () => {
  it('has at least 15 templates', () => {
    expect(ALL_TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(ALL_TEMPLATES.map((t) => [t.id, t]))(
    'template "%s" passes DynamicViewSchema validation',
    (_id, template) => {
      const t = template as UITemplate;
      const result = DynamicViewSchema.safeParse(t.schema);
      if (!result.success) {
        // Show which template failed and why
        throw new Error(
          `Template "${t.id}" failed validation:\n${result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
        );
      }
      expect(result.success).toBe(true);
    },
  );

  it.each(ALL_TEMPLATES.map((t) => [t.id, t]))(
    'template "%s" has required metadata fields',
    (_id, template) => {
      const t = template as UITemplate;
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.tags).toBeInstanceOf(Array);
      expect(t.tags.length).toBeGreaterThan(0);
      expect(t.matchPatterns).toBeInstanceOf(Array);
      expect(t.matchPatterns.length).toBeGreaterThan(0);
    },
  );

  it('all template IDs are unique', () => {
    const ids = ALL_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all templates have a title in their schema', () => {
    for (const t of ALL_TEMPLATES) {
      expect(t.schema.title).toBeTruthy();
    }
  });

  it('all template matchPatterns are valid regex', () => {
    for (const t of ALL_TEMPLATES) {
      for (const pattern of t.matchPatterns) {
        expect(() => new RegExp(pattern, 'i')).not.toThrow();
      }
    }
  });
});

// ─── Template Registry ──────────────────────────────────────────────

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.listAll()).toEqual([]);
  });

  it('registers a single template', () => {
    registry.register(ALL_TEMPLATES[0]);
    expect(registry.size).toBe(1);
  });

  it('registers all templates', () => {
    registry.registerAll(ALL_TEMPLATES);
    expect(registry.size).toBe(ALL_TEMPLATES.length);
  });

  it('getById returns the correct template', () => {
    registry.registerAll(ALL_TEMPLATES);
    const t = registry.getById('docker-overview');
    expect(t).toBeDefined();
    expect(t!.name).toBe('Docker Overview');
  });

  it('getById returns undefined for unknown id', () => {
    registry.registerAll(ALL_TEMPLATES);
    expect(registry.getById('nonexistent')).toBeUndefined();
  });

  it('replaces template with same id', () => {
    const t1 = { ...ALL_TEMPLATES[0], name: 'Original' };
    const t2 = { ...ALL_TEMPLATES[0], name: 'Replaced' };
    registry.register(t1);
    registry.register(t2);
    expect(registry.size).toBe(1);
    expect(registry.getById(t1.id)!.name).toBe('Replaced');
  });

  it('listAll returns all registered templates', () => {
    registry.registerAll(ALL_TEMPLATES);
    const all = registry.listAll();
    expect(all.length).toBe(ALL_TEMPLATES.length);
  });
});

// ─── Search ─────────────────────────────────────────────────────────

describe('TemplateRegistry — Search', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
    registry.registerAll(ALL_TEMPLATES);
  });

  it('searchByTag finds templates with matching tag', () => {
    const results = registry.searchByTag('docker');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((t) => t.id === 'docker-overview')).toBe(true);
  });

  it('searchByTag is case-insensitive', () => {
    const results = registry.searchByTag('DOCKER');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('searchByTag returns empty for unknown tag', () => {
    const results = registry.searchByTag('blockchain');
    expect(results).toEqual([]);
  });

  it('search finds by name', () => {
    const results = registry.search('Git Repository');
    expect(results.some((t) => t.id === 'git-status')).toBe(true);
  });

  it('search finds by description', () => {
    const results = registry.search('container');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('search finds by tag', () => {
    const results = registry.search('security');
    expect(results.some((t) => t.id === 'security-audit')).toBe(true);
  });

  it('search is case-insensitive', () => {
    const results = registry.search('NETWORK');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('search returns empty for no match', () => {
    const results = registry.search('zzz_no_match_here');
    expect(results).toEqual([]);
  });
});

// ─── Command Matching ───────────────────────────────────────────────

describe('TemplateRegistry — Command Matching', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry();
    registry.registerAll(ALL_TEMPLATES);
  });

  it('matches "docker ps" to docker-overview', () => {
    const matches = registry.matchCommand('docker ps');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('docker-overview');
  });

  it('matches "df -h" to disk-usage', () => {
    const matches = registry.matchCommand('df -h');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('disk-usage');
  });

  it('matches "ps aux" to process-top', () => {
    const matches = registry.matchCommand('ps aux');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('process-top');
  });

  it('matches "git status" to git-status', () => {
    const matches = registry.matchCommand('git status');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('git-status');
  });

  it('matches "systemctl status nginx" to service-status', () => {
    const matches = registry.matchCommand('systemctl status nginx');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('service-status');
  });

  it('matches "journalctl -u sshd" to log-viewer', () => {
    const matches = registry.matchCommand('journalctl -u sshd');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('log-viewer');
  });

  it('matches "ss -tulnp" to port-table', () => {
    const matches = registry.matchCommand('ss -tulnp');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('port-table');
  });

  it('matches "crontab -l" to cron-schedule', () => {
    const matches = registry.matchCommand('crontab -l');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('cron-schedule');
  });

  it('matches "cat /etc/nginx/nginx.conf" to config-file', () => {
    const matches = registry.matchCommand('cat /etc/nginx/nginx.conf');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.template.id === 'config-file')).toBe(true);
  });

  it('matches "ip addr" to network-info', () => {
    const matches = registry.matchCommand('ip addr');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('network-info');
  });

  it('matches "who" to user-list', () => {
    const matches = registry.matchCommand('who');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('user-list');
  });

  it('matches "dpkg -l" to package-list', () => {
    const matches = registry.matchCommand('dpkg -l');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('package-list');
  });

  it('matches "uname -a" to system-overview', () => {
    const matches = registry.matchCommand('uname -a');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('system-overview');
  });

  it('matches "fail2ban-client status" to security-audit', () => {
    const matches = registry.matchCommand('fail2ban-client status');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('security-audit');
  });

  it('matches "psql -c" to database-info', () => {
    const matches = registry.matchCommand('psql mydb -c "SELECT 1"');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].template.id).toBe('database-info');
  });

  it('returns empty for unrecognized command', () => {
    const matches = registry.matchCommand('some-random-tool --help');
    expect(matches).toEqual([]);
  });

  it('is case-insensitive', () => {
    const matches = registry.matchCommand('Docker PS');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('returns matches sorted by confidence descending', () => {
    const matches = registry.matchCommand('docker ps -a');
    if (matches.length >= 2) {
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
      }
    }
  });

  it('match includes confidence between 0 and 1', () => {
    const matches = registry.matchCommand('docker ps');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].confidence).toBeGreaterThan(0);
    expect(matches[0].confidence).toBeLessThanOrEqual(1);
  });

  it('match includes the matched pattern', () => {
    const matches = registry.matchCommand('docker ps');
    expect(matches[0].matchedPattern).toBeTruthy();
  });
});

// ─── Singleton ──────────────────────────────────────────────────────

describe('TemplateRegistry — Singleton', () => {
  beforeEach(() => {
    resetTemplateRegistry();
  });

  it('getTemplateRegistry returns same instance', () => {
    const a = getTemplateRegistry();
    const b = getTemplateRegistry();
    expect(a).toBe(b);
  });

  it('resetTemplateRegistry creates a new instance', () => {
    const a = getTemplateRegistry();
    a.registerAll(ALL_TEMPLATES);
    expect(a.size).toBe(ALL_TEMPLATES.length);

    resetTemplateRegistry();
    const b = getTemplateRegistry();
    expect(b.size).toBe(0);
    expect(a).not.toBe(b);
  });
});
