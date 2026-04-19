// M6.11 + M10.10 + EX6-C.1: App Shell — Routes between Lock/ControlCenter/Desktop with lazy loading
// @see docs/phases/phase-6.md, docs/phases/phase-ex6.md

import { lazy, Suspense } from 'react';
import { useAppStore } from './store/app-store';

// Lazy-loaded screens (M10.10 — keep initial bundle small)
const LockScreen = lazy(() => import('./components/Login/LockScreen').then(m => ({ default: m.LockScreen })));
const ControlCenter = lazy(() => import('./components/ControlCenter/ControlCenter').then(m => ({ default: m.ControlCenter })));
const DesktopLayout = lazy(() => import('./components/Desktop/DesktopLayout').then(m => ({ default: m.DesktopLayout })));

function AppFallback() {
  return (
    <div className="flex items-center justify-center w-screen h-screen bg-background">
      <div className="animate-pulse text-foreground/30 text-sm">Loading…</div>
    </div>
  );
}

export function App() {
  const screen = useAppStore(s => s.screen);

  return (
    <Suspense fallback={<AppFallback />}>
      {screen === 'lock' && <LockScreen />}
      {screen === 'login' && <ControlCenter />}
      {screen === 'desktop' && <DesktopLayout />}
    </Suspense>
  );
}
