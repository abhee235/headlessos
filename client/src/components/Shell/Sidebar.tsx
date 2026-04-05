// M1.8 + M2.2: Sidebar — server list + connection controls + app launcher
// @see docs/phases/phase-1.md, docs/phases/phase-2.md

import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { Server, Plug, Unplug, Trash2, Plus, Terminal, LayoutDashboard, FolderOpen } from 'lucide-react';
import { APPS } from '../../lib/apps';

export function Sidebar() {
  const {
    servers,
    activeServerId,
    loadingServers,
    fetchServers,
    setActiveServer,
    connectServer,
    disconnectServer,
    removeServer,
    toggleTerminal,
    openTab,
  } = useAppStore();

  const activeServer = servers.find(s => s.id === activeServerId);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <aside className="flex flex-col w-56 bg-zinc-900 border-r border-zinc-800 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Server className="w-5 h-5 text-blue-400" />
        <span className="text-sm font-semibold text-zinc-100">Servers</span>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto py-2">
        {loadingServers && (
          <p className="text-xs text-zinc-500 px-4 py-2">Loading…</p>
        )}

        {!loadingServers && servers.length === 0 && (
          <p className="text-xs text-zinc-500 px-4 py-2">
            No servers configured.
          </p>
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
              className={`group flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-zinc-800 ${
                isActive ? 'bg-zinc-800' : ''
              }`}
              onClick={() => setActiveServer(srv.id)}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 truncate">{srv.name}</p>
                <p className="text-xs text-zinc-500 truncate">
                  {srv.host}:{srv.port}
                </p>
              </div>
              <div className="hidden group-hover:flex items-center gap-1">
                {status === 'connected' ? (
                  <button
                    title="Disconnect"
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                    onClick={e => {
                      e.stopPropagation();
                      disconnectServer(srv.id);
                    }}
                  >
                    <Unplug className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    title="Connect"
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-green-400"
                    onClick={e => {
                      e.stopPropagation();
                      connectServer(srv.id);
                    }}
                  >
                    <Plug className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  title="Remove"
                  className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400"
                  onClick={e => {
                    e.stopPropagation();
                    removeServer(srv.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Apps — shown when a connected server is active */}
      {activeServer && activeServer.state?.status === 'connected' && (
        <div className="border-t border-zinc-800 py-2">
          <p className="px-4 py-1 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold">
            Apps
          </p>
          {APPS.map(app => {
            const Icon = app.icon === 'LayoutDashboard' ? LayoutDashboard : FolderOpen;
            return (
              <button
                key={app.id}
                className="flex items-center gap-2 w-full px-4 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => openTab(app, activeServerId!)}
              >
                <Icon className="w-4 h-4" />
                <span>{app.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800">
        <button
          title="Add Server"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          onClick={() => {
            /* TODO: M2+ add server modal */
          }}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          title="Toggle Terminal"
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          onClick={toggleTerminal}
        >
          <Terminal className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
