// M2.X: Start Menu — Windows-like start menu with apps and server selector
// @see docs/phases/phase-2.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  LayoutDashboard,
  FolderOpen,
  Terminal,
  Server,
  Plug,
  Unplug,
  Plus,
  Power,
  Settings,
  Search,
  Lock,
  UserRoundX,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface AppEntry {
  id: string;
  label: string;
  Icon: LucideIcon;
  iconColor: string;
  bgColor: string;
}

const ALL_APPS: AppEntry[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, iconColor: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  { id: 'files', label: 'File Explorer', Icon: FolderOpen, iconColor: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
  { id: 'terminal', label: 'Terminal', Icon: Terminal, iconColor: 'text-green-400', bgColor: 'bg-green-500/20' },
];

export function StartMenu() {
  const { startMenuOpen, closeStartMenu, openWindow } = useDesktopStore();
  const { servers, activeServerId, setActiveServer, connectServer, disconnectServer, fetchServers } =
    useAppStore();
  const { lockScreen, switchUser, signOut } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddServer, setShowAddServer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeServer = servers.find(s => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

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
    // Delay to prevent immediate close from taskbar click
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handler);
    };
  }, [startMenuOpen, closeStartMenu]);

  if (!startMenuOpen) return null;

  const filteredApps = searchQuery
    ? ALL_APPS.filter(a =>
        a.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : ALL_APPS;

  const handleOpenApp = (app: AppEntry) => {
    if (!activeServerId || !isConnected) return;
    openWindow(app.id, activeServerId, app.label, app.id);
    closeStartMenu();
  };

  return (
    <div
      ref={menuRef}
      className="absolute bottom-12 left-0 z-[10000] w-80 bg-white/75 dark:bg-zinc-900/80 backdrop-blur-2xl backdrop-saturate-[1.8] rounded-t-xl border border-white/60 dark:border-white/10 shadow-xl shadow-black/[0.06] dark:shadow-black/40 ring-1 ring-black/[0.03] dark:ring-transparent overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Search Bar */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-white/5">
          <Search className="w-4 h-4 text-zinc-400 dark:text-white/40 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search apps..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white/90 placeholder-zinc-400 dark:placeholder-white/30 outline-none"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Quick Apps — Pinned */}
      <div className="px-3 pb-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-white/30 font-semibold mb-2 px-1">
          Pinned
        </p>
        <div className="grid grid-cols-3 gap-1">
          {filteredApps.map(app => (
            <button
              key={app.id}
              className={`
                flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg
                transition-colors duration-100
                ${isConnected ? 'hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer' : 'opacity-40 cursor-not-allowed'}
              `}
              onClick={() => handleOpenApp(app)}
              disabled={!isConnected}
            >
              <div className={`w-9 h-9 rounded-lg ${app.bgColor} flex items-center justify-center`}>
                <app.Icon className={`w-5 h-5 ${app.iconColor}`} />
              </div>
              <span className="text-[11px] text-zinc-700 dark:text-white/80 font-medium">{app.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] mx-3" />

      {/* Server List */}
      <div className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-white/30 font-semibold mb-2 px-1">
          Servers
        </p>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {servers.length === 0 && (
            <p className="text-xs text-zinc-400 dark:text-white/30 px-2 py-2">No servers configured</p>
          )}
          {servers.map(srv => {
            const isActive = srv.id === activeServerId;
            const status = srv.state?.status ?? 'disconnected';
            const statusColor =
              status === 'connected'
                ? 'bg-green-500'
                : status === 'connecting'
                  ? 'bg-yellow-500 animate-pulse'
                  : status === 'error'
                    ? 'bg-red-500'
                    : 'bg-zinc-600';

            return (
              <div
                key={srv.id}
                className={`
                  flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer
                  transition-colors duration-100
                  ${isActive ? 'bg-black/5 dark:bg-white/10' : 'hover:bg-black/[0.03] dark:hover:bg-white/5'}
                `}
                onClick={() => setActiveServer(srv.id)}
              >
                <Server className="w-4 h-4 text-zinc-400 dark:text-white/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-800 dark:text-white/80 truncate font-medium">{srv.name}</p>
                  <p className="text-[10px] text-zinc-400 dark:text-white/40 truncate">
                    {srv.host}:{srv.port}
                  </p>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
                {status === 'connected' ? (
                  <button
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 dark:text-white/40 hover:text-red-400"
                    onClick={e => {
                      e.stopPropagation();
                      disconnectServer(srv.id);
                    }}
                    title="Disconnect"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                  </button>
                ) : status !== 'connecting' ? (
                  <button
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 dark:text-white/40 hover:text-green-400"
                    onClick={e => {
                      e.stopPropagation();
                      connectServer(srv.id);
                    }}
                    title="Connect"
                  >
                    <Plug className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer — Lock / Switch User / Sign Out */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-zinc-950/50">
        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 dark:text-white/40 hover:text-zinc-600 dark:hover:text-white/70"
            title="Lock"
            onClick={() => { closeStartMenu(); lockScreen(); }}
          >
            <Lock className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 dark:text-white/40 hover:text-zinc-600 dark:hover:text-white/70"
            title="Switch User"
            onClick={() => { closeStartMenu(); switchUser(); }}
          >
            <UserRoundX className="w-4 h-4" />
          </button>
          <button
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 dark:text-white/40 hover:text-zinc-600 dark:hover:text-white/70"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/10 text-zinc-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          title="Sign Out"
          onClick={() => { closeStartMenu(); signOut(); }}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
