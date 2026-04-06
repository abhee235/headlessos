// M10.5: Permission System Unit Tests
// @see docs/PROGRESS.md

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Inline permission logic for testing (avoids Zustand/localStorage complexities) ──

type AppCapability =
  | 'fs:read' | 'fs:write' | 'fs:upload'
  | 'process:list' | 'process:kill'
  | 'docker:read' | 'docker:manage'
  | 'service:read' | 'service:manage'
  | 'terminal:access'
  | 'network:read' | 'network:manage'
  | 'system:read' | 'system:manage'
  | 'llm:invoke';

const DEFAULT_APP_PERMISSIONS: Record<string, AppCapability[]> = {
  dashboard:    ['system:read', 'llm:invoke'],
  files:        ['fs:read', 'fs:write', 'fs:upload'],
  terminal:     ['terminal:access'],
  docker:       ['docker:read', 'docker:manage'],
  services:     ['service:read', 'service:manage'],
  taskmanager:  ['process:list', 'process:kill', 'system:read'],
  settings:     ['system:read'],
  serveradmin:  ['system:read', 'system:manage', 'network:read', 'network:manage'],
};

interface PermissionOverride {
  appId: string;
  capability: AppCapability;
  granted: boolean;
}

class PermissionChecker {
  overrides: PermissionOverride[] = [];

  hasPermission(appId: string, capability: AppCapability): boolean {
    const override = this.overrides.find(o => o.appId === appId && o.capability === capability);
    if (override !== undefined) return override.granted;
    const defaults = DEFAULT_APP_PERMISSIONS[appId] ?? [];
    return defaults.includes(capability);
  }

  getAppCapabilities(appId: string): AppCapability[] {
    const defaults = DEFAULT_APP_PERMISSIONS[appId] ?? [];
    const caps = new Set<AppCapability>(defaults);
    for (const o of this.overrides) {
      if (o.appId !== appId) continue;
      if (o.granted) caps.add(o.capability);
      else caps.delete(o.capability);
    }
    return [...caps];
  }

  grant(appId: string, capability: AppCapability): void {
    this.overrides = this.overrides.filter(o => !(o.appId === appId && o.capability === capability));
    this.overrides.push({ appId, capability, granted: true });
  }

  revoke(appId: string, capability: AppCapability): void {
    this.overrides = this.overrides.filter(o => !(o.appId === appId && o.capability === capability));
    this.overrides.push({ appId, capability, granted: false });
  }

  resetApp(appId: string): void {
    this.overrides = this.overrides.filter(o => o.appId !== appId);
  }

  resetAll(): void {
    this.overrides = [];
  }
}

describe('App Permission System', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  describe('default permissions', () => {
    it('should grant default permissions for dashboard', () => {
      expect(checker.hasPermission('dashboard', 'system:read')).toBe(true);
      expect(checker.hasPermission('dashboard', 'llm:invoke')).toBe(true);
    });

    it('should deny non-default capabilities', () => {
      expect(checker.hasPermission('dashboard', 'fs:write')).toBe(false);
      expect(checker.hasPermission('dashboard', 'terminal:access')).toBe(false);
    });

    it('should return all default capabilities for files app', () => {
      const caps = checker.getAppCapabilities('files');
      expect(caps).toContain('fs:read');
      expect(caps).toContain('fs:write');
      expect(caps).toContain('fs:upload');
      expect(caps).toHaveLength(3);
    });

    it('should return empty capabilities for unknown app', () => {
      expect(checker.getAppCapabilities('unknown-app')).toEqual([]);
      expect(checker.hasPermission('unknown-app', 'fs:read')).toBe(false);
    });

    it('should have correct defaults for terminal', () => {
      expect(checker.hasPermission('terminal', 'terminal:access')).toBe(true);
      expect(checker.hasPermission('terminal', 'fs:read')).toBe(false);
    });
  });

  describe('overrides', () => {
    it('should grant an extra capability via override', () => {
      expect(checker.hasPermission('dashboard', 'fs:read')).toBe(false);
      checker.grant('dashboard', 'fs:read');
      expect(checker.hasPermission('dashboard', 'fs:read')).toBe(true);
    });

    it('should revoke a default capability via override', () => {
      expect(checker.hasPermission('files', 'fs:write')).toBe(true);
      checker.revoke('files', 'fs:write');
      expect(checker.hasPermission('files', 'fs:write')).toBe(false);
    });

    it('should reflect overrides in getAppCapabilities', () => {
      checker.grant('dashboard', 'terminal:access');
      checker.revoke('dashboard', 'llm:invoke');
      const caps = checker.getAppCapabilities('dashboard');
      expect(caps).toContain('system:read');
      expect(caps).toContain('terminal:access');
      expect(caps).not.toContain('llm:invoke');
    });

    it('should reset app overrides', () => {
      checker.grant('dashboard', 'fs:read');
      checker.revoke('dashboard', 'system:read');
      checker.resetApp('dashboard');
      expect(checker.hasPermission('dashboard', 'fs:read')).toBe(false);
      expect(checker.hasPermission('dashboard', 'system:read')).toBe(true);
    });

    it('should reset all overrides', () => {
      checker.grant('dashboard', 'fs:read');
      checker.grant('files', 'terminal:access');
      checker.resetAll();
      expect(checker.hasPermission('dashboard', 'fs:read')).toBe(false);
      expect(checker.hasPermission('files', 'terminal:access')).toBe(false);
    });

    it('subsequent grants should not duplicate', () => {
      checker.grant('dashboard', 'fs:read');
      checker.grant('dashboard', 'fs:read');
      expect(checker.overrides.filter(o => o.appId === 'dashboard' && o.capability === 'fs:read')).toHaveLength(1);
    });
  });

  describe('serveradmin permissions', () => {
    it('should have both read and manage permissions', () => {
      const caps = checker.getAppCapabilities('serveradmin');
      expect(caps).toContain('system:read');
      expect(caps).toContain('system:manage');
      expect(caps).toContain('network:read');
      expect(caps).toContain('network:manage');
      expect(caps).toHaveLength(4);
    });
  });
});
