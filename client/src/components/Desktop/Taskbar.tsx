// M6.6: Taskbar — Windows 11 style with pinned apps + system tray
// @see docs/phases/phase-6.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  LayoutDashboard,
  FolderOpen,
  TerminalSquare,
  Wifi,
  WifiOff,
  Monitor,
  Settings,
  Activity,
  Box,
  Server,
  X,
  Pin,
  PinOff,
  Sun,
  Moon,
  Paintbrush,
  ChevronUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useThemeStore } from '../../store/theme-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Pinned app definitions ─────────────────────────────────────────────────

interface PinnedApp {
  id: string;
  label: string;
  Icon: LucideIcon;
}

const PINNED_APPS: PinnedApp[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'files', label: 'File Explorer', Icon: FolderOpen },
  { id: 'terminal', label: 'Terminal', Icon: TerminalSquare },
  { id: 'docker', label: 'Docker', Icon: Box },
  { id: 'taskmanager', label: 'Task Manager', Icon: Activity },
  { id: 'settings', label: 'Settings', Icon: Paintbrush },
];

const ALL_APP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: FolderOpen,
  terminal: TerminalSquare,
  taskmanager: Activity,
  settings: Paintbrush,
  docker: Box,
  services: Server,
};

// ─── Clock ───────────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateStr = time.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center justify-center px-2.5 h-9 rounded-md hover:bg-foreground/5 cursor-default transition-colors select-none">
          <span className="text-[11px] text-foreground/80 font-medium leading-tight tabular-nums">
            {timeStr}
          </span>
          <span className="text-[10px] text-foreground/40 leading-tight">
            {dateStr}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>
        {time.toLocaleDateString([], {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Theme toggle ────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/5 transition-colors"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-foreground/55" />
          ) : (
            <Moon className="w-4 h-4 text-foreground/55" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── System tray ─────────────────────────────────────────────────────────────

function SystemTray() {
  const { activeServerId, servers } = useAppStore();
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

  return (
    <div className="absolute right-1 flex items-center">
      {/* Chevron (overflow) */}
      <button className="flex items-center justify-center w-8 h-9 rounded-md hover:bg-foreground/5 transition-colors">
        <ChevronUp className="w-3.5 h-3.5 text-foreground/40" />
      </button>

      {/* Theme */}
      <ThemeToggle />

      {/* Network */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/5 cursor-default transition-colors">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-foreground/55" />
            ) : (
              <WifiOff className="w-4 h-4 text-foreground/30" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {activeServer
            ? `${activeServer.name} — ${isConnected ? 'Connected' : 'Disconnected'}`
            : 'No server selected'}
        </TooltipContent>
      </Tooltip>

      {/* Thin separator */}
      <div className="w-px h-4 bg-foreground/8 mx-0.5" />

      {/* Clock */}
      <Clock />
    </div>
  );
}

// ─── Taskbar ─────────────────────────────────────────────────────────────────

export function Taskbar() {
  const {
    windows,
    focusWindow,
    minimizeWindow,
    restoreWindow,
    closeWindow,
    openWindow,
    toggleStartMenu,
    startMenuOpen,
  } = useDesktopStore();
  const { activeServerId } = useAppStore();
  const isConnected = useAppStore(
    (s) => s.servers.find((srv) => srv.id === s.activeServerId)?.state?.status === 'connected',
  );

  // Click handler for pinned/running app icons
  const handleAppClick = useCallback(
    (appId: string, existingWindow?: { id: string; focused: boolean; minimized: boolean }) => {
      if (existingWindow) {
        // Toggle: if focused → minimize, if minimized → restore, else focus
        if (existingWindow.focused && !existingWindow.minimized) {
          minimizeWindow(existingWindow.id);
        } else if (existingWindow.minimized) {
          restoreWindow(existingWindow.id);
        } else {
          focusWindow(existingWindow.id);
        }
      } else if (activeServerId && isConnected) {
        // Open new window for this pinned app
        const app = PINNED_APPS.find((a) => a.id === appId);
        openWindow(appId, activeServerId, app?.label ?? appId, appId);
      }
    },
    [activeServerId, isConnected, focusWindow, minimizeWindow, restoreWindow, openWindow],
  );

  const handleShowDesktop = useCallback(() => {
    const { windows: allWindows, minimizeWindow: min } = useDesktopStore.getState();
    allWindows.forEach((w) => {
      if (!w.minimized) min(w.id);
    });
  }, []);

  // Build set of pinned app IDs for quick lookup
  const pinnedIds = new Set(PINNED_APPS.map((a) => a.id));
  // Non-pinned open windows (rare — only for apps opened that aren't pinned)
  const unpinnedWindows = windows.filter((w) => !pinnedIds.has(w.appId));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="absolute bottom-0 left-0 right-0 h-12 z-9999 flex items-center justify-center bg-background/80 dark:bg-background/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-foreground/6 shadow-[0_-2px_8px_0_rgba(0,0,0,0.06)]">
          {/* ── Center: Start + Pinned Apps + Running extras ── */}
          <div className="flex items-center gap-0.5">
            {/* Start */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`flex items-center justify-center w-11 h-10 rounded-md transition-all duration-100 ${
                    startMenuOpen
                      ? 'bg-foreground/10'
                      : 'hover:bg-foreground/5 active:bg-foreground/8'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStartMenu();
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-4.5 h-4.5"
                  >
                    <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#0078d4" />
                    <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#0078d4" opacity="0.7" />
                    <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#0078d4" opacity="0.7" />
                    <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#0078d4" opacity="0.4" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={10}>
                Start
              </TooltipContent>
            </Tooltip>

            {/* ── Pinned apps ── */}
            {PINNED_APPS.map((app) => {
              // Find open window for this pinned app (on the active server)
              const win = windows.find(
                (w) => w.appId === app.id && w.serverId === activeServerId,
              );
              const isOpen = !!win;
              const isFocused = win?.focused && !win?.minimized;

              return (
                <ContextMenu key={app.id}>
                  <ContextMenuTrigger asChild>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className={`relative flex items-center justify-center w-11 h-10 rounded-md transition-all duration-100 ${
                            isFocused
                              ? 'bg-foreground/10'
                              : isOpen
                                ? 'hover:bg-foreground/6'
                                : 'hover:bg-foreground/5'
                          } ${!isConnected && !isOpen ? 'opacity-40' : ''}`}
                          onClick={() => handleAppClick(app.id, win ?? undefined)}
                        >
                          <app.Icon
                            className={`w-4.5 h-4.5 transition-colors ${
                              isFocused
                                ? 'text-foreground/85'
                                : isOpen
                                  ? 'text-foreground/70'
                                  : 'text-foreground/50'
                            }`}
                          />
                          {/* Indicator pill */}
                          {isOpen && (
                            <span
                              className={`absolute bottom-0.75 left-1/2 -translate-x-1/2 rounded-full transition-all duration-200 ${
                                isFocused
                                  ? 'w-4 h-0.75 bg-primary'
                                  : 'w-1.5 h-0.75 bg-foreground/25'
                              }`}
                            />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={10}>
                        {app.label}
                      </TooltipContent>
                    </Tooltip>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem className="text-xs font-medium pointer-events-none">
                      <app.Icon className="w-4 h-4 mr-2 opacity-50" />
                      {app.label}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {isOpen ? (
                      <>
                        <ContextMenuItem disabled>
                          <PinOff className="w-4 h-4 mr-2 opacity-50" />
                          Unpin from Taskbar
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          danger
                          onClick={() => win && closeWindow(win.id)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Close Window
                        </ContextMenuItem>
                      </>
                    ) : (
                      <ContextMenuItem disabled>
                        <PinOff className="w-4 h-4 mr-2 opacity-50" />
                        Unpin from Taskbar
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {/* ── Separator if there are unpinned windows ── */}
            {unpinnedWindows.length > 0 && (
              <div className="w-px h-5 bg-foreground/8 mx-1" />
            )}

            {/* ── Non-pinned running windows ── */}
            {unpinnedWindows.map((win) => {
              const Icon = ALL_APP_ICONS[win.appId] ?? LayoutDashboard;
              const isFocused = win.focused && !win.minimized;

              return (
                <ContextMenu key={win.id}>
                  <ContextMenuTrigger asChild>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className={`relative flex items-center justify-center w-11 h-10 rounded-md transition-all duration-100 ${
                            isFocused
                              ? 'bg-foreground/10'
                              : win.minimized
                                ? 'opacity-50 hover:bg-foreground/5 hover:opacity-80'
                                : 'hover:bg-foreground/6'
                          }`}
                          onClick={() =>
                            handleAppClick(win.appId, {
                              id: win.id,
                              focused: win.focused,
                              minimized: win.minimized,
                            })
                          }
                        >
                          <Icon className="w-4.5 h-4.5 text-foreground/70" />
                          {!win.minimized && (
                            <span
                              className={`absolute bottom-0.75 left-1/2 -translate-x-1/2 rounded-full transition-all duration-200 ${
                                isFocused
                                  ? 'w-4 h-0.75 bg-primary'
                                  : 'w-1.5 h-0.75 bg-foreground/25'
                              }`}
                            />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={10}>
                        {win.title}
                      </TooltipContent>
                    </Tooltip>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem className="text-xs font-medium pointer-events-none">
                      <Icon className="w-4 h-4 mr-2 opacity-50" />
                      {win.title}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled>
                      <Pin className="w-4 h-4 mr-2 opacity-50" />
                      Pin to Taskbar
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      danger
                      onClick={() => closeWindow(win.id)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Close Window
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>

          {/* ── System tray ── */}
          <SystemTray />
        </div>
      </ContextMenuTrigger>

      {/* Taskbar context menu */}
      <ContextMenuContent>
        <ContextMenuItem onClick={handleShowDesktop}>
          <Monitor className="w-4 h-4 mr-2 opacity-50" />
          Show Desktop
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => {
            if (activeServerId) {
              openWindow('taskmanager', activeServerId, 'Task Manager', 'taskmanager');
            }
          }}
        >
          <Activity className="w-4 h-4 mr-2 opacity-50" />
          Task Manager
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>
          <Settings className="w-4 h-4 mr-2 opacity-50" />
          Taskbar Settings
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
