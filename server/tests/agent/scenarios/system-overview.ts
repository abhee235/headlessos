// System Overview — Gold Standard Scenario
//
// Pre-defined LLM responses that simulate the full agent pipeline
// for "show me system overview". This is the reference output that
// real prompts should replicate.
//
// Pipeline: Plan → Execute (get_server_context → process_list action → generate_schema) → Complete

import type { FakeLLMScenario } from '../../../src/llm/providers/fake-llm.js';
import type { PlannerHints } from '../../../src/agent/planner.js';
import type { ChatWithToolsResult } from '../../../src/llm/provider.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

// ── Gold Standard: PlannerHints ──

export const SYSTEM_OVERVIEW_PLANNER_HINTS: PlannerHints = {
  intent: 'Show comprehensive system overview with resource usage, server info and health status',
  interactivityLevel: 'display-only',
  expectedWidgets: ['alert', 'key-value', 'progress-bar', 'stat-card'],
  templateHint: null,
  dataSourceHints: [
    'uname -a (system info)',
    'free -h (memory usage)',
    'df -h (disk usage)',
    'top -bn1 (CPU and load)',
    'uptime (server uptime)',
  ],
  suggestedLayout: 'stack',
  suggestedSections: ['System Overview'],
  securityRequirements: {
    needsWrite: false,
    needsSFTP: false,
    sensitiveData: false,
  },
  estimatedComplexity: 'medium',
  skipPostReflection: true,
};

// ── Gold Standard: DynamicView (the final UI) ──

export const SYSTEM_OVERVIEW_GOLD_VIEW: DynamicView = {
  title: 'System Overview',
  description: 'Server health metrics and system information at a glance',
  icon: 'Activity',
  sidebarItems: [{ id: 'main', label: 'System Overview' }],
  sections: {
    main: {
      layout: 'stack',
      gap: 'md',
      children: [
        // 1. Health status alert
        {
          type: 'alert',
          title: 'System Status',
          message: 'All systems operational — load average 0.45 (4 cores)',
          variant: 'success',
        },
        // 2. Server info key-value
        {
          type: 'key-value',
          title: 'Server Information',
          pairs: [
            { key: 'Hostname', value: 'web-prod-01', icon: 'Server', copyable: true },
            { key: 'OS', value: 'Ubuntu 22.04.3 LTS', icon: 'Monitor', copyable: false },
            { key: 'Kernel', value: '5.15.0-91-generic', icon: 'Cpu', copyable: false },
            { key: 'Architecture', value: 'x86_64', icon: 'Chip', copyable: false },
            { key: 'Uptime', value: '42 days, 3 hours', icon: 'Clock', copyable: false },
            { key: 'Docker', value: '24.0.7', icon: 'Box', copyable: false },
          ],
          layout: 'grid-3',
        },
        // 3. Resource stat cards in a grid
        {
          layout: 'grid',
          columns: 3,
          children: [
            {
              type: 'stat-card',
              title: 'CPU Load',
              value: '0.45',
              description: 'Load avg (1 min) — 4 cores',
              trend: 'neutral',
              icon: 'Cpu',
            },
            {
              type: 'stat-card',
              title: 'Memory Used',
              value: '6.2',
              unit: 'GiB',
              description: '79% of 7.8 GiB',
              trend: 'up',
              icon: 'MemoryStick',
            },
            {
              type: 'stat-card',
              title: 'Disk Used',
              value: '320',
              unit: 'GB',
              description: '64% of 500 GB (/)',
              trend: 'neutral',
              icon: 'HardDrive',
            },
          ],
        },
        // 4. Resource usage progress bars
        {
          type: 'progress-bar',
          title: 'CPU Usage',
          value: 45,
          label: '45.2% — 4 cores @ 2.30 GHz',
          variant: 'default',
        },
        {
          type: 'progress-bar',
          title: 'Memory Usage',
          value: 79,
          label: '6.2 GiB / 7.8 GiB',
          variant: 'warning',
        },
        {
          type: 'progress-bar',
          title: 'Disk Usage (/)',
          value: 64,
          label: '320 GB / 500 GB',
          variant: 'default',
        },
        {
          type: 'progress-bar',
          title: 'Swap Usage',
          value: 25,
          label: '512 MiB / 2.0 GiB',
          variant: 'default',
        },
      ],
    },
  },
  meta: {
    command: 'uname -a && free -h && df -h && top -bn1',
    generatedAt: '2026-04-08T10:32:45.000Z',
  },
} as DynamicView;

