// M1.8: Terminal Panel — bottom toggle panel
// @see docs/phases/phase-1.md

import { useAppStore } from '../../store/app-store';
import { TerminalView } from '../Terminal/TerminalView';
import { ChevronDown } from 'lucide-react';

export function TerminalPanel() {
  const { terminalVisible, toggleTerminal, activeServerId, servers } =
    useAppStore();

  if (!terminalVisible) return null;

  const activeServer = servers.find(s => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

  return (
    <div className="flex flex-col h-64 border-t border-zinc-800 bg-zinc-950">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">
          Terminal
          {activeServer
            ? ` — ${activeServer.name}`
            : ''}
        </span>
        <button
          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
          onClick={toggleTerminal}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 min-h-0">
        {activeServerId && isConnected ? (
          <TerminalView serverId={activeServerId} />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            {activeServerId
              ? 'Connect to the server to open a terminal.'
              : 'Select and connect a server first.'}
          </div>
        )}
      </div>
    </div>
  );
}
