// M3.6: Services Manager — systemd service management with status/logs viewer
// @see docs/phases/phase-3.md

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  Server, Play, Square, RotateCcw, Power, PowerOff, RefreshCw, AlertCircle, FileText, Search, X, Circle, CheckCircle2, XCircle } from 'lucide-react';
import type { ServiceData, ServicesResponse } from '../../lib/api';
import {
  fetchServices,
  serviceAction,
  fetchServiceLogs,
  fetchServiceStatus,
} from '../../lib/api';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from 'sonner';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';

// ─── State indicator ─────────────────────────────────────────────────────────

function ActiveStateIcon({ state }: { state: string }) {
  switch (state) {
    case 'active':
      return <CheckCircle2 size={13} className="text-success" />;
    case 'failed':
      return <XCircle size={13} className="text-destructive" />;
    case 'activating':
    case 'deactivating':
      return <Spinner size={13} className="text-warning" />;
    default:
      return <Circle size={13} className="text-muted-foreground" />;
  }
}

function ActiveStateBadge({ state }: { state: string }) {
  const variant =
    state === 'active'
      ? 'success'
      : state === 'failed'
        ? 'destructive'
        : state === 'activating' || state === 'deactivating'
          ? 'warning'
          : 'secondary';

  return (
    <Badge variant={variant as 'success' | 'destructive' | 'warning' | 'secondary'} className="text-[10px] px-1.5 py-0">
      {state}
    </Badge>
  );
}

// ─── Detail Panel (Status / Logs) ────────────────────────────────────────────

