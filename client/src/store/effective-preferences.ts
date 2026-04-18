// EX6-A.8: Layered Preferences — `effective = global ⊕ override`
// @see docs/phases/phase-ex6.md
// @see docs/DECISIONS.md (ADR-022)
//
// `usePreferencesStore` holds the user's GLOBAL defaults.
// `useSessionsStore.sessions[serverId].preferenceOverrides` may override
// a small allowlist of keys per server.
//
// This module exposes:
//   - `useEffectivePref(key)`     read with override fallback
//   - `setPreferenceOverride(key, value)` write to active session (allowlist-checked)
//   - `clearPreferenceOverride(key)`      remove an override
//   - `getEffectivePref(key)`     non-hook, plain getter (snapshot)

import { usePreferencesStore } from './preferences-store';
import { useSessionsStore } from './sessions-store';
import {
  OVERRIDABLE_PREFERENCE_KEYS,
  type OverridablePreferenceKey,
  type SessionPreferenceOverrides,
} from 'headlessos-shared/schemas/session';

// Allowlist as a Set for O(1) lookups
const ALLOWLIST = new Set<string>(OVERRIDABLE_PREFERENCE_KEYS);

/** Returns true if a preference key may be overridden per-session. */
export function isOverridableKey(key: string): key is OverridablePreferenceKey {
  return ALLOWLIST.has(key);
}

/**
 * React hook: get the EFFECTIVE value for a preference, applying any
 * per-session override on top of the global default.
 *
 * For non-overridable keys, simply returns the global value.
 *
 * Subscribes to BOTH stores so the component re-renders when either
 * the global value or the active session's override changes.
 */
export function useEffectivePref<K extends keyof ReturnType<typeof usePreferencesStore.getState>>(
  key: K,
): ReturnType<typeof usePreferencesStore.getState>[K] {
  const globalValue = usePreferencesStore((s) => s[key]);
  const override = useSessionsStore((s) => {
    if (!s.activeServerId) return undefined;
    if (!isOverridableKey(key as string)) return undefined;
    const session = s.sessions[s.activeServerId];
    if (!session) return undefined;
    return session.preferenceOverrides[key as OverridablePreferenceKey];
  });

  if (override !== undefined && isOverridableKey(key as string)) {
    return override as ReturnType<typeof usePreferencesStore.getState>[K];
  }
  return globalValue;
}

/**
 * Non-hook snapshot getter. Use in event handlers / non-React code.
 */
export function getEffectivePref<K extends keyof ReturnType<typeof usePreferencesStore.getState>>(
  key: K,
): ReturnType<typeof usePreferencesStore.getState>[K] {
  const globalValue = usePreferencesStore.getState()[key];
  const sessions = useSessionsStore.getState();
  if (!sessions.activeServerId || !isOverridableKey(key as string)) {
    return globalValue;
  }
  const session = sessions.sessions[sessions.activeServerId];
  if (!session) return globalValue;
  const override = session.preferenceOverrides[key as OverridablePreferenceKey];
  if (override !== undefined) {
    return override as ReturnType<typeof usePreferencesStore.getState>[K];
  }
  return globalValue;
}

/**
 * Set a per-session override for the active server. Throws if no server
 * is active or if the key is not in the override allowlist (theme mode,
 * LLM keys, etc. cannot be overridden per-session).
 */
export function setPreferenceOverride<K extends OverridablePreferenceKey>(
  key: K,
  value: NonNullable<SessionPreferenceOverrides[K]>,
): void {
  if (!isOverridableKey(key)) {
    throw new Error(
      `[preferences] Key "${key}" is not in the per-session override allowlist`,
    );
  }
  const { activeServerId, sessions, updateSession } = useSessionsStore.getState();
  if (!activeServerId) {
    throw new Error('[preferences] Cannot set override: no active server');
  }
  const session = sessions[activeServerId];
  if (!session) {
    throw new Error(`[preferences] Cannot set override: no session for ${activeServerId}`);
  }
  updateSession(activeServerId, {
    preferenceOverrides: {
      ...session.preferenceOverrides,
      [key]: value,
    },
  });
}

/**
 * Remove a per-session override for the active server, falling back to
 * the global default. No-op if no server is active or no override exists.
 */
export function clearPreferenceOverride(key: OverridablePreferenceKey): void {
  if (!isOverridableKey(key)) return;
  const { activeServerId, sessions, updateSession } = useSessionsStore.getState();
  if (!activeServerId) return;
  const session = sessions[activeServerId];
  if (!session) return;
  if (session.preferenceOverrides[key] === undefined) return;
  const next: SessionPreferenceOverrides = { ...session.preferenceOverrides };
  delete next[key];
  updateSession(activeServerId, { preferenceOverrides: next });
}

/**
 * Returns true if the active session has an override for the given key.
 * Useful to render a "reset to global" button only when an override exists.
 */
export function hasPreferenceOverride(key: OverridablePreferenceKey): boolean {
  const { activeServerId, sessions } = useSessionsStore.getState();
  if (!activeServerId) return false;
  const session = sessions[activeServerId];
  if (!session) return false;
  return session.preferenceOverrides[key] !== undefined;
}
