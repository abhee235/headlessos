// Progressive FakeLLM Scenario: System Overview with Sections
// @see docs/PROGRESSIVE_RENDERING.md
//
// Pre-scripted responses that demonstrate progressive incremental rendering.
// Uses update_view to send partial views with top-level sidebarItems + sections,
// then generate_schema for final. Each section is a Layout (stack/grid/tabs).
//
// Flow: get_context → update_view(skeleton) → exec(system) → update_view(+system)
//       → exec(docker) → update_view(+docker) → exec(network) → update_view(+network)
//       → generate_schema(final)

import type { FakeLLMScenario } from './fake-llm.js';
import type { PlannerHints } from '../../agent/planner.js';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import type { ChatWithToolsResult } from '../provider.js';

// ── Planner Hints ──

export const PROGRESSIVE_PLANNER_HINTS: PlannerHints = {
  intent: 'Show comprehensive system overview with resource usage, docker containers, and network ports',
  interactivityLevel: 'display-only',
  expectedWidgets: ['alert', 'key-value', 'stat-card', 'progress-bar', 'table'],
  templateHint: null,
  dataSourceHints: [
    'uname -a (system info)',
    'free -h (memory usage)',
    'df -h (disk usage)',
    'top -bn1 (CPU and load)',
    'docker ps -a (containers)',
    'docker stats --no-stream (container resources)',
    'ss -tlnp (listening ports)',
    'ip addr (network interfaces)',
  ],
  suggestedLayout: 'stack',
  suggestedSections: ['System', 'Docker', 'Network'],
  securityRequirements: {
    needsWrite: false,
    needsSFTP: false,
    sensitiveData: false,
  },
  estimatedComplexity: 'complex',
  skipPostReflection: true,
};

// ── Skeleton (empty sections) ──

const VIEW_SKELETON = {
  title: 'System Overview',
  description: 'Server health, containers, and network at a glance',
  icon: 'Activity',
  sidebarItems: [
    { id: 'system', label: 'System', icon: 'Cpu' },
    { id: 'docker', label: 'Docker', icon: 'Box' },
    { id: 'network', label: 'Network', icon: 'Network' },
  ],
  sections: {},
};

// ── System section filled ──

const VIEW_WITH_SYSTEM = {
  title: 'System Overview',
  description: 'Server health, containers, and network at a glance',
  icon: 'Activity',
  sidebarItems: [
    { id: 'system', label: 'System', icon: 'Cpu' },
    { id: 'docker', label: 'Docker', icon: 'Box' },
    { id: 'network', label: 'Network', icon: 'Network' },
  ],
  sections: {
    system: {
      layout: 'stack' as const,
      gap: 'md' as const,
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
            { key: 'Uptime', value: '42 days, 3 hours', icon: 'Clock', copyable: false },
          ],
          layout: 'grid-2',
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
              title: 'Memory',
              value: '6.2',
              unit: 'GiB',
              description: '79% of 7.8 GiB',
              trend: 'up',
              icon: 'MemoryStick',
            },
            {
              type: 'stat-card',
              title: 'Disk',
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
      ],
    },
  },
};

// ── System + Docker sections filled ──

