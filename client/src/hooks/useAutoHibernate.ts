// EX6-D.5: Auto-hibernation watchdog
// @see docs/phases/phase-ex6.md
//
// When `autoHibernateMinutes > 0`, every background session whose
// `lastActiveAt` is older than the threshold is hibernated automatically.
// The active session is never auto-hibernated. Default off (0).

import { useEffect } from 'react';
import { usePreferencesStore } from '../store/preferences-store';
import { useSessionsStore } from '../store/sessions-store';

const CHECK_INTERVAL_MS = 30_000;

export function useAutoHibernate(): void {
  const minutes = usePreferencesStore((s) => s.autoHibernateMinutes);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const thresholdMs = minutes * 60_000;

    const tick = () => {
      const { sessions, activeServerId, hibernate } = useSessionsStore.getState();
      const now = Date.now();
      for (const [id, session] of Object.entries(sessions)) {
        if (id === activeServerId) continue;
        if (session.lifecycle === 'hibernated') continue;
        const last = Date.parse(session.lastActiveAt);
        if (Number.isNaN(last)) continue;
        if (now - last >= thresholdMs) {
          // Fire-and-forget; hibernate is async and idempotent.
          void hibernate(id);
        }
      }
    };

    // Run once shortly after enabling, then on the interval.
    const handle = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [minutes]);
}
