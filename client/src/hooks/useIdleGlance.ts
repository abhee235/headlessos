// EX8.17: Idle glance — after `idleGlanceMinutes` without pointer, key, wheel or
// touch input on the desktop, open the Home hub as a privacy screen. Screen
// output (terminals, agents) is not activity, as with an OS screensaver.
// @see docs/phases/phase-ex8.md

import { useEffect } from 'react';
import { useAppStore } from '../store/app-store';
import { useDesktopStore } from '../store/window-store';
import { usePreferencesStore } from '../store/preferences-store';

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
/** How often the idle time is checked */
export const IDLE_CHECK_MS = 5000;

export function useIdleGlance(): void {
  const minutes = usePreferencesStore((s) => s.idleGlanceMinutes);
  const screen = useAppStore((s) => s.screen);

  useEffect(() => {
    if (!minutes || screen !== 'desktop') return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    for (const e of ACTIVITY) window.addEventListener(e, bump, { capture: true, passive: true });
    const id = setInterval(() => {
      if (Date.now() - last >= minutes * 60_000) useDesktopStore.getState().openHomeHubIdle();
    }, IDLE_CHECK_MS);
    return () => {
      clearInterval(id);
      for (const e of ACTIVITY) window.removeEventListener(e, bump, { capture: true });
    };
  }, [minutes, screen]);
}
