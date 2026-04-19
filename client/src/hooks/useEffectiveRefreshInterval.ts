// EX6-B.6: Effective refresh interval — throttles polling for background sessions
// @see docs/phases/phase-ex6.md
//
// When the user is on session A, sessions B/C/D should still refresh
// (so their thumbnails/badges update) but at a much slower cadence.
//
// Use this hook in any polling consumer (Dashboard auto-refresh, Fleet,
// Task Manager) instead of reading the raw `autoRefreshInterval` preference.

import { useSessionsStore } from '../store/sessions-store';
import { useEffectivePref, getEffectivePref } from '../store/effective-preferences';

const BACKGROUND_MULTIPLIER = 4;

/**
 * Returns the effective polling interval (in seconds) for the given server.
 *  - 0 if the user has disabled auto-refresh
 *  - the raw value if `serverId === activeServerId`
 *  - 4× the raw value otherwise (background throttle)
 */
export function useEffectiveRefreshInterval(serverId: string | null | undefined): number {
  const baseInterval = useEffectivePref('autoRefreshInterval');
  const activeServerId = useSessionsStore((s) => s.activeServerId);

  if (!baseInterval || baseInterval <= 0) return 0;
  if (!serverId) return baseInterval;
  if (serverId === activeServerId) return baseInterval;
  return baseInterval * BACKGROUND_MULTIPLIER;
}

/** Non-hook snapshot (use in non-React code). */
export function getEffectiveRefreshInterval(serverId: string | null | undefined): number {
  const base = getEffectivePref('autoRefreshInterval');
  const active = useSessionsStore.getState().activeServerId;
  if (!base || base <= 0) return 0;
  if (!serverId) return base;
  if (serverId === active) return base;
  return base * BACKGROUND_MULTIPLIER;
}
