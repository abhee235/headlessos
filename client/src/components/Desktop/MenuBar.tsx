// EX8.11: Menu bar — the thin top strip from the updated LumenOS design. The
// tray moved here from the bottom-right pill: a glyph pill (connection,
// notifications, theme) opens Quick Settings, the date + time open the
// notification centre, and a dot between them marks unread notifications.
// Sizes are measured from the Claude Design screen at DPR 1.5 (see phase-ex8.md).

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../store/app-store';
import { useThemeStore } from '../../store/theme-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { useNotificationStore } from '../../store/notification-store';
import { QuickSettings } from './QuickSettings';

/** "Wed Oct 21" — the design has no comma, which toLocaleDateString adds */
export function menuBarDate(d: Date): string {
  const weekday = d.toLocaleDateString([], { weekday: 'short' });
  const month = d.toLocaleDateString([], { month: 'short' });
  return `${weekday} ${month} ${d.getDate()}`;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function MenuBar() {
  const [qsOpen, setQsOpen] = useState(false);
  const { notifications, panelOpen, togglePanel, closePanel } = useNotificationStore();
  const unread = notifications.filter((n) => !n.read).length;
  const showToasts = usePreferencesStore((s) => s.showToasts);
  const dateFormat = usePreferencesStore((s) => s.dateFormat);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const activeServer = useAppStore((s) => s.servers.find((srv) => srv.id === s.activeServerId));
  const isConnected = activeServer?.state?.status === 'connected';
  const now = useNow();
  const closeQs = useCallback(() => setQsOpen(false), []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: dateFormat === '12h' });

  return (
    <>
      <header
        className="lumen-menubar fixed inset-x-0 top-0 z-[9999] flex h-7 select-none items-center justify-between pl-3.5 pr-3 text-[13px] text-foreground"
        aria-label="Menu bar"
      >
        <span className="font-bold">HeadlessOS</span>

        <div className="flex items-center gap-1.5">
          {/* Status glyphs → Quick Settings */}
          <button
            type="button"
            data-quick-settings-anchor=""
            onClick={() => { closePanel(); setQsOpen((v) => !v); }}
            aria-label="Quick settings"
            aria-expanded={qsOpen}
            title={activeServer ? `${activeServer.name} — ${isConnected ? 'Connected' : 'Disconnected'}` : 'Quick settings'}
            className={cn(
              'flex h-[22px] items-center gap-3.5 rounded-full px-[11px] transition-colors duration-150 [&_svg]:size-3.5',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              qsOpen ? 'bg-fill-2' : 'hover:bg-fill',
            )}
          >
            {isConnected ? <Wifi strokeWidth={2} /> : <WifiOff strokeWidth={2} className="text-label-3" />}
            {showToasts ? <Bell strokeWidth={2} /> : <BellOff strokeWidth={2} className="text-label-2" />}
            {resolvedTheme === 'dark' ? <Moon strokeWidth={2} /> : <Sun strokeWidth={2} />}
          </button>

          {/* Unread dot + date + time → notification centre */}
          <button
            type="button"
            onClick={() => { setQsOpen(false); togglePanel(); }}
            aria-label={`Notifications and calendar — ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${unread ? ` — ${unread} unread` : ''}`}
            aria-expanded={panelOpen}
            title="Notifications and calendar"
            className={cn(
              // proportional digits, as in the design (the app body sets tabular-nums)
              'flex h-[22px] items-center rounded-full px-1.5 font-semibold [font-variant-numeric:normal] transition-colors duration-150',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              panelOpen ? 'bg-fill-2' : 'hover:bg-fill',
            )}
          >
            <span
              aria-hidden
              className={cn('mr-2 size-1.5 shrink-0 rounded-full bg-accent-solid', unread === 0 && 'invisible')}
            />
            <span>{menuBarDate(now)}</span>
            <span className="ml-3">{time}</span>
          </button>
        </div>
      </header>
      <QuickSettings open={qsOpen} onClose={closeQs} />
    </>
  );
}
