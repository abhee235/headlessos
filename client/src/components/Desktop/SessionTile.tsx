// EX6-B.2 + B.3: SessionTile — one tile in the session switcher bar
// @see docs/phases/phase-ex6.md

import { useMemo } from 'react';
import { Server, Loader2, Moon, AlertCircle, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useSessionsStore } from '../../store/sessions-store';
import { useAppStore } from '../../store/app-store';
import { exportSession } from '../../lib/session-io';
import { saveSession, fetchSession } from '../../lib/api';
import type { ServerWithState } from '../../lib/api';
import { ACCENT_PRESETS } from '../../store/preferences-store';

interface SessionTileProps {
  server: ServerWithState;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Returns a label + dot-color class for the connection status.
 */
function statusFor(server: ServerWithState, lifecycle: string | null) {
  if (lifecycle === 'hibernated') {
    return { label: 'Hibernated', dot: 'bg-muted-foreground', icon: Moon };
  }
  const s = server.state?.status;
  if (s === 'connected') return { label: 'Connected', dot: 'bg-green-500', icon: null };
  if (s === 'connecting') return { label: 'Connecting…', dot: 'bg-amber-500 animate-pulse', icon: Loader2 };
  if (s === 'error') return { label: 'Failed', dot: 'bg-red-500', icon: AlertCircle };
  return { label: 'Disconnected', dot: 'bg-muted-foreground', icon: null };
}

export function SessionTile({ server, isActive, onClick }: SessionTileProps) {
  const summary = useSessionsStore((s) =>
    s.summaries.find((x) => x.serverId === server.id),
  );
  const session = useSessionsStore((s) => s.sessions[server.id]);

  const accentIdx = useMemo(() => {
    // Pick a stable accent based on serverId hash (until per-session accent UI lands)
    const hash = Array.from(server.id).reduce((a, c) => a + c.charCodeAt(0), 0);
    return hash % ACCENT_PRESETS.length;
  }, [server.id]);
  const accent = ACCENT_PRESETS[accentIdx]!;

  const status = statusFor(server, summary?.lifecycle ?? session?.lifecycle ?? null);
  const StatusIcon = status.icon;
  const windowCount = session?.windows.length ?? summary?.windowCount ?? 0;

  const hibernate = useSessionsStore((s) => s.hibernate);
  const terminate = useSessionsStore((s) => s.terminate);
  const inMemorySession = useSessionsStore((s) => s.sessions[server.id]);
  // EX6-D.1: lock-on-hibernate state. In-memory if loaded, else summary.
  const summaryLocked = summary?.lockOnHibernate ?? false;
  const isLocked = inMemorySession?.lockOnHibernate ?? summaryLocked;

  async function toggleLock() {
    // Update in-memory if loaded
    if (inMemorySession) {
      useSessionsStore.getState().updateSession(server.id, {
        lockOnHibernate: !inMemorySession.lockOnHibernate,
      });
      return;
    }
    // Otherwise patch the cold-tier file directly so the summary reflects it
    const cold = await fetchSession(server.id);
    if (!cold) return;
    await saveSession({ ...cold, lockOnHibernate: !cold.lockOnHibernate });
    await useSessionsStore.getState().loadAll();
  }
  const disconnectServer = useAppStore((s) => s.disconnectServer);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group relative flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-xs transition-all',
            'min-w-40 max-w-50 hover:bg-accent/40',
            isActive
              ? 'border-primary bg-accent/60 shadow-sm'
              : 'border-border bg-background/60 backdrop-blur-sm',
          )}
          style={isActive ? { borderColor: accent.oklchDark } : undefined}
          aria-pressed={isActive}
          data-testid={`session-tile-${server.id}`}
        >
          {/* Top row: accent chip + name + status dot */}
          <div className="flex w-full items-center gap-2">
            <span
              className="h-3 w-3 flex-none rounded-full"
              style={{ backgroundColor: accent.oklchDark }}
              aria-hidden="true"
            />
            <Server className="h-3.5 w-3.5 flex-none text-muted-foreground" aria-hidden="true" />
            <span className="flex-1 truncate font-medium">{server.name}</span>
            <span
              className={cn('h-2 w-2 flex-none rounded-full', status.dot)}
              aria-label={status.label}
              title={status.label}
            />
          </div>

          {/* Bottom row: status text + window count */}
          <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {StatusIcon && <StatusIcon className="h-3 w-3" />}
              {status.label}
            </span>
            {windowCount > 0 && (
              <span aria-label={`${windowCount} open windows`}>
                {windowCount} window{windowCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* Hover affordance — context-menu hint */}
          <MoreVertical
            className="absolute right-1 top-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50"
            aria-hidden="true"
          />
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onClick}>Activate</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => void hibernate(server.id)}
          disabled={summary?.lifecycle === 'hibernated'}
        >
          Hibernate
          <span className="ml-auto text-[10px] text-muted-foreground">⌘⇧H</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            void disconnectServer(server.id);
          }}
          disabled={server.state?.status !== 'connected'}
        >
          Disconnect
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => void exportSession(server.id)}
        >
          Export Session…
        </ContextMenuItem>
        <ContextMenuItem onClick={() => void toggleLock()}>
          {isLocked ? '✓ Locked (require confirm to wake)' : 'Lock on hibernate'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          danger
          onClick={() => {
            if (confirm(`Permanently terminate session for "${server.name}"?\n\nThis deletes the saved desktop layout and agent history. The server config is kept.`)) {
              void terminate(server.id);
            }
          }}
        >
          Terminate Session…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
