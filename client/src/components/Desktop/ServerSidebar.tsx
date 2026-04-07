// M10.2: Server Sidebar — quick-switch between multiple servers
// @see docs/PROGRESS.md

import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import {
  Server,
  Plus,
  Wifi,
  WifiOff,
  Loader2,
  X,
  Power,
  PowerOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ServerSidebar() {
  const servers = useAppStore(s => s.servers);
  const activeServerId = useAppStore(s => s.activeServerId);
  const setActiveServer = useAppStore(s => s.setActiveServer);
  const connectServer = useAppStore(s => s.connectServer);
  const disconnectServer = useAppStore(s => s.disconnectServer);
  const removeServer = useAppStore(s => s.removeServer);
  const openWindow = useDesktopStore(s => s.openWindow);

  if (servers.length <= 1) return null;

  return (
    <div className="fixed left-0 top-0 bottom-[52px] z-[9990] w-14 flex flex-col items-center py-2 gap-1.5 bg-background/60 backdrop-blur-xl border-r border-border/20">
      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col items-center gap-1.5 px-1.5 py-1">
          {servers.map(srv => {
            const isActive = srv.id === activeServerId;
            const status = srv.state?.status;
            const isConnected = status === 'connected';
            const isConnecting = status === 'connecting';

            return (
              <ContextMenu key={srv.id}>
                <ContextMenuTrigger asChild>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 ${
                          isActive
                            ? 'bg-primary/15 ring-2 ring-primary/30 shadow-sm'
                            : 'hover:bg-foreground/5'
                        } ${!isConnected && !isConnecting ? 'opacity-50' : ''}`}
                        onClick={() => {
                          setActiveServer(srv.id);
                          if (!isConnected && !isConnecting) {
                            connectServer(srv.id);
                          }
                        }}
                      >
                        {/* Status indicator */}
                        <span
                          className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full border border-background ${
                            isConnected
                              ? 'bg-success'
                              : isConnecting
                                ? 'bg-warning animate-pulse'
                                : 'bg-muted-foreground/30'
                          }`}
                        />
                        {/* Server initial */}
                        <span className={`text-sm font-bold ${isActive ? 'text-primary' : 'text-foreground/60'}`}>
                          {srv.name.charAt(0).toUpperCase()}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      <div className="text-xs">
                        <div className="font-semibold">{srv.name}</div>
                        <div className="text-muted-foreground">
                          {srv.host}:{srv.port} · {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem disabled className="text-xs font-medium pointer-events-none">
                    <Server className="w-4 h-4 mr-2 opacity-50" />
                    {srv.name}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  {isConnected ? (
                    <ContextMenuItem onClick={() => disconnectServer(srv.id)}>
                      <PowerOff className="w-4 h-4 mr-2 opacity-50" />
                      Disconnect
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem onClick={() => connectServer(srv.id)}>
                      <Power className="w-4 h-4 mr-2 opacity-50" />
                      Connect
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    danger
                    onClick={() => removeServer(srv.id)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove Server
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </ScrollArea>

      {/* Add server button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-foreground/5 transition-colors border border-dashed border-foreground/10 hover:border-foreground/20"
            onClick={() => {
              // Open settings to add a new server
              if (activeServerId) {
                openWindow('settings', activeServerId, 'Settings', 'settings');
              }
            }}
          >
            <Plus className="w-4 h-4 text-foreground/40" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Add Server
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