const VIEW_WITH_DOCKER = {
  ...VIEW_WITH_SYSTEM,
  sections: {
    ...VIEW_WITH_SYSTEM.sections,
    docker: {
      layout: 'stack' as const,
      gap: 'md' as const,
      children: [
        {
          layout: 'grid',
          columns: 3,
          children: [
            {
              type: 'stat-card',
              title: 'Running',
              value: '3',
              description: '3 of 4 containers',
              trend: 'neutral',
              icon: 'Play',
            },
            {
              type: 'stat-card',
              title: 'Stopped',
              value: '1',
              description: '1 exited container',
              trend: 'neutral',
              icon: 'Square',
            },
            {
              type: 'stat-card',
              title: 'Total CPU',
              value: '10.8',
              unit: '%',
              description: 'across all containers',
              trend: 'neutral',
              icon: 'Cpu',
            },
          ],
        },
        {
          type: 'table',
          title: 'Containers',
          columns: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'image', label: 'Image', type: 'mono' },
            { key: 'status', label: 'Status', type: 'badge', badgeVariant: { 'Up': 'success', 'Exited': 'destructive' } },
            { key: 'cpu', label: 'CPU', type: 'text' },
            { key: 'memory', label: 'Memory', type: 'text' },
            { key: 'ports', label: 'Ports', type: 'mono' },
          ],
          rows: [
            { name: 'nginx-proxy', image: 'nginx:latest', status: 'Up', cpu: '2.3%', memory: '45 MiB', ports: '80→80' },
            { name: 'postgres-db', image: 'postgres:15', status: 'Up', cpu: '8.1%', memory: '512 MiB', ports: '5432→5432' },
            { name: 'redis-cache', image: 'redis:7', status: 'Up', cpu: '0.4%', memory: '28 MiB', ports: '6379→6379' },
            { name: 'old-api', image: 'myapp:v1.9', status: 'Exited', cpu: '-', memory: '-', ports: '-' },
          ],
          emptyState: { icon: 'Box', title: 'No containers', message: 'No Docker containers found' },
        },
      ],
    },
  },
};

// ── All 3 sections filled (final gold view) ──

export const PROGRESSIVE_GOLD_VIEW: DynamicView = {
  ...VIEW_WITH_DOCKER,
  sections: {
    ...VIEW_WITH_DOCKER.sections,
    network: {
      layout: 'stack' as const,
      gap: 'md' as const,
      children: [
        {
          type: 'table',
          title: 'Listening Ports',
          columns: [
            { key: 'port', label: 'Port', type: 'mono' },
            { key: 'protocol', label: 'Proto', type: 'text' },
            { key: 'service', label: 'Service', type: 'text' },
            { key: 'pid', label: 'PID', type: 'mono' },
            { key: 'address', label: 'Address', type: 'mono' },
          ],
          rows: [
            { port: '80', protocol: 'tcp', service: 'nginx', pid: '1234', address: '0.0.0.0' },
            { port: '22', protocol: 'tcp', service: 'sshd', pid: '567', address: '0.0.0.0' },
            { port: '5432', protocol: 'tcp', service: 'postgres', pid: '890', address: '0.0.0.0' },
            { port: '6379', protocol: 'tcp', service: 'redis-server', pid: '1011', address: '0.0.0.0' },
          ],
          emptyState: { icon: 'Network', title: 'No open ports', message: 'No listening ports detected' },
        },
        {
          type: 'card-list',
          title: 'Network Interfaces',
          items: [
            {
              icon: 'Wifi',
              title: 'eth0',
              subtitle: 'Primary interface',
              badge: { label: 'UP', variant: 'success', dot: true },
              details: [
                { label: 'IP', value: '10.0.1.42/24' },
                { label: 'MTU', value: '1500' },
              ],
            },
            {
              icon: 'RotateCcw',
              title: 'lo',
              subtitle: 'Loopback',
              badge: { label: 'UP', variant: 'secondary', dot: false },
              details: [
                { label: 'IP', value: '127.0.0.1/8' },
                { label: 'MTU', value: '65536' },
              ],
            },
          ],
        },
      ],
    },
  },
  meta: {
    command: 'uname -a && free -h && df -h && docker ps -a && ss -tlnp',
    generatedAt: new Date().toISOString(),
  },
} as DynamicView;

// ── Chat Responses (9 turns) ──

