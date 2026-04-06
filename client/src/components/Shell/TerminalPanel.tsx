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
    <div className="flex flex-col h-64 border-t border-border bg-background">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-chrome border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          Terminal
          {activeServer
            ? ` — ${activeServer.name}`
            : ''}
        </span>
        <button
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
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
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {activeServerId
              ? 'Connect to the server to open a terminal.'
              : 'Select and connect a server first.'}
          </div>
        )}
      </div>
    </div>
  );
}
