// Phoenix Observatory Design System — shared constants
// Extracted from Arize Phoenix for pixel-perfect clone
// EX8.6: status / role / output styles now map onto LumenOS tokens. The span-kind
// palette stays: it is a categorical data-viz identity (one hue per kind, pinned by tests).

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

/* ── Token Badge Colors — SpanKindToken tints the same kind palette (EX8.6) ── */
export const SPAN_KIND_TOKEN_COLORS: Record<string, string> = SPAN_KIND_COLORS;

/* ── Status Colors (theme tokens) ── */
export const STATUS_COLORS: Record<string, string> = {
  OK:      'var(--success)',
  ERROR:   'var(--destructive)',
  RUNNING: 'var(--lumen-accent)',
  UNSET:   'var(--lumen-label3)',
};

/* ── Status CSS class helper (used in trace list) ── */
export const STATUS_DOT_CLASS: Record<string, string> = {
  OK:      'bg-success',
  ERROR:   'bg-danger',
  RUNNING: 'bg-accent-solid animate-pulse',
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

/* ── Chat Message Role Styles (Lumen bubbles: user = accent-soft, others = glass mats) ── */
export const ROLE_STYLES: Record<string, { bg: string; border: string }> = {
  user:      { bg: 'bg-accent-soft',  border: 'border-accent-solid/30' },
  system:    { bg: 'bg-fill',         border: 'border-edge' },
  assistant: { bg: 'bg-mat-thin',     border: 'border-edge' },
  tool:      { bg: 'bg-warning/10',   border: 'border-warning/30' },
  function:  { bg: 'bg-warning/10',   border: 'border-warning/30' },
};

export const OUTPUT_CARD_STYLE = {
  bg: 'bg-success/10',
  border: 'border-success/30',
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
