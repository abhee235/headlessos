// M6.6: Start Menu — Glassmorphic two-column layout with rich SVG app icons
// @see docs/phases/phase-6.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  Search,
  Power,
  ChevronRight,
  User,
  Plug,
  Unplug,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import {
  DashboardIcon,
  FileExplorerIcon,
  TerminalIcon,
  DockerIcon,
  TaskManagerIcon,
  ServicesIcon,
  SettingsIcon,
} from '@/components/ui/FileIcon';

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
  IconComponent: React.ComponentType<{ size?: number }>;
}

const PINNED_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard', IconComponent: DashboardIcon },
  { id: 'files', label: 'Files', IconComponent: FileExplorerIcon },
  { id: 'terminal', label: 'Terminal', IconComponent: TerminalIcon },
  { id: 'taskmanager', label: 'Tasks', IconComponent: TaskManagerIcon },
  { id: 'docker', label: 'Docker', IconComponent: DockerIcon },
  { id: 'services', label: 'Services', IconComponent: ServicesIcon },
  { id: 'settings', label: 'Personalize', IconComponent: SettingsIcon },
];

interface RecentEntry {
  label: string;
  sub: string;
  IconComponent: React.ComponentType<{ size?: number }>;
}

const RECENTLY_USED: RecentEntry[] = [
  { label: 'System Overview', sub: '2 min ago', IconComponent: DashboardIcon },
  { label: 'Docker Containers', sub: '15 min ago', IconComponent: DockerIcon },
  { label: 'Server Logs', sub: '1 hour ago', IconComponent: TerminalIcon },
  { label: 'Service Status', sub: 'Yesterday', IconComponent: ServicesIcon },
  { label: 'File Browser', sub: 'Yesterday', IconComponent: FileExplorerIcon },
  { label: 'Task Manager', sub: '2 days ago', IconComponent: TaskManagerIcon },
];

// ─── Start Menu ──────────────────────────────────────────────────────────────

export function StartMenu() {
  const { startMenuOpen, closeStartMenu, openWindow } = useDesktopStore();
  const {
    servers,
    activeServerId,
    connectServer,
    disconnectServer,
    signOut,
  } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';
  const serverStatus = activeServer?.state?.status ?? 'disconnected';

  // Focus search on open
  useEffect(() => {
    if (startMenuOpen) {
      setSearchQuery('');
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

  if (!startMenuOpen) return null;

  const filteredApps = searchQuery
    ? PINNED_APPS.filter((a) =>
        a.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : PINNED_APPS;

  const handleOpenApp = (appId: string, label: string) => {
    if (!activeServerId || !isConnected) return;
    openWindow(appId, activeServerId, label, appId);
    closeStartMenu();
  };

  const statusDot =
    serverStatus === 'connected'
      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
      : serverStatus === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : serverStatus === 'error'
          ? 'bg-red-500'
          : 'bg-foreground/20';

  return (
    <div
      ref={menuRef}
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10000 w-160 bg-glass backdrop-blur-2xl backdrop-saturate-[1.8] border border-glass-border shadow-2xl shadow-black/10 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/5 rounded-2xl overflow-hidden animate-scaleIn"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Search bar ── */}
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center gap-3 px-4 py-2 bg-black/3 dark:bg-white/5 rounded-full border border-transparent focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Search className="w-4 h-4 text-foreground/40 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Type here to search"
            className="flex-1 bg-transparent text-[13px] font-medium text-foreground placeholder:text-foreground/35 outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex">
        {/* Left column: Pinned Apps */}
        <div className="flex-1 px-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold text-foreground/90 tracking-tight">
              Pinned Apps
            </h3>
            <button className="flex items-center gap-0.5 text-[11px] text-primary/80 hover:text-primary font-semibold px-2.5 py-1 rounded-lg hover:bg-primary/8 transition-colors">
              See all
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-0.5">
            {filteredApps.map((app) => (
              <button
                key={app.id}
                className={`group flex flex-col items-center gap-1.5 py-3 px-1.5 rounded-xl transition-all duration-150 ${
                  isConnected
                    ? 'hover:bg-black/5 dark:hover:bg-white/8 cursor-pointer active:scale-[0.97]'
                    : 'opacity-40 cursor-not-allowed'
                }`}
                onClick={() => handleOpenApp(app.id, app.label)}
                disabled={!isConnected}
              >
                <div className="transition-transform duration-150 group-hover:scale-110 group-active:scale-100">
                  <app.IconComponent size={44} />
                </div>
                <span className="text-[11px] text-foreground/60 font-semibold leading-tight text-center truncate w-full group-hover:text-foreground/90 transition-colors">
                  {app.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-separator self-stretch my-3" />

        {/* Right column: Recently Used */}
        <div className="w-56 px-3 pb-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[13px] font-bold text-foreground/90 tracking-tight">
              Recently Used
            </h3>
          </div>

          <div className="flex flex-col gap-0.5">
            {RECENTLY_USED.map((item) => (
              <button
                key={item.label}
                className={`group flex items-center gap-3 px-2 py-1.5 rounded-xl transition-all text-left ${
                  isConnected
                    ? 'hover:bg-black/5 dark:hover:bg-white/8 cursor-pointer'
                    : 'opacity-40 cursor-not-allowed'
                }`}
                disabled={!isConnected}
              >
                <div className="shrink-0">
                  <item.IconComponent size={32} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-foreground/75 font-semibold truncate group-hover:text-foreground transition-colors">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-foreground/35 font-medium">
                    {item.sub}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer: user + server status ── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-separator">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-linear-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-sm shadow-blue-500/25">
            <User className="w-4 h-4 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-foreground/90 tracking-tight">
              {getGreeting()}
            </p>
            <p className="text-[11px] text-foreground/40 font-medium">
              {activeServer
                ? `${activeServer.name} \u00b7 ${activeServer.host}:${activeServer.port}`
                : 'No server connected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Connection status dot */}
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />

          {/* Connect / Disconnect */}
          {activeServer && serverStatus === 'connected' ? (
            <button
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/6 text-foreground/35 hover:text-red-500 transition-colors"
              title="Disconnect"
              onClick={(e) => {
                e.stopPropagation();
                disconnectServer(activeServer.id);
              }}
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          ) : activeServer && serverStatus !== 'connecting' ? (
            <button
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/6 text-foreground/35 hover:text-emerald-500 transition-colors"
              title="Connect"
              onClick={(e) => {
                e.stopPropagation();
                connectServer(activeServer.id);
              }}
            >
              <Plug className="w-3.5 h-3.5" />
            </button>
          ) : null}

          {/* Separator */}
          <div className="w-px h-5 bg-separator mx-1" />

          {/* Sign out */}
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 dark:hover:bg-white/6 text-foreground/35 hover:text-foreground/70 transition-colors"
            title="Sign Out"
            onClick={() => {
              closeStartMenu();
              signOut();
            }}
          >
            <Power className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
