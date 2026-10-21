// M6.6: Start Menu — app launcher
// EX8.4: LumenOS v3 launcher — glass-heavy 30px panel rising from the dock:
// date + greeting header with a server chip, recessed search, quick actions,
// app grid, Recent + Server cards, and a footer with Settings / Lock /
// Switch user / Sign out.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { useSavedAppStore } from '../../store/saved-app-store';
import {
  Search,
  Power,
  Lock,
  ArrowLeftRight,
  Sparkles,
  SquareTerminal,
  FolderOpen,
  Palette,
  Monitor,
  Activity,
  Settings,
  Plug,
  Unplug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getLucideIcon } from '../DynamicUI/widgets/icon-helper';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AppIcon } from '@/components/ui/FileIcon';
import { formatShortcut } from '@/lib/format-shortcut';
import { cn } from '@/lib/utils';

// ─── Greeting ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── App definitions ─────────────────────────────────────────────────────────

interface AppEntry {
  id: string;
  label: string;
}

const ALL_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'files', label: 'File Explorer' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'taskmanager', label: 'Task Manager' },
  { id: 'docker', label: 'Docker' },
  { id: 'services', label: 'Services' },
  { id: 'serveradmin', label: 'Server Admin' },
  // EX6-C.3: Fleet moved to Control Center
  { id: 'agent', label: 'AI Agent' },
  { id: 'observatory', label: 'LLM Observatory' },
  { id: 'settings', label: 'Settings' },
];

const APP_LABEL_MAP: Record<string, string> = {
  ...Object.fromEntries(ALL_APPS.map((a) => [a.id, a.label])),
  fleet: 'Fleet Overview',
};

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

const APP_COLS = 5;

// ─── Small pieces ────────────────────────────────────────────────────────────

function QuickAction({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="lumen-card flex h-[96px] min-w-0 flex-col items-center justify-center gap-[7px] rounded-[18px] text-foreground transition-colors hover:bg-dock-hover disabled:pointer-events-none disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} />
      <span className="max-w-full truncate px-1 text-xs font-medium">{label}</span>
    </button>
  );
}

function FooterButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      className="lumen-well grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-chip-2"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}

// ─── Start Menu ──────────────────────────────────────────────────────────────

