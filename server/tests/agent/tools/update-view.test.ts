// Tests for the update_view agent tool (progressive rendering)
// @see docs/PROGRESSIVE_RENDERING.md

import { describe, it, expect } from 'vitest';
import { updateViewTool } from '../../../src/agent/tools/update-view.js';
import type { ToolContext } from '../../../src/agent/tools/types.js';

// Mock context — update_view doesn't use SSH or templates
const mockContext = {
  serverId: 'test-server',
  ssh: {} as ToolContext['ssh'],
  templateRegistry: {} as ToolContext['templateRegistry'],
  previousOutputs: new Map(),
} as ToolContext;

describe('update_view tool', () => {
  it('has correct metadata', () => {
    expect(updateViewTool.name).toBe('update_view');
    expect(updateViewTool.securityTier).toBe('local');
    expect(updateViewTool.description).toContain('progressive');
  });

  it('accepts a valid partial view with title only', async () => {
    const result = await updateViewTool.execute(
      { view: JSON.stringify({ title: 'Test View' }) },
      mockContext,
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.partialView).toEqual({ title: 'Test View' });
    expect(result.metadata?.isProgressiveUpdate).toBe(true);
  });

  it('accepts a valid partial view with sections only', async () => {
    const result = await updateViewTool.execute(
      { view: JSON.stringify({ sidebarItems: [{ id: 'main', label: 'Main' }], sections: { main: { layout: 'stack', gap: 'md', children: [] } } }) },
      mockContext,
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.partialView).toHaveProperty('sections');
  });

  it('accepts a skeleton with empty sections', async () => {
    const skeleton = {
      title: 'System Overview',
      icon: 'Activity',
      sidebarItems: [
        { id: 'system', label: 'System', icon: 'Cpu' },
        { id: 'docker', label: 'Docker', icon: 'Box' },
      ],
      sections: {},
    };
    const result = await updateViewTool.execute(
      { view: JSON.stringify(skeleton) },
      mockContext,
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.partialView).toEqual(skeleton);
  });

  it('accepts a complete view', async () => {
    const fullView = {
      title: 'Full View',
      description: 'A complete view',
      icon: 'Activity',
      sidebarItems: [{ id: 'sys', label: 'System', icon: 'Cpu' }],
      sections: {
        sys: { layout: 'stack', gap: 'md', children: [{ type: 'alert', title: 'OK', message: 'All good', variant: 'success' }] },
      },
    };
    const result = await updateViewTool.execute(
      { view: JSON.stringify(fullView) },
      mockContext,
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain('Partial view sent');
  });

  it('rejects invalid JSON', async () => {
    const result = await updateViewTool.execute(
      { view: 'not-json{{{' },
      mockContext,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });

  it('rejects non-object values', async () => {
    const result = await updateViewTool.execute(
      { view: '"just a string"' },
      mockContext,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON object');
  });

  it('rejects object without title or sidebarItems', async () => {
    const result = await updateViewTool.execute(
      { view: JSON.stringify({ description: 'no title or sidebarItems' }) },
      mockContext,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('title');
  });

  it('rejects null', async () => {
    const result = await updateViewTool.execute(
      { view: 'null' },
      mockContext,
    );
    expect(result.success).toBe(false);
  });

  it('rejects arrays', async () => {
    const result = await updateViewTool.execute(
      { view: '[]' },
      mockContext,
    );
    expect(result.success).toBe(false);
  });
});
