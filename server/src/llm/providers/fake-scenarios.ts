// FakeLLM Scenario: System Overview
//
// Pre-scripted responses for the "show me system overview" agent pipeline.
// Used both in tests and when running the server with LLM_PROVIDER=fake.

import type { FakeLLMScenario } from './fake-llm.js';
import type { PlannerHints } from '../../agent/planner.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ChatWithToolsResult } from '../provider.js';

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

// ── Gold Standard DynamicView ──

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
        {
          type: 'alert',
          title: 'System Status',
          message: 'All systems operational — load average 0.45 (4 cores)',
          variant: 'success',
        },
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

// ── Executor chat responses ──

const TURN_1_GET_CONTEXT: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_ctx_1',
      type: 'function',
      function: { name: 'get_server_context', arguments: '{}' },
    }],
  },
  tokensUsed: { input: 1200, output: 50 },
  latencyMs: 300,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

const TURN_2_TOP: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_top_1',
      type: 'function',
      function: { name: 'process_list', arguments: JSON.stringify({ sortBy: 'cpu' }) },
    }],
  },
  tokensUsed: { input: 2000, output: 50 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

const TURN_3_GENERATE: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_gen_1',
      type: 'function',
      function: {
        name: 'generate_schema',
        arguments: JSON.stringify({ schema: JSON.stringify(SYSTEM_OVERVIEW_GOLD_VIEW) }),
      },
    }],
  },
  tokensUsed: { input: 3500, output: 800 },
  latencyMs: 1500,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// ── Complete scenario ──

export const SYSTEM_OVERVIEW_SCENARIO: FakeLLMScenario = {
  name: 'system-overview',
  parseTextResponses: [
    {
      data: SYSTEM_OVERVIEW_PLANNER_HINTS,
      model: 'fake-planner',
      tokensUsed: { input: 200, output: 300 },
      latencyMs: 400,
    },
  ],
  chatResponses: [
    TURN_1_GET_CONTEXT,
    TURN_2_TOP,
    TURN_3_GENERATE,
  ],
};