// Turn 1: get_server_context
const TURN_1: ChatWithToolsResult = {
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

// Turn 2: update_view — skeleton with empty sections (window opens!)
const TURN_2: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_uv_1',
      type: 'function',
      function: {
        name: 'update_view',
        arguments: JSON.stringify({ view: JSON.stringify(VIEW_SKELETON) }),
      },
    }],
  },
  tokensUsed: { input: 1800, output: 200 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 3: system actions (gather data for System section)
const TURN_3: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_sys_1',
        type: 'function',
        function: { name: 'kernel_info', arguments: '{}' },
      },
      {
        id: 'call_sys_2',
        type: 'function',
        function: { name: 'memory_usage', arguments: '{}' },
      },
      {
        id: 'call_sys_3',
        type: 'function',
        function: { name: 'disk_usage', arguments: '{}' },
      },
      {
        id: 'call_sys_4',
        type: 'function',
        function: { name: 'process_list', arguments: JSON.stringify({ sortBy: 'cpu' }) },
      },
    ],
  },
  tokensUsed: { input: 2200, output: 100 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 4: update_view — system section filled
const TURN_4: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_uv_2',
      type: 'function',
      function: {
        name: 'update_view',
        arguments: JSON.stringify({ view: JSON.stringify(VIEW_WITH_SYSTEM) }),
      },
    }],
  },
  tokensUsed: { input: 3000, output: 500 },
  latencyMs: 400,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 5: docker actions
const TURN_5: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_docker_1',
        type: 'function',
        function: { name: 'docker_containers', arguments: '{}' },
      },
      {
        id: 'call_docker_2',
        type: 'function',
        function: { name: 'docker_stats', arguments: '{}' },
      },
    ],
  },
  tokensUsed: { input: 3500, output: 80 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 6: update_view — docker section filled
const TURN_6: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_uv_3',
      type: 'function',
      function: {
        name: 'update_view',
        arguments: JSON.stringify({ view: JSON.stringify(VIEW_WITH_DOCKER) }),
      },
    }],
  },
  tokensUsed: { input: 4000, output: 600 },
  latencyMs: 500,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 7: network actions
const TURN_7: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'call_net_1',
        type: 'function',
        function: { name: 'listening_ports', arguments: '{}' },
      },
      {
        id: 'call_net_2',
        type: 'function',
        function: { name: 'network_interfaces', arguments: '{}' },
      },
    ],
  },
  tokensUsed: { input: 4500, output: 80 },
  latencyMs: 200,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 8: update_view — all sections filled
const TURN_8: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_uv_4',
      type: 'function',
      function: {
        name: 'update_view',
        arguments: JSON.stringify({ view: JSON.stringify(PROGRESSIVE_GOLD_VIEW) }),
      },
    }],
  },
  tokensUsed: { input: 5000, output: 700 },
  latencyMs: 500,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// Turn 9: generate_schema (terminal — Zod validated)
const TURN_9: ChatWithToolsResult = {
  message: {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: 'call_gen_1',
      type: 'function',
      function: {
        name: 'generate_schema',
        arguments: JSON.stringify({ schema: JSON.stringify(PROGRESSIVE_GOLD_VIEW) }),
      },
    }],
  },
  tokensUsed: { input: 5500, output: 800 },
  latencyMs: 1000,
  model: 'fake-executor',
  finishReason: 'tool_calls',
};

// ── Complete Scenario ──

export const PROGRESSIVE_SYSTEM_OVERVIEW_SCENARIO: FakeLLMScenario = {
  name: 'progressive-system-overview',
  parseTextResponses: [
    {
      data: PROGRESSIVE_PLANNER_HINTS,
      model: 'fake-planner',
      tokensUsed: { input: 200, output: 400 },
      latencyMs: 400,
    },
  ],
  chatResponses: [
    TURN_1, // get_server_context
    TURN_2, // update_view (skeleton)
    TURN_3, // exec system commands
    TURN_4, // update_view (+system)
    TURN_5, // exec docker commands
    TURN_6, // update_view (+docker)
    TURN_7, // exec network commands
    TURN_8, // update_view (+network — all filled)
    TURN_9, // generate_schema (final)
  ],
};
