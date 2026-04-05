// M2.X: Taskbar — Windows-like bottom taskbar with start menu, running apps, system tray
// @see docs/phases/phase-2.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  LayoutDashboard,
  FolderOpen,
  Terminal,
  Wifi,
  WifiOff,
  ChevronUp,
  Monitor,
  Settings,
  Activity,
  X,
  Pin,
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

const APP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: FolderOpen,
  terminal: Terminal,
  taskmanager: Activity,
  settings: Settings,
};

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex flex-col items-end px-3 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-default">
      <span className="text-xs text-zinc-700 dark:text-white/90 font-medium leading-tight">{timeStr}</span>
      <span className="text-[10px] text-zinc-500 dark:text-white/60 leading-tight">{dateStr}</span>
    </div>
  );
}

export function Taskbar() {
  const { windows, focusWindow, minimizeWindow, restoreWindow, closeWindow, toggleStartMenu, startMenuOpen } =
    useDesktopStore();
  const { activeServerId, servers } = useAppStore();
  const activeServer = servers.find(s => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

  const handleTaskbarClick = (windowId: string) => {
    const win = windows.find(w => w.id === windowId);
    if (!win) return;

    if (win.focused && !win.minimized) {
      minimizeWindow(windowId);
    } else if (win.minimized) {
      restoreWindow(windowId);
    } else {
      focusWindow(windowId);
    }
  };

  const handleShowDesktop = useCallback(() => {
    const { windows: allWindows, minimizeWindow: minimize } = useDesktopStore.getState();
    allWindows.forEach(w => { if (!w.minimized) minimize(w.id); });
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="absolute bottom-0 left-0 right-0 h-12 z-[9999] flex items-center bg-white/70 dark:bg-zinc-900/80 backdrop-blur-2xl backdrop-saturate-[1.8] border-t border-white/60 dark:border-white/10 shadow-[0_-1px_12px_rgba(0,0,0,0.04)] dark:shadow-2xl ring-1 ring-black/[0.02] dark:ring-transparent"
        >
      {/* Start Button */}
      <button
        className={`
          flex items-center justify-center w-12 h-full
          transition-colors duration-100
          ${startMenuOpen ? 'bg-black/10 dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/10'}
        `}
        onClick={(e) => {
          e.stopPropagation();
          toggleStartMenu();
        }}
        title="Start"
      >
        <div className="w-5 h-5">
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
            <rect x="2" y="2" width="9" height="9" rx="1.5" fill="#60a5fa" />
            <rect x="13" y="2" width="9" height="9" rx="1.5" fill="#4ade80" />
            <rect x="2" y="13" width="9" height="9" rx="1.5" fill="#facc15" />
            <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#f87171" />
          </svg>
        </div>
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-zinc-300 dark:bg-white/10 mx-1" />

      {/* Running Windows */}
      <div className="flex-1 flex items-center gap-0.5 px-1 overflow-x-auto">
        {windows.map(win => {
          const Icon = APP_ICONS[win.appId] ?? LayoutDashboard;
          return (
            <ContextMenu key={win.id}>
              <ContextMenuTrigger asChild>
                <button
                  className={`
                    relative flex items-center gap-2 px-3 h-9 rounded
                    text-sm transition-all duration-100 shrink-0
                    ${win.focused && !win.minimized
                      ? 'bg-black/10 dark:bg-white/15 text-zinc-900 dark:text-white shadow-inner'
                      : win.minimized
                        ? 'bg-transparent text-zinc-400 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5'
                        : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-white/80 hover:bg-black/10 dark:hover:bg-white/10'
                    }
                  `}
                  onClick={() => handleTaskbarClick(win.id)}
                  title={win.title}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate max-w-[140px] text-xs font-medium">{win.title}</span>
                  {/* Active indicator bar */}
                  {!win.minimized && (
                    <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all ${
                      win.focused ? 'w-6 bg-blue-400' : 'w-3 bg-zinc-300 dark:bg-white/30'
                    }`} />
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem className="font-medium text-xs pointer-events-none">
                  <Icon className="w-4 h-4 mr-2 opacity-60" />
                  {win.title}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem disabled>
                  <Pin className="w-4 h-4 mr-2 opacity-60" />
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

      {/* System Tray */}
      <div className="flex items-center gap-1 px-2">
        {/* Show hidden icons button */}
        <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" title="Show hidden icons">
          <ChevronUp className="w-3.5 h-3.5 text-zinc-400 dark:text-white/50" />
        </button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Connection status */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-default"
          title={activeServer ? `${activeServer.name} (${isConnected ? 'connected' : 'disconnected'})` : 'No server'}
        >
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-zinc-300 dark:text-white/30" />
          )}
          <span className="text-[10px] text-zinc-500 dark:text-white/60 max-w-[80px] truncate">
            {activeServer?.name ?? 'No server'}
          </span>
        </div>

        {/* Clock */}
        <Clock />

        {/* Show Desktop button */}
        <button
          className="w-1.5 h-full hover:bg-black/10 dark:hover:bg-white/20 rounded-sm"
          title="Show Desktop"
          onClick={handleShowDesktop}
        />
      </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleShowDesktop}>
          <Monitor className="w-4 h-4 mr-2 opacity-60" />
          Show Desktop
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => {
            if (activeServerId) {
              const { openWindow } = useDesktopStore.getState();
              openWindow('taskmanager', activeServerId, 'Task Manager', 'taskmanager');
            }
          }}
        >
          <Activity className="w-4 h-4 mr-2 opacity-60" />
          Task Manager
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled>
          <Settings className="w-4 h-4 mr-2 opacity-60" />
          Taskbar Settings
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button
      className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? (
        <svg className="w-3.5 h-3.5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm10-8a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5 12a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zm14.07-6.36a1 1 0 010 1.41l-.71.71a1 1 0 11-1.41-1.41l.71-.71a1 1 0 011.41 0zM7.05 17.66a1 1 0 010 1.41l-.71.71a1 1 0 11-1.41-1.41l.71-.71a1 1 0 011.41 0zm11.31 0a1 1 0 010 1.41l-.71.71a1 1 0 01-1.41-1.41l.71-.71a1 1 0 011.41 0zM7.05 6.34a1 1 0 010 1.41l-.71.71A1 1 0 014.93 7.05l.71-.71a1 1 0 011.41 0zM12 7a5 5 0 110 10 5 5 0 010-10z"/>
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>
        </svg>
      )}
    </button>
  );
}
