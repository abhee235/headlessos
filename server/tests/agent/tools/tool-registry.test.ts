// EX2.2: Tool Registry Tests
// @see docs/phases/phase-ex2.md — EX2.2

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../../src/agent/tools/tool-registry.js';
import type { AgentTool, ToolResult } from '../../../src/agent/tools/types.js';
import { z } from 'zod';

function makeTool(name: string, tier: 'read' | 'write' | 'local' = 'read'): AgentTool {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: z.object({ input: z.string() }),
    securityTier: tier,
    execute: async (): Promise<ToolResult> => ({ success: true, output: 'ok' }),
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('registers a tool', () => {
      registry.register(makeTool('test-tool'));
      expect(registry.has('test-tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('throws on duplicate registration', () => {
      registry.register(makeTool('dup'));
      expect(() => registry.register(makeTool('dup'))).toThrow('Tool already registered: dup');
    });
  });

  describe('registerAll', () => {
    it('registers multiple tools', () => {
      registry.registerAll([makeTool('a'), makeTool('b'), makeTool('c')]);
      expect(registry.size).toBe(3);
    });
  });

  describe('get', () => {
    it('returns the tool by name', () => {
      const tool = makeTool('find-me');
      registry.register(tool);
      expect(registry.get('find-me')).toBe(tool);
    });

    it('returns undefined for unknown tools', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('returns true for registered tools', () => {
      registry.register(makeTool('exists'));
      expect(registry.has('exists')).toBe(true);
    });

    it('returns false for unregistered tools', () => {
      expect(registry.has('nope')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all registered tools', () => {
      registry.registerAll([makeTool('a'), makeTool('b')]);
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map(t => t.name).sort()).toEqual(['a', 'b']);
    });

    it('returns empty array when no tools registered', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('getNames', () => {
    it('returns all tool names', () => {
      registry.registerAll([makeTool('x'), makeTool('y')]);
      expect(registry.getNames().sort()).toEqual(['x', 'y']);
    });
  });

  describe('getByTier', () => {
    it('filters by security tier', () => {
      registry.registerAll([
        makeTool('read1', 'read'),
        makeTool('write1', 'write'),
        makeTool('local1', 'local'),
        makeTool('read2', 'read'),
      ]);
      expect(registry.getByTier('read')).toHaveLength(2);
      expect(registry.getByTier('write')).toHaveLength(1);
      expect(registry.getByTier('local')).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('removes all tools', () => {
      registry.registerAll([makeTool('a'), makeTool('b')]);
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });
});
