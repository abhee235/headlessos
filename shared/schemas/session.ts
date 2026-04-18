// EX6-A.3: SessionStateSchema — Per-server desktop session state
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-020, ADR-021, ADR-022)
//
// A SessionState represents one server's persistent desktop: window layout,
// preference overrides, agent history, and lifecycle status. Cold-tier
// persistence: ~/.headlessos/sessions/{serverId}.json.

import { z } from 'zod';

// ── Lifecycle ──────────────────────────────────────────

export const SessionLifecycleSchema = z.enum([
  'active',      // Foreground, SSH connected, full polling
  'background',  // Hidden but SSH connected, throttled polling
  'hibernated',  // SSH disconnected, state on disk only
]);
export type SessionLifecycle = z.infer<typeof SessionLifecycleSchema>;

// ── Persisted Window ───────────────────────────────────
//
// Subset of WindowState that survives hibernation. Excludes ephemeral
// fields like `focused` and `preSnap`. Snap state is captured via
// minimized/maximized and the explicit x/y/w/h.

export const PersistedWindowSchema = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
  icon: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  minimized: z.boolean(),
  maximized: z.boolean(),
  zIndex: z.number().int().nonnegative(),
  meta: z.record(z.string(), z.string()).optional(),
});
export type PersistedWindow = z.infer<typeof PersistedWindowSchema>;

// ── Per-Session Preference Overrides (ADR-022) ─────────
//
// Layered model: effective = globalDefaults ⊕ overrides.
// Always-global preferences (theme mode, LLM keys, account) live in
// usePreferencesStore and are NOT in this schema.
// All fields optional — absence means "inherit global default".

export const SessionPreferenceOverridesSchema = z
  .object({
    accentColorIndex: z.number().int().min(0).max(50).optional(),
    wallpaperId: z.string().optional(),
    terminalFontFamily: z.string().optional(),
    terminalFontSize: z.number().int().min(8).max(32).optional(),
    autoRefreshInterval: z.number().int().min(0).max(600).optional(),
    defaultLaunchAppId: z.string().optional(),
    pinnedAppIds: z.array(z.string()).optional(),
  })
  .strict();
export type SessionPreferenceOverrides = z.infer<typeof SessionPreferenceOverridesSchema>;

/**
 * Allowlist of preference keys that may be overridden per-session.
 * Anything NOT in this list (theme mode, LLM keys, account, etc.) stays
 * global. Keep in sync with SessionPreferenceOverridesSchema.
 * @see docs/DECISIONS.md ADR-022
 */
export const OVERRIDABLE_PREFERENCE_KEYS = [
  'accentColorIndex',
  'wallpaperId',
  'terminalFontFamily',
  'terminalFontSize',
  'autoRefreshInterval',
  'defaultLaunchAppId',
  'pinnedAppIds',
] as const;
export type OverridablePreferenceKey = typeof OVERRIDABLE_PREFERENCE_KEYS[number];

// ── Persisted Agent Conversation Entry ─────────────────
//
// One entry per completed UI Agent generation. Live event streams are
// NOT persisted — only the summary so users can browse history and
// re-open the resulting view. Cap: last 50 per server (enforced on write).

export const PersistedAgentMessageSchema = z.object({
  requestId: z.string(),
  prompt: z.string(),
  status: z.enum(['complete', 'error', 'aborted']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  viewTitle: z.string().optional(),
  errorMessage: z.string().optional(),
  meta: z
    .object({
      latencyMs: z.number().nonnegative().optional(),
      stepsCompleted: z.number().int().nonnegative().optional(),
      reflectionLoops: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type PersistedAgentMessage = z.infer<typeof PersistedAgentMessageSchema>;

export const AGENT_HISTORY_CAP = 50;

// ── Session-Scoped Clipboard (EX6-A.9) ─────────────────
//
// Per-session clipboard for cut/copy/paste of files. Isolated between
// sessions so a copy on srv-A is invisible to srv-B (Citrix-style).
// Entries always belong to the same server as the session containing
// them (cross-server paste not supported in v1).

export const ClipboardEntrySchema = z.object({
  serverId: z.string(),
  path: z.string(),
  name: z.string(),
  isDirectory: z.boolean(),
});
export type ClipboardEntry = z.infer<typeof ClipboardEntrySchema>;

export const SessionClipboardSchema = z.object({
  entries: z.array(ClipboardEntrySchema),
  operation: z.enum(['copy', 'cut']).nullable(),
  sourceDir: z.string().nullable(),
});
export type SessionClipboard = z.infer<typeof SessionClipboardSchema>;

export const EMPTY_CLIPBOARD: SessionClipboard = {
  entries: [],
  operation: null,
  sourceDir: null,
};

// ── Top-Level Session State ────────────────────────────

export const SessionStateSchema = z.object({
  schemaVersion: z.literal(1),
  serverId: z.string().min(1),
  lifecycle: SessionLifecycleSchema,
  lastActiveAt: z.string().datetime(),
  hibernatedAt: z.string().datetime().optional(),

  // Window layout
  windows: z.array(PersistedWindowSchema),
  nextZIndex: z.number().int().nonnegative(),
  focusedWindowId: z.string().optional(),

  // Preferences (ADR-022)
  preferenceOverrides: SessionPreferenceOverridesSchema,

  // Agent conversation history (capped at AGENT_HISTORY_CAP)
  agentHistory: z.array(PersistedAgentMessageSchema).max(AGENT_HISTORY_CAP),

  // Pinned dynamic-ui view IDs (refs only — content re-fetched from backend)
  pinnedDynamicViewIds: z.array(z.string()),

  // Session-scoped clipboard (EX6-A.9)
  clipboard: SessionClipboardSchema.default(EMPTY_CLIPBOARD),

  // Notification badge state
  unreadNotificationCount: z.number().int().nonnegative(),

  // EX6-D.1: Per-session lock — require explicit confirmation to wake from hibernation.
  // Useful for production / DB-tier servers to prevent accidental reconnection.
  // Optional + defaulted so v1 session files without this field still parse.
  lockOnHibernate: z.boolean().default(false),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

// ── Session Summary (returned by GET /api/sessions list endpoint) ──

export const SessionSummarySchema = z.object({
  serverId: z.string(),
  lifecycle: SessionLifecycleSchema,
  lastActiveAt: z.string().datetime(),
  hibernatedAt: z.string().datetime().optional(),
  windowCount: z.number().int().nonnegative(),
  hasOverrides: z.boolean(),
  // EX6-D.1: surface so UI can prompt before waking without loading cold tier
  lockOnHibernate: z.boolean().default(false),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

// ── Helpers ────────────────────────────────────────────

/**
 * Create a fresh, empty session state for a newly-connected server.
 * Use when no cold-tier file exists for the given serverId.
 */
export function createEmptySessionState(serverId: string): SessionState {
  return {
    schemaVersion: 1,
    serverId,
    lifecycle: 'active',
    lastActiveAt: new Date().toISOString(),
    windows: [],
    nextZIndex: 1,
    preferenceOverrides: {},
    agentHistory: [],
    pinnedDynamicViewIds: [],
    clipboard: { ...EMPTY_CLIPBOARD },
    unreadNotificationCount: 0,
    lockOnHibernate: false,
  };
}

/**
 * Trim an agent-history array to the cap, keeping the most recent entries.
 * Use before persisting to disk.
 */
export function trimAgentHistory(
  history: PersistedAgentMessage[],
): PersistedAgentMessage[] {
  if (history.length <= AGENT_HISTORY_CAP) return history;
  return history.slice(history.length - AGENT_HISTORY_CAP);
}