export function StartMenu() {
  const { startMenuOpen, closeStartMenu, openWindow, toggleShowDesktop } = useDesktopStore();
  const {
    servers,
    activeServerId,
    connectServer,
    disconnectServer,
    lockScreen,
    switchUser,
    signOut,
  } = useAppStore();
  const recentApps = usePreferencesStore(s => s.recentApps);
  const savedApps = useSavedAppStore(s => s.apps);
  const fetchSavedApps = useSavedAppStore(s => s.fetchApps);
  const savedAppsFetched = useSavedAppStore(s => s.fetched);
  const openSavedApp = useSavedAppStore(s => s.openApp);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';
  const serverStatus = activeServer?.state?.status ?? 'disconnected';

  // Fetch saved apps on first open
  useEffect(() => {
    if (startMenuOpen && !savedAppsFetched) {
      void fetchSavedApps();
    }
  }, [startMenuOpen, savedAppsFetched, fetchSavedApps]);

  // Focus search on open
  useEffect(() => {
    if (startMenuOpen) {
      setSearchQuery('');
      setFocusedIndex(-1);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [startMenuOpen]);

  // Close on outside click
  useEffect(() => {
    if (!startMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeStartMenu();
      }
    };
    const timeout = setTimeout(
      () => document.addEventListener('mousedown', handler),
      50,
    );
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handler);
    };
  }, [startMenuOpen, closeStartMenu]);

  const query = searchQuery.trim().toLowerCase();
  const searching = query.length > 0;

  const visibleApps = useMemo(
    () => (searching ? ALL_APPS.filter((a) => a.label.toLowerCase().includes(query)) : ALL_APPS),
    [searching, query],
  );

  // EX5-C.3: Filtered saved apps for search
  const filteredSavedApps = searching
    ? savedApps.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.cliTool.toLowerCase().includes(query) ||
        a.tags.some(t => t.toLowerCase().includes(query))
      )
    : savedApps;

  const handleOpenApp = useCallback((appId: string, label: string, meta?: Record<string, string>) => {
    // `settings` is a global app (no server needed) — especially the "Personalize" entry.
    const isGlobalApp = appId === 'settings';
    if (!isGlobalApp && (!activeServerId || !isConnected)) return;
    const serverId = isGlobalApp ? '' : (activeServerId ?? '');
    openWindow(appId, serverId, label, appId, meta);
    closeStartMenu();
  }, [activeServerId, isConnected, openWindow, closeStartMenu]);

  // EX5-C.3: Open a saved app as a DynamicUI window
  const handleOpenSavedApp = useCallback((app: (typeof savedApps)[number]) => {
    if (!activeServerId || !isConnected) return;
    openSavedApp(app, activeServerId);
    closeStartMenu();
  }, [activeServerId, isConnected, openSavedApp, closeStartMenu]);

  // Keyboard navigation: a 5-column grid while browsing, a list while searching
  const cols = searching ? 1 : APP_COLS;
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const count = visibleApps.length;
    if (e.key === 'Escape') {
      closeStartMenu();
      return;
    }
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = prev + cols;
        return next >= count ? (prev < 0 ? 0 : prev) : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => {
        const next = prev - cols;
        return next < 0 ? -1 : next;
      });
    } else if (e.key === 'ArrowRight' && !searching) {
      e.preventDefault();
      setFocusedIndex(prev => (prev + 1 >= count ? prev : prev + 1));
    } else if (e.key === 'ArrowLeft' && !searching) {
      e.preventDefault();
      setFocusedIndex(prev => (prev <= 0 ? -1 : prev - 1));
    } else if (e.key === 'Enter') {
      const idx = focusedIndex >= 0 ? focusedIndex : searching ? 0 : -1;
      if (idx >= 0 && idx < count) {
        e.preventDefault();
        const app = visibleApps[idx]!;
        handleOpenApp(app.id, app.label);
      }
    }
  }, [visibleApps, cols, focusedIndex, searching, closeStartMenu, handleOpenApp]);

  // ── Early return AFTER all hooks (React Rules of Hooks) ──
  if (!startMenuOpen) return null;

  const now = new Date();
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const statusDot =
    serverStatus === 'connected'
      ? 'bg-success shadow-[0_0_8px_var(--success)]'
      : serverStatus === 'connecting'
        ? 'bg-warning animate-pulse'
        : serverStatus === 'error'
          ? 'bg-destructive'
          : 'bg-fill-2';

  const appDisabled = (id: string) => !isConnected && id !== 'settings';

  return (
    <div
      ref={menuRef}
      className="glass-heavy absolute bottom-[100px] left-1/2 z-[10000] flex max-h-[calc(100%-116px)] w-[780px] max-w-[calc(100vw-28px)] -translate-x-1/2 flex-col overflow-hidden rounded-[30px] animate-panelIn"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label="Launcher"
    >
      {/* ── Header: date + greeting, server chip ── */}
      <div className="flex shrink-0 items-end justify-between gap-3 px-6 pt-[22px] pb-3.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm text-label-2">{dateStr}</span>
          <span className="truncate text-2xl leading-[30px] font-medium tracking-[-0.01em]">{getGreeting()}</span>
        </div>
        <div className="lumen-card flex min-w-0 items-center gap-2.5 rounded-[20px] py-1.5 pl-3 pr-3">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDot)} />
          <span className="truncate text-[15px] font-semibold">{activeServer?.name ?? 'No server'}</span>
          {activeServer && (
            <span className="truncate font-mono text-xs text-label-2">{activeServer.host}</span>
          )}
        </div>
      </div>

      {/* ── Search (recessed pill) ── */}
      <div className="shrink-0 px-6 pb-1">
        <div className="lumen-well flex h-[46px] items-center gap-3 rounded-[23px] px-4 focus-within:ring-[3px] focus-within:ring-accent-soft">
          <Search className="h-[19px] w-[19px] shrink-0 text-label-2" strokeWidth={1.75} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search apps"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-label-3"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setFocusedIndex(-1); }}
            aria-label="Search apps"
          />
          <span className="flex shrink-0 gap-px rounded-[6px] bg-fill px-2 py-[3px] text-[11px] font-semibold text-label-2">
            {formatShortcut('Ctrl+Space').map((k, i) => <span key={i}>{k}</span>)}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-6 pt-4 pb-[18px] [scrollbar-width:none]">
        {!searching ? (
          <>
            {/* Quick actions */}
            <div className="grid grid-cols-3 gap-4 min-[680px]:grid-cols-6">
              <QuickAction icon={SquareTerminal} label="Terminal" disabled={!isConnected} onClick={() => handleOpenApp('terminal', 'Terminal')} />
              <QuickAction icon={FolderOpen} label="Files" disabled={!isConnected} onClick={() => handleOpenApp('files', 'File Explorer')} />
              <QuickAction icon={Palette} label="Personalize" onClick={() => handleOpenApp('settings', 'Personalize', { initialPage: 'wallpaper' })} />
              <QuickAction icon={Monitor} label="Desktop" onClick={() => { toggleShowDesktop(); closeStartMenu(); }} />
              <QuickAction icon={ArrowLeftRight} label="Switch" onClick={() => { closeStartMenu(); switchUser(); }} />
              <QuickAction icon={Lock} label="Lock" onClick={() => { closeStartMenu(); lockScreen(); }} />
            </div>

            {/* App grid */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[15px] font-semibold">Apps</span>
                <span className="text-xs text-label-2">{ALL_APPS.length} apps</span>
              </div>
              <div className="grid grid-cols-5 gap-x-1 gap-y-1.5">
                {visibleApps.map((app, idx) => (
                  <button
                    key={app.id}
                    className={cn(
                      'group flex min-w-0 flex-col items-center gap-2 rounded-[16px] px-0.5 pt-2.5 pb-2 text-foreground transition-colors',
                      appDisabled(app.id) ? 'cursor-not-allowed opacity-40' : 'hover:bg-fill',
                      idx === focusedIndex && 'bg-accent-soft ring-1 ring-accent-glow',
                    )}
                    onClick={() => handleOpenApp(app.id, app.label)}
                    disabled={appDisabled(app.id)}
                  >
                    <span className="lumen-plate relative h-[52px] w-[52px] rounded-[17px] transition-transform duration-150 group-hover:scale-105">
                      <span className="absolute left-[9px] top-[9px] flex h-8 w-8 items-center justify-center drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]">
                        <AppIcon appId={app.id} size={32} />
                      </span>
                    </span>
                    <span className="max-w-full truncate text-xs">{app.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* EX5-C.3: My Apps (saved apps) */}
            {filteredSavedApps.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="px-1 text-[15px] font-semibold">My Apps</span>
                <div className="flex flex-wrap gap-1.5">
                  {filteredSavedApps.slice(0, 8).map((app) => {
                    const IconComp = getLucideIcon(app.icon) ?? Sparkles;
                    return (
                      <button
                        key={`saved-pinned-${app.id}`}
                        className={cn(
                          'flex h-9 items-center gap-2 rounded-full border border-edge bg-mat px-3 text-[13px] font-medium transition-colors',
                          isConnected ? 'hover:bg-mat-thick' : 'cursor-not-allowed opacity-40',
                        )}
                        disabled={!isConnected}
                        onClick={() => handleOpenSavedApp(app)}
                        data-testid={`saved-app-pinned-${app.id}`}
                      >
                        <IconComp size={16} className="shrink-0 text-accent-solid" strokeWidth={1.75} />
                        <span className="max-w-32 truncate">{app.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent + Server cards */}
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3.5">
              <div className="lumen-card flex min-w-0 flex-col gap-0.5 rounded-[22px] px-2.5 pt-3.5 pb-2">
                <span className="px-2 pb-1.5 text-[15px] font-semibold">Recent</span>
                {recentApps.length === 0 ? (
                  <p className="px-2 py-4 text-[13px] text-label-2">Open an app to see it here</p>
                ) : (
                  recentApps.slice(0, 4).map((entry) => {
                    const label = APP_LABEL_MAP[entry.appId] ?? entry.appId;
                    return (
                      <button
                        key={entry.appId}
                        className={cn(
                          'flex min-h-12 min-w-0 items-center gap-3 rounded-[12px] px-2 text-left transition-colors',
                          isConnected ? 'hover:bg-fill' : 'cursor-not-allowed opacity-40',
                        )}
                        disabled={!isConnected}
                        onClick={() => handleOpenApp(entry.appId, label)}
                      >
                        <AppIcon appId={entry.appId} size={28} />
                        <span className="flex min-w-0 flex-col gap-px">
                          <span className="truncate text-[13px]">{label}</span>
                          <span className="truncate text-[11px] text-label-2">{formatTimeAgo(entry.timestamp)}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="lumen-card flex min-w-0 flex-col gap-3.5 rounded-[22px] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">Server</span>
                  <span className={cn('h-2 w-2 rounded-full', statusDot)} />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-label-2">Status</span>
                    <span className="font-semibold capitalize">{serverStatus}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-label-2">Host</span>
                    <span className="truncate font-mono font-medium">
                      {activeServer ? `${activeServer.host}:${activeServer.port}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-label-2">User</span>
                    <span className="truncate font-mono font-medium">{activeServer?.username ?? '—'}</span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-1.5 text-xs text-label-2 transition-colors hover:text-foreground disabled:opacity-40"
                    disabled={!isConnected}
                    onClick={() => handleOpenApp('taskmanager', 'Task Manager')}
                  >
                    <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Open Task Manager
                  </button>
                  {activeServer && serverStatus === 'connected' ? (
                    <button
                      className="grid h-7 w-7 place-items-center rounded-full bg-fill text-label-2 transition-colors hover:bg-fill-2 hover:text-danger"
                      title="Disconnect"
                      aria-label="Disconnect"
                      onClick={(e) => { e.stopPropagation(); disconnectServer(activeServer.id); }}
                    >
                      <Unplug className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  ) : activeServer && serverStatus !== 'connecting' ? (
                    <button
                      className="grid h-7 w-7 place-items-center rounded-full bg-fill text-label-2 transition-colors hover:bg-fill-2 hover:text-success"
                      title="Connect"
                      aria-label="Connect"
                      onClick={(e) => { e.stopPropagation(); connectServer(activeServer.id); }}
                    >
                      <Plug className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── Search results ── */
          <div className="flex flex-col gap-0.5">
            <div className="px-1.5 pb-1.5 text-[13px] font-semibold">
              {visibleApps.length + filteredSavedApps.length > 0 ? 'Best matches' : 'No matches'}
            </div>
            {visibleApps.map((app, idx) => (
              <button
                key={app.id}
                className={cn(
                  'flex min-h-[50px] items-center gap-3 rounded-[12px] px-2.5 text-left transition-colors',
                  appDisabled(app.id) ? 'cursor-not-allowed opacity-40' : 'hover:bg-fill',
                  (idx === focusedIndex || (focusedIndex < 0 && idx === 0)) && 'bg-accent-soft',
                )}
                disabled={appDisabled(app.id)}
                onClick={() => handleOpenApp(app.id, app.label)}
              >
                <AppIcon appId={app.id} size={30} />
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="text-sm">{app.label}</span>
                  <span className="text-xs text-label-2">App</span>
                </span>
              </button>
            ))}
            {filteredSavedApps.map((app) => {
              const IconComp = getLucideIcon(app.icon) ?? Sparkles;
              return (
                <button
                  key={`saved-${app.id}`}
                  className={cn(
                    'flex min-h-[50px] items-center gap-3 rounded-[12px] px-2.5 text-left transition-colors',
                    isConnected ? 'hover:bg-fill' : 'cursor-not-allowed opacity-40',
                  )}
                  disabled={!isConnected}
                  onClick={() => handleOpenSavedApp(app)}
                  data-testid={`saved-app-${app.id}`}
                >
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-[10px] bg-accent-soft">
                    <IconComp size={17} className="text-accent-solid" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-sm">{app.name}</span>
                    <span className="font-mono text-xs text-label-2">{app.cliTool}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-t border-border pl-6 pr-4">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-2 border-white/25 bg-[linear-gradient(160deg,var(--lumen-accent-hi),var(--lumen-accent))] text-[13px] font-bold text-white">
          {(activeServer?.username ?? 'H').slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-sm font-semibold">{activeServer?.username ?? 'HeadlessOS'}</span>
          <span className="truncate text-[11px] text-label-2">
            {activeServer ? `${activeServer.name} · ${activeServer.host}:${activeServer.port}` : 'No server connected'}
          </span>
        </div>
        <FooterButton icon={Settings} label="Settings" onClick={() => handleOpenApp('settings', 'Settings')} />
        <FooterButton icon={Lock} label="Lock" onClick={() => { closeStartMenu(); lockScreen(); }} />
        <FooterButton icon={ArrowLeftRight} label="Switch User" onClick={() => { closeStartMenu(); switchUser(); }} />
        <FooterButton icon={Power} label="Sign Out" onClick={() => { closeStartMenu(); signOut(); }} />
      </div>
    </div>
  );
}
