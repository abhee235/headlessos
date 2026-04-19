// EX6-C.1 + C.2 + C.4 + C.5: Control Center — pre-desktop landing
// @see docs/phases/phase-ex6.md
//
// Three sections:
//   1. Sessions — server cards with Resume/Wake/Connect (delegates to LoginScreen flow)
//   2. Fleet    — multi-server overview (relocated from in-desktop apps)
//   3. Settings — global-scope preferences
//
// Entry points:
//   - Initial app load (after lock unlock, no active session)
//   - Ctrl+Shift+Space from desktop (EX6-C.6)
//   - Session switcher overflow (deferred)

import { useState } from 'react';
import { Server, Globe, Settings as SettingsIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../store/app-store';
import { Wallpaper } from '../Desktop/Wallpaper';
import { LoginScreen } from '../Login/LoginScreen';
import { FleetDashboardView } from '../Fleet/FleetDashboardView';
import { GlobalSettingsSection } from './GlobalSettingsSection';
import { WakeConfirmDialog } from '../Desktop/WakeConfirmDialog';
import { TooltipProvider } from '@/components/ui/tooltip';

type Section = 'sessions' | 'fleet' | 'settings';

const SECTIONS: { id: Section; label: string; Icon: typeof Server }[] = [
  { id: 'sessions', label: 'Sessions', Icon: Server },
  { id: 'fleet',    label: 'Fleet',    Icon: Globe  },
  { id: 'settings', label: 'Global Settings', Icon: SettingsIcon },
];

export function ControlCenter() {
  const [section, setSection] = useState<Section>('sessions');
  const goToDesktop = useAppStore((s) => s.goToDesktop);
  const activeServerId = useAppStore((s) => s.activeServerId);

  return (
    <TooltipProvider delayDuration={400}>
    <div className="fixed inset-0 z-9999 select-none">
      {/* Wallpaper */}
      <Wallpaper />
      <div className="absolute inset-0 bg-black/30 backdrop-blur-md" />

      {/* Top tab bar (segmented control style, glassmorphism) */}
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-white/90">
          <span className="text-sm font-medium tracking-tight drop-shadow">HeadlessOS Control Center</span>
        </div>

        {/* Tabs (centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <nav
            role="tablist"
            aria-label="Control Center sections"
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/8 p-1 backdrop-blur-xl shadow-lg"
          >
            {SECTIONS.map(({ id, label, Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`cc-panel-${id}`}
                  onClick={() => setSection(id)}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                    active
                      ? 'bg-white/95 text-black shadow'
                      : 'text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                  data-testid={`cc-tab-${id}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Close (only when there's an active session to return to) */}
        {activeServerId && (
          <button
            onClick={goToDesktop}
            aria-label="Close Control Center"
            className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            data-testid="cc-close"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      {/* Panels */}
      <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden">
        {section === 'sessions' && (
          <div role="tabpanel" id="cc-panel-sessions" className="h-full">
            {/* Reuse the existing login flow (server picker + credentials + add-server) */}
            <LoginScreen embedded />
          </div>
        )}

        {section === 'fleet' && (
          <div
            role="tabpanel"
            id="cc-panel-fleet"
            className="h-full overflow-auto px-6 py-6"
          >
            <div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-background/85 p-6 shadow-2xl backdrop-blur-xl">
              <FleetDashboardView onServerActivated={goToDesktop} />
            </div>
          </div>
        )}

        {section === 'settings' && (
          <div
            role="tabpanel"
            id="cc-panel-settings"
            className="h-full overflow-auto px-6 py-6"
          >
            <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-background/85 p-6 shadow-2xl backdrop-blur-xl">
              <GlobalSettingsSection />
            </div>
          </div>
        )}
      </div>
      {/* EX6-D.1: Wake confirmation prompt for locked sessions */}
      <WakeConfirmDialog />
    </div>
    </TooltipProvider>
  );
}
