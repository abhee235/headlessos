// Tests for the progressive fake scenario
// @see docs/PROGRESSIVE_RENDERING.md

import { describe, it, expect } from 'vitest';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO,
  PROGRESSIVE_GOLD_VIEW,
  PROGRESSIVE_PLANNER_HINTS,
} from '../../src/llm/providers/fake-progressive-scenario.js';

describe('progressive system overview scenario', () => {
  it('has correct scenario name', () => {
    expect(PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO.name).toBe('progressive-system-overview');
  });

  it('has 1 parseText response (planner hints)', () => {
    expect(PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO.parseTextResponses).toHaveLength(1);
  });

  it('has 9 chat responses (the 9-turn progressive flow)', () => {
    expect(PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO.chatResponses).toHaveLength(9);
  });

  it('planner hints have correct structure', () => {
    expect(PROGRESSIVE_PLANNER_HINTS.intent).toContain('sidebar');
    expect(PROGRESSIVE_PLANNER_HINTS.estimatedComplexity).toBe('complex');
    expect(PROGRESSIVE_PLANNER_HINTS.expectedWidgets).toContain('table');
    expect(PROGRESSIVE_PLANNER_HINTS.skipPostReflection).toBe(true);
  });

  it('gold view validates against DynamicViewSchema', () => {
    const result = DynamicViewSchema.safeParse(PROGRESSIVE_GOLD_VIEW);
    expect(result.success).toBe(true);
  });

  it('gold view has sidebar layout with 3 sections', () => {
    const root = PROGRESSIVE_GOLD_VIEW.root as Record<string, unknown>;
    expect(root.layout).toBe('sidebar');

    const sidebarItems = root.sidebarItems as Array<{ id: string }>;
    expect(sidebarItems).toHaveLength(3);
    expect(sidebarItems.map(i => i.id)).toEqual(['system', 'docker', 'network']);

    const sections = root.sections as Record<string, unknown[]>;
    expect(Object.keys(sections)).toEqual(['system', 'docker', 'network']);
    expect(sections.system.length).toBeGreaterThan(0);
    expect(sections.docker.length).toBeGreaterThan(0);
    expect(sections.network.length).toBeGreaterThan(0);
  });

  it('chat flow includes update_view calls', () => {
    const chatResponses = PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO.chatResponses;
    const toolNames = chatResponses
      .flatMap(r => r.message.tool_calls ?? [])
      .map(tc => tc.function.name);

    // Should have multiple update_view calls
    const updateViewCalls = toolNames.filter(n => n === 'update_view');
    expect(updateViewCalls.length).toBeGreaterThanOrEqual(3);

    // Should have a final generate_schema call
    expect(toolNames).toContain('generate_schema');

    // generate_schema should be the last tool called
    const lastToolName = toolNames[toolNames.length - 1];
    expect(lastToolName).toBe('generate_schema');
  });

  it('update_view calls have progressively more data', () => {
    const chatResponses = PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO.chatResponses;
    const updateViewCalls = chatResponses
      .filter(r => r.message.tool_calls?.[0]?.function.name === 'update_view');

    expect(updateViewCalls.length).toBeGreaterThanOrEqual(3);

    // Parse each update_view's view argument
    const views = updateViewCalls.map(r => {
      const args = JSON.parse(r.message.tool_calls![0]!.function.arguments);
      return JSON.parse(args.view);
    });

    // First view should be a skeleton (empty sections)
    const firstSections = views[0].root.sections;
    expect(Object.keys(firstSections).length).toBe(0);

    // Last view should have all 3 sections filled
    const lastSections = views[views.length - 1].root.sections;
    expect(Object.keys(lastSections).length).toBe(3);
  });
});
