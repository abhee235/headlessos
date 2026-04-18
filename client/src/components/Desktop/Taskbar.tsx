// M6.6: Taskbar — Windows 11 style with pinned apps + system tray
// @see docs/phases/phase-6.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
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
  ChevronUp,
  Plus,
  Power,
  PowerOff,
  Check,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useThemeStore } from '../../store/theme-store';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DashboardIcon,
  FileExplorerIcon,
  TerminalIcon,
  DockerIcon,
  TaskManagerIcon,
  ServicesIcon,
  SettingsIcon,
  ThisPCIcon,
  FleetIcon,
  AgentIcon,
} from '@/components/ui/FileIcon';
import { NotificationBell } from './NotificationCenter';

// ─── All known apps (icon + label) ──────────────────────────────────────────

interface AppMeta {
  id: string;
  label: string;
  IconComponent: React.ComponentType<{ size?: number }>;
}

const ALL_APPS: AppMeta[] = [
  { id: 'dashboard', label: 'Dashboard', IconComponent: DashboardIcon },
  { id: 'files', label: 'File Explorer', IconComponent: FileExplorerIcon },
  { id: 'terminal', label: 'Terminal', IconComponent: TerminalIcon },
  { id: 'docker', label: 'Docker', IconComponent: DockerIcon },
  { id: 'taskmanager', label: 'Task Manager', IconComponent: TaskManagerIcon },
  { id: 'services', label: 'Services', IconComponent: ServicesIcon },
  { id: 'settings', label: 'Settings', IconComponent: SettingsIcon },
  { id: 'serveradmin', label: 'Server Admin', IconComponent: ThisPCIcon },
  // EX6-C.3: Fleet moved to Control Center
  { id: 'agent', label: 'AI Agent', IconComponent: AgentIcon },
];

const ALL_APP_MAP = new Map(ALL_APPS.map(a => [a.id, a]));