function DetailPanel({
  serverId,
  serviceName,
  mode,
  onClose,
}: {
  serverId: string;
  serviceName: string;
  mode: 'status' | 'logs';
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    try {
      const res = mode === 'status'
        ? await fetchServiceStatus(serverId, serviceName)
        : await fetchServiceLogs(serverId, serviceName, 150);
      if (res.success && res.data) {
        setContent(res.data);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [serverId, serviceName, mode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="flex flex-col h-full border-t border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-sidebar border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText size={12} />
          <span>
            {mode === 'status' ? 'Status' : 'Logs'}:{' '}
            <span className="text-foreground font-medium">{serviceName}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <pre
        ref={contentRef}
        className="flex-1 overflow-auto p-2 text-[11px] font-mono leading-relaxed text-foreground bg-background whitespace-pre-wrap"
      >
        {loading ? 'Loading…' : content || 'No data available'}
      </pre>
    </div>
  );
}

// ─── Service List ────────────────────────────────────────────────────────────

interface ServicesViewProps {
  serverId: string;
}

export function ServicesView({ serverId }: ServicesViewProps) {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [systemdAvailable, setSystemdAvailable] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'active' | 'inactive' | 'failed'>('all');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Detail panel state
  const [detailTarget, setDetailTarget] = useState<{
    name: string;
    mode: 'status' | 'logs';
  } | null>(null);

  const pauseRefreshRef = useRef(false);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res: ServicesResponse = await fetchServices(serverId);
        if (res.success) {
          setServices(res.data ?? []);
          if (res.systemdAvailable !== undefined) {
            setSystemdAvailable(res.systemdAvailable);
          }
        } else {
          setError(res.error ?? 'Failed to fetch services');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch services');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serverId],
  );

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh based on preference (minimum 10s for Services)
  const autoRefreshInterval = usePreferencesStore(s => s.autoRefreshInterval);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const ms = Math.max(autoRefreshInterval * 1000, 10_000);
    const interval = setInterval(() => {
      if (!pauseRefreshRef.current) loadData(true);
    }, ms);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  const handleAction = async (
    serviceName: string,
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable',
  ) => {
    setActionBusy(serviceName);
    try {
      const res = await serviceAction(serverId, serviceName, action);
      if (res.success) {
        toast.success(`Service ${serviceName} ${action}ed`);
        loadData(true);
      } else {
        toast.error(res.error ?? `Failed to ${action} ${serviceName}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionBusy(null);
    }
  };

  // Filter services
  const filtered = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesState =
      filterState === 'all' || s.activeState === filterState;
    return matchesSearch && matchesState;
  });

  // State counts
  const counts = {
    all: services.length,
    active: services.filter((s) => s.activeState === 'active').length,
    inactive: services.filter((s) => s.activeState === 'inactive').length,
    failed: services.filter((s) => s.activeState === 'failed').length,
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="h-full bg-background">
        <LoadingView label="Loading services…" />
      </div>
    );
  }

  // ── systemd not available ──
  if (!systemdAvailable) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground mb-1">systemd not available</p>
          <p className="text-xs text-muted-foreground/60">
            This server may not use systemd as its init system
          </p>
        </div>
      </div>
    );
  }

  // ── Disconnected state ──
  const isDisconnected = error && /not connected/i.test(error);
  if (isDisconnected) {
    return (
      <DisconnectedState
        serverId={serverId}
        onReconnected={() => loadData()}
        message="The SSH connection to this server was lost. Reconnect to manage services."
      />
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive mb-3">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 text-xs bg-secondary hover:bg-accent text-foreground rounded-md"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">
            Services ({services.length})
          </span>
          {refreshing && <Spinner size={12} className="text-muted-foreground" />}

          {/* State filter pills */}
          <div className="flex items-center gap-1">
            {(['all', 'active', 'inactive', 'failed'] as const).map((state) => (
              <button
                key={state}
                onClick={() => setFilterState(state)}
                className={`
                  px-2 py-0.5 text-[10px] rounded-full transition-colors
                  ${
                    filterState === state
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent'
                  }
                `}
              >
                {state} ({counts[state]})
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-6 pr-2 py-1 text-xs bg-secondary border border-border rounded-md w-44 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className={detailTarget ? 'flex-1 min-h-0 overflow-auto' : 'flex-1 overflow-auto'}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-sidebar z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-medium w-6"></th>
                <th className="px-3 py-1.5 font-medium">Service</th>
                <th className="px-3 py-1.5 font-medium">State</th>
                <th className="px-3 py-1.5 font-medium">Sub-state</th>
                <th className="px-3 py-1.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((svc) => (
                <ContextMenu key={svc.name} onOpenChange={(open) => { pauseRefreshRef.current = open; }}>
                  <ContextMenuTrigger asChild>
                    <tr
                      className={`
                        border-b border-border/50 hover:bg-accent/50 cursor-default
                        ${actionBusy === svc.name ? 'opacity-50' : ''}
                      `}
                    >
                      <td className="px-3 py-1.5">
                        <ActiveStateIcon state={svc.activeState} />
                      </td>
                      <td className="px-3 py-1.5 font-medium text-foreground max-w-[200px] truncate">
                        {svc.name}
                      </td>
                      <td className="px-3 py-1.5">
                        <ActiveStateBadge state={svc.activeState} />
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {svc.subState}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[300px] truncate">
                        {svc.description}
                      </td>
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-52">
                    {svc.activeState === 'active' ? (
                      <>
                        <ContextMenuItem onClick={() => handleAction(svc.name, 'stop')}>
                          <Square className="w-4 h-4 mr-2 opacity-60" />
                          Stop
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleAction(svc.name, 'restart')}>
                          <RotateCcw className="w-4 h-4 mr-2 opacity-60" />
                          Restart
                        </ContextMenuItem>
                      </>
                    ) : (
                      <ContextMenuItem onClick={() => handleAction(svc.name, 'start')}>
                        <Play className="w-4 h-4 mr-2 opacity-60" />
                        Start
                      </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleAction(svc.name, 'enable')}>
                      <Power className="w-4 h-4 mr-2 opacity-60" />
                      Enable
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAction(svc.name, 'disable')}>
                      <PowerOff className="w-4 h-4 mr-2 opacity-60" />
                      Disable
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setDetailTarget({ name: svc.name, mode: 'status' })}>
                      <AlertCircle className="w-4 h-4 mr-2 opacity-60" />
                      View Status
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => setDetailTarget({ name: svc.name, mode: 'logs' })}>
                      <FileText className="w-4 h-4 mr-2 opacity-60" />
                      View Logs
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    {search || filterState !== 'all' ? 'No services match filter' : 'No services found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {detailTarget && (
          <div className="h-[35%] min-h-[130px] shrink-0">
            <DetailPanel
              serverId={serverId}
              serviceName={detailTarget.name}
              mode={detailTarget.mode}
              onClose={() => setDetailTarget(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
