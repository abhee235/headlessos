// EX6-B.1 + B.5: SessionSwitcher — hover-reveal Citrix-style top bar
// @see docs/phases/phase-ex6.md

import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore } from '../../store/app-store';
import { useSessionsStore } from '../../store/sessions-store';
import { ACCENT_PRESETS } from '../../store/preferences-store';
import { SessionTile } from './SessionTile';

const STORAGE_PIN_KEY = 'headlessos-session-switcher-pinned';
const HIDE_DELAY_MS = 350;

function loadPinned(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_PIN_KEY) === '1';
}

function savePinned(v: boolean) {
  try {
    localStorage.setItem(STORAGE_PIN_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

export function SessionSwitcher() {
  const servers = useAppStore((s) => s.servers);
  const setActiveServer = useAppStore((s) => s.setActiveServer);
  const screenIsDesktop = useAppStore((s) => s.screen === 'desktop');
  const goToLogin = useAppStore((s) => s.goToLogin);

  const activeServerId = useSessionsStore((s) => s.activeServerId);
  const summaries = useSessionsStore((s) => s.summaries);

  const [pinned, setPinned] = useState(loadPinned);
  const [hovering, setHovering] = useState(false);

  // Hide-after-leave delay so the bar doesn't flicker
  const [delayedHover, setDelayedHover] = useState(false);
  useEffect(() => {
    if (hovering) {
      setDelayedHover(true);
      return;
    }
    const t = setTimeout(() => setDelayedHover(false), HIDE_DELAY_MS);
    return () => clearTimeout(t);
  }, [hovering]);

  // Order tiles by lastActiveAt desc, with summaries-aware fallback
  const orderedServers = useMemo(() => {
    const idIndex = new Map(summaries.map((s, i) => [s.serverId, i]));
    return [...servers].sort((a, b) => {
      const ai = idIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = idIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [servers, summaries]);

  // Active session's accent for the persistent top strip (B.5)
  const activeAccent = useMemo(() => {
    if (!activeServerId) return null;
    const hash = Array.from(activeServerId).reduce((a, c) => a + c.charCodeAt(0), 0);
    return ACCENT_PRESETS[hash % ACCENT_PRESETS.length] ?? null;
  }, [activeServerId]);

  if (!screenIsDesktop) return null;
  if (orderedServers.length === 0) return null;

  const visible = pinned || delayedHover;

  return (
    <>
      {/* B.5: 3px accent strip — always visible, identifies active session */}
      {activeAccent && (
        <div
          className="fixed left-0 right-0 top-0 z-60 h-0.75 transition-colors"
          style={{ backgroundColor: activeAccent.oklchDark }}
          aria-hidden="true"
        />
      )}

      {/* B.1: 4px hover trigger zone */}
      <div
        className="fixed left-0 right-0 top-0 z-70 h-1"
        onMouseEnter={() => setHovering(true)}
        aria-hidden="true"
      />

      {/* The bar itself */}
      <div
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          'fixed left-0 right-0 top-0 z-65 border-b border-border bg-background/85 backdrop-blur-md',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-y-0' : '-translate-y-full',
        )}
        data-testid="session-switcher"
        role="toolbar"
        aria-label="Sessions"
      >
        <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
          {orderedServers.map((server) => (
            <SessionTile
              key={server.id}
              server={server}
              isActive={server.id === activeServerId}
              onClick={() => setActiveServer(server.id)}
            />
          ))}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="ml-1 h-9 w-9 flex-none p-0"
                onClick={goToLogin}
                aria-label="Add or connect server"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Connect another server</TooltipContent>
          </Tooltip>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0"
                  onClick={() => {
                    const next = !pinned;
                    setPinned(next);
                    savePinned(next);
                  }}
                  aria-label={pinned ? 'Unpin session bar' : 'Pin session bar'}
                  aria-pressed={pinned}
                  data-testid="session-switcher-pin"
                >
                  {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{pinned ? 'Unpin bar' : 'Keep bar visible'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  );
}