// ── Executor Chat Responses ──

/**
 * Turn 1: Agent calls get_server_context to understand the server.
 */
const EXECUTOR_TURN_1_GET_CONTEXT: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_ctx_1',
        type: 'function',
        function: {
          name: 'get_server_context',
          arguments: JSON.stringify({}),
        },
      },
    ],
  },
  tokensUsed: { input: 1200, output: 50 },
  latencyMs: 300,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

/**
 * Turn 2: Agent calls the process_list action to see what uses the CPU.
 */
const EXECUTOR_TURN_2_TOP: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_top_1',
        type: 'function',
        function: {
          name: 'process_list',
          arguments: JSON.stringify({ sortBy: 'cpu' }),
        },
      },
    ],
  },
  tokensUsed: { input: 2000, output: 50 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

/**
 * Turn 3: Agent calls generate_schema with the gold-standard view.
 * This is the terminal tool call that ends the executor loop.
 */
const EXECUTOR_TURN_3_GENERATE: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_gen_1',
        type: 'function',
        function: {
          name: 'generate_schema',
          arguments: JSON.stringify({ schema: JSON.stringify(SYSTEM_OVERVIEW_GOLD_VIEW) }),
        },
      },
    ],
  },
  tokensUsed: { input: 3500, output: 800 },
  latencyMs: 1500,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// ── Complete Scenario ──

/**
 * The full "system overview" scenario.
 *
 * parseTextResponses[0] → Planner (reason call)
 * chatResponses[0..2] → Executor (3 turns: context → top → generate)
 *
 * skipPostReflection=true, so the Reflector is never called.
 */
export const SYSTEM_OVERVIEW_SCENARIO: FakeLLMScenario = {
  name: 'system-overview',
  parseTextResponses: [
    // Planner response
    {
      data: SYSTEM_OVERVIEW_PLANNER_HINTS,
      model: 'fake-planner',
      tokensUsed: { input: 200, output: 300 },
      latencyMs: 400,
    },
  ],
  chatResponses: [
    EXECUTOR_TURN_1_GET_CONTEXT,
    EXECUTOR_TURN_2_TOP,
    EXECUTOR_TURN_3_GENERATE,
  ],
};

// ── Scenario WITH Reflection ──

/**
 * Same scenario, but with skipPostReflection=false so the Reflector runs.
 * The reflector approves with a minor suggestion.
 *
 * parseTextResponses[0] → Planner
 * parseTextResponses[1] → Reflector
 * chatResponses[0..2] → Executor
 */
export const SYSTEM_OVERVIEW_WITH_REFLECTION_SCENARIO: FakeLLMScenario = {
  name: 'system-overview-with-reflection',
  parseTextResponses: [
    // Planner response (same hints but skipPostReflection=false)
    {
      data: {
        ...SYSTEM_OVERVIEW_PLANNER_HINTS,
        skipPostReflection: false,
        estimatedComplexity: 'complex' as const,
      },
      model: 'fake-planner',
      tokensUsed: { input: 200, output: 300 },
      latencyMs: 400,
    },
    // Reflector response — approve with minor suggestion
    {
      data: {
        approved: true,
        issues: [
          {
            severity: 'suggestion',
            widget: 'Server Information',
            description: 'Could add nginx version to server info',
            fix: 'Add nginx 1.24.0 to the key-value pairs',
          },
        ],
        summary: 'Good overview — widgets match data, layout is logical. Minor suggestion: include nginx version.',
      },
      model: 'fake-reflector',
      tokensUsed: { input: 500, output: 200 },
      latencyMs: 600,
    },
  ],
  chatResponses: [
    EXECUTOR_TURN_1_GET_CONTEXT,
    EXECUTOR_TURN_2_TOP,
    EXECUTOR_TURN_3_GENERATE,
  ],
};