// ─── Clock ───────────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState(new Date());
  const dateFormat = usePreferencesStore((s) => s.dateFormat);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: dateFormat === '12h',
  });
  const dateStr = time.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-end justify-center px-3 h-9 rounded-md hover:bg-foreground/5 cursor-default transition-colors select-none">
          <span className="text-[11.5px] text-foreground/90 font-semibold leading-tight tabular-nums tracking-tight text-uppercase">
            {timeStr}
          </span>
          <span className="text-[10px] text-foreground/55 font-medium leading-tight tracking-wide">
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
  const { resolvedTheme, toggleTheme } = useThemeStore();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/5 transition-colors"
          onClick={toggleTheme}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-foreground/80" />
          ) : (
            <Moon className="w-4 h-4 text-foreground/80" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>
        {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── System tray ─────────────────────────────────────────────────────────────

// ─── Server Switcher (replaces old sidebar — M10.2 redesign) ─────────────────

function ServerSwitcher() {
  const servers = useAppStore(s => s.servers);
  const activeServerId = useAppStore(s => s.activeServerId);
  const setActiveServer = useAppStore(s => s.setActiveServer);
  const connectServer = useAppStore(s => s.connectServer);
  const disconnectServer = useAppStore(s => s.disconnectServer);
  const openWindow = useDesktopStore(s => s.openWindow);
  const [open, setOpen] = useState(false);

  const activeServer = servers.find(s => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

  if (servers.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/5 cursor-default transition-colors">
            <WifiOff className="w-4 h-4 text-foreground/40" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          No servers configured
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1.5 h-9 px-2 rounded-md hover:bg-foreground/5 transition-colors cursor-default">
              {isConnected ? (
                <Wifi className="w-3.5 h-3.5 text-success shrink-0" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
              )}
              <span className="text-[11px] font-medium text-foreground/70 max-w-20 truncate">
                {activeServer?.name ?? 'Select'}
              </span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          {activeServer
            ? `${activeServer.name} — ${isConnected ? 'Connected' : 'Disconnected'}`
            : 'Select a server'}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        sideOffset={12}
        align="end"
        className="w-64 p-0"
      >
        <div className="px-3 py-2 border-b border-border/40">
          <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
            Servers
          </h4>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {servers.map(srv => {
            const isActive = srv.id === activeServerId;
            const status = srv.state?.status;
            const srvConnected = status === 'connected';
            const srvConnecting = status === 'connecting';

            return (
              <button
                key={srv.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  isActive ? 'bg-primary/8' : 'hover:bg-foreground/5'
                }`}
                onClick={() => {
                  setActiveServer(srv.id);
                  if (!srvConnected && !srvConnecting) {
                    connectServer(srv.id);
                  }
                  setOpen(false);
                }}
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    srvConnected
                      ? 'bg-success'
                      : srvConnecting
                        ? 'bg-warning animate-pulse'
                        : 'bg-foreground/20'
                  }`}
                />
                {/* Server info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-foreground truncate leading-tight">
                    {srv.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate leading-tight">
                    {srv.host}:{srv.port}
                  </div>
                </div>
                {/* Active check or connect/disconnect button */}
                {isActive ? (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : null}
                {/* Connect/disconnect toggle */}
                {srvConnected ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-1 rounded hover:bg-foreground/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          disconnectServer(srv.id);
                        }}
                      >
                        <PowerOff className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={4}>
                      Disconnect
                    </TooltipContent>
                  </Tooltip>
                ) : !srvConnecting ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="p-1 rounded hover:bg-foreground/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          connectServer(srv.id);
                        }}
                      >
                        <Power className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={4}>
                      Connect
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </button>
            );
          })}
        </div>
        {/* Add server */}
        <div className="border-t border-border/40 p-1">
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded transition-colors"
            onClick={() => {
              if (activeServerId) {
                openWindow('settings', activeServerId, 'Settings', 'settings');
              }
              setOpen(false);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Server
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── System tray ─────────────────────────────────────────────────────────────

function SystemTray() {
  return (
    <div className="absolute right-1 flex items-center">
      {/* Chevron (overflow) */}
      <button className="flex items-center justify-center w-8 h-9 rounded-md hover:bg-foreground/5 transition-colors">
        <ChevronUp className="w-3.5 h-3.5 text-foreground/60" />
      </button>

      {/* Notifications */}
      <NotificationBell />

      {/* Theme */}
      <ThemeToggle />

      {/* Server switcher */}
      <ServerSwitcher />

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
  const pinnedAppIds = usePreferencesStore(s => s.pinnedAppIds);
  const pinApp = usePreferencesStore(s => s.pinApp);
  const unpinApp = usePreferencesStore(s => s.unpinApp);

  // Build pinned apps list from preferences + app metadata
  const pinnedApps = pinnedAppIds
    .map(id => ALL_APP_MAP.get(id))
    .filter((a): a is AppMeta => !!a);

  // Click handler for pinned/running app icons
  const handleAppClick = useCallback(
    (appId: string, existingWindow?: { id: string; focused: boolean; minimized: boolean }) => {
      if (existingWindow) {
        if (existingWindow.focused && !existingWindow.minimized) {
          minimizeWindow(existingWindow.id);
        } else if (existingWindow.minimized) {
          restoreWindow(existingWindow.id);
        } else {
          focusWindow(existingWindow.id);
        }
      } else if (activeServerId && isConnected) {
        const meta = ALL_APP_MAP.get(appId);
        openWindow(appId, activeServerId, meta?.label ?? appId, appId);
      }
    },
    [activeServerId, isConnected, focusWindow, minimizeWindow, restoreWindow, openWindow],
  );

  const handleShowDesktop = useCallback(() => {
    useDesktopStore.getState().toggleShowDesktop();
  }, []);

  // Build set of pinned app IDs for quick lookup
  const pinnedIdSet = new Set(pinnedAppIds);
  // EX6-D: Citrix-style session isolation — only show running windows
  // that belong to the active session in the taskbar.
  const sessionWindows = activeServerId
    ? windows.filter((w) => w.serverId === activeServerId)
    : [];
  // Non-pinned open windows (scoped to active session)
  const unpinnedWindows = sessionWindows.filter((w) => !pinnedIdSet.has(w.appId));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="absolute bottom-0 left-0 right-0 h-13 z-9999 flex items-center justify-center bg-taskbar/80 dark:bg-taskbar/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-foreground/[0.06] shadow-[0_-1px_12px_0_rgba(0,0,0,0.04)]">
          {/* ── Center: Start + Pinned Apps + Running extras ── */}
          <div className="flex items-center gap-2">
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
                    className="w-5 h-5"
                  >
                    <defs>
                      <linearGradient id="win-tl" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#55B4F1" />
                        <stop offset="100%" stopColor="#1B7FCC" />
                      </linearGradient>
                      <linearGradient id="win-tr" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#5EC96E" />
                        <stop offset="100%" stopColor="#37A44C" />
                      </linearGradient>
                      <linearGradient id="win-bl" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#F0734B" />
                        <stop offset="100%" stopColor="#D94A2A" />
                      </linearGradient>
                      <linearGradient id="win-br" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#FBCE42" />
                        <stop offset="100%" stopColor="#E8AE10" />
                      </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="9" height="9" rx="2" fill="url(#win-tl)" />
                    <rect x="13" y="2" width="9" height="9" rx="2" fill="url(#win-tr)" />
                    <rect x="2" y="13" width="9" height="9" rx="2" fill="url(#win-bl)" />
                    <rect x="13" y="13" width="9" height="9" rx="2" fill="url(#win-br)" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={10}>
                Start
              </TooltipContent>
            </Tooltip>

            {/* ── Pinned apps ── */}
            {pinnedApps.map((app) => {
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
                          <app.IconComponent size={32} />
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
                      <span className="mr-2 opacity-50"><app.IconComponent size={16} /></span>
                      {app.label}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => unpinApp(app.id)}>
                      <PinOff className="w-4 h-4 mr-2 opacity-50" />
                      Unpin from Taskbar
                    </ContextMenuItem>
                    {isOpen && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          danger
                          onClick={() => win && closeWindow(win.id)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Close Window
                        </ContextMenuItem>
                      </>
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
              const meta = ALL_APP_MAP.get(win.appId);
              const Icon = meta?.IconComponent ?? DashboardIcon;
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
                          <Icon size={20} />
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
                      <span className="mr-2 opacity-50"><Icon size={16} /></span>
                      {win.title}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => pinApp(win.appId)}>
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

          {/* ── Show Desktop strip (Windows-style peek strip at far right) ── */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleShowDesktop}
                className="w-1 h-8 ml-1 rounded-sm bg-foreground/10 hover:bg-foreground/25 transition-colors shrink-0 cursor-pointer"
                aria-label="Show Desktop"
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Show Desktop
            </TooltipContent>
          </Tooltip>
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
