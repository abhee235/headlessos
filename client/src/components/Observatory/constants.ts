// Phoenix Observatory Design System — shared constants
// Extracted from Arize Phoenix for pixel-perfect clone

/* ── Span Kind Colors (dark theme — Phoenix -1000 level) ── */
export const SPAN_KIND_COLORS: Record<string, string> = {
  LLM:       'rgb(255, 162, 59)',   // orange-1000
  AGENT:     'rgb(176, 176, 176)',  // gray-600
  CHAIN:     'rgb(124, 189, 250)',  // blue-1000
  TOOL:      'rgb(247, 216, 4)',    // yellow-1200
  RETRIEVER: 'rgb(66, 202, 195)',   // seafoam-1000
  EMBEDDING: 'rgb(174, 177, 255)',  // indigo-1000
  RERANKER:  'rgb(158, 218, 47)',   // celery-1000
  EVALUATOR: 'rgb(174, 177, 255)',  // indigo-1000
  GUARDRAIL: 'rgb(235, 110, 216)',  // fuchsia-1200
  PROMPT:    'rgb(255, 181, 97)',   // orange-1100
};

/* ── Token Badge Colors (Phoenix -500 level — used for SpanKindToken pill) ── */
export const SPAN_KIND_TOKEN_COLORS: Record<string, string> = {
  LLM:       '#e68019',   // orange-500
  AGENT:     '#929292',   // gray-500
  CHAIN:     '#378ef0',   // blue-500
  TOOL:      '#dfbe00',   // yellow-500
  RETRIEVER: '#1b959a',   // seafoam-500
  EMBEDDING: '#7575f1',   // indigo-500
  RERANKER:  '#7cc33f',   // celery-500
  EVALUATOR: '#7575f1',   // indigo-500
  GUARDRAIL: '#c038cc',   // fuchsia-500
  PROMPT:    '#e68019',   // orange-400
};

/* ── Status Colors ── */
export const STATUS_COLORS: Record<string, string> = {
  OK:      'rgb(34, 184, 96)',   // green / success
  ERROR:   'rgb(228, 62, 62)',   // red / danger
  RUNNING: 'rgb(59, 130, 246)',  // blue
  UNSET:   'rgb(142, 142, 142)', // gray-500
};

/* ── Status CSS class helper (used in trace list) ── */
export const STATUS_DOT_CLASS: Record<string, string> = {
  OK:      'bg-green-500',
  ERROR:   'bg-red-500',
  RUNNING: 'bg-blue-500 animate-pulse',
};

/* ── Tree Layout (Phoenix values) ── */
export const NESTING_INDENT = 25; // px per nesting level
export const CONNECTOR_OFFSET = 29; // px from left edge to connector line
export const CONNECTOR_BORDER_RADIUS = 11; // px — bottom-left round
export const L_CONNECTOR_HEIGHT = 22; // px
export const L_CONNECTOR_WIDTH = 11; // px

/* ── Timeline Bar ── */
export const TIMELINE_BAR_HEIGHT = 6; // px
export const TIMELINE_BAR_RADIUS = 3; // px

/* ── Chat Message Role Colors (dark theme Tailwind classes) ── */
export const ROLE_STYLES: Record<string, { bg: string; border: string }> = {
  user:      { bg: 'bg-zinc-800/50',      border: 'border-zinc-600' },
  system:    { bg: 'bg-indigo-950/30',     border: 'border-indigo-800/40' },
  assistant: { bg: 'bg-blue-950/30',       border: 'border-blue-800/40' },
  tool:      { bg: 'bg-yellow-950/30',     border: 'border-yellow-800/40' },
  function:  { bg: 'bg-yellow-950/30',     border: 'border-yellow-800/40' },
};

export const OUTPUT_CARD_STYLE = {
  bg: 'bg-emerald-950/20',
  border: 'border-emerald-800/30',
};

/* ── Helpers ── */
export function getSpanKindColor(kind: string): string {
  return SPAN_KIND_COLORS[kind] ?? SPAN_KIND_COLORS.AGENT;
}

export function getSpanKindTokenColor(kind: string): string {
  return SPAN_KIND_TOKEN_COLORS[kind] ?? SPAN_KIND_TOKEN_COLORS.AGENT;
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? STATUS_COLORS.UNSET;
}

export function getRoleStyle(role: string): { bg: string; border: string } {
  const normalized = role.toLowerCase();
  return ROLE_STYLES[normalized] ?? ROLE_STYLES.user;
}

export function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatCost(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
