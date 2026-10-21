// M3.6: Services Manager — systemd service management with status/logs viewer
// EX8.6: LumenOS v3 — lit segmented state filter, pill search, glass table card, paper detail pane.
// @see docs/phases/phase-3.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  Server, Play, Square, RotateCcw, Power, PowerOff, AlertCircle, FileText, X, Circle, CheckCircle2, XCircle } from 'lucide-react';
import type { ServiceData, ServicesResponse } from '../../lib/api';
import {
  fetchServices,
  serviceAction,
  fetchServiceLogs,
  fetchServiceStatus,
} from '../../lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import {
  SegmentButtons, SearchField, TableCard, CountChip, RoundIconButton, EmptyState,
} from '@/components/ServerAdmin/admin-ui';

// ─── State indicator ─────────────────────────────────────────────────────────

function ActiveStateIcon({ state }: { state: string }) {
  switch (state) {
    case 'active':
      return <CheckCircle2 size={15} strokeWidth={1.75} className="text-success" />;
    case 'failed':
      return <XCircle size={15} strokeWidth={1.75} className="text-destructive" />;
    case 'activating':
    case 'deactivating':
      return <Spinner size={16} className="text-warning" />;
    default:
      return <Circle size={15} strokeWidth={1.75} className="text-label-3" />;
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
    <Badge variant={variant as 'success' | 'destructive' | 'warning' | 'secondary'}>
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
    <TableCard className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-label-2">
          <FileText size={15} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">
            {mode === 'status' ? 'Status' : 'Logs'}:{' '}
            <span className="font-semibold text-foreground">{serviceName}</span>
          </span>
        </div>
        <RoundIconButton onClick={onClose} className="h-7 w-7" aria-label="Close">
          <X strokeWidth={1.75} />
        </RoundIconButton>
      </div>
      <pre
        ref={contentRef}
        className="flex-1 overflow-auto whitespace-pre-wrap bg-paper px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground"
      >
        {loading ? 'Loading…' : content || 'No data available'}
      </pre>
    </TableCard>
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
      <div className="h-full">
        <LoadingView label="Loading services…" />
      </div>
    );
  }

  // ── systemd not available ──
  if (!systemdAvailable) {
    return (
      <div className="flex h-full items-center justify-center px-4 pb-4">
        <EmptyState
          icon={Server}
          title="systemd not available"
          description="This server may not use systemd as its init system"
          className="w-full max-w-lg"
        />
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
      <div className="flex h-full items-center justify-center px-4 pb-4">
        <EmptyState
          icon={AlertCircle}
          title={<span className="text-danger">{error}</span>}
          className="w-full max-w-lg"
          action={
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-foreground">Services</span>
            <CountChip>{services.length}</CountChip>
          </div>
          {refreshing && <Spinner size={16} className="text-label-3" />}

          {/* State filter pills */}
          <SegmentButtons
            value={filterState}
            onChange={setFilterState}
            items={(['all', 'active', 'inactive', 'failed'] as const).map((state) => ({
              value: state,
              label: state.charAt(0).toUpperCase() + state.slice(1),
              count: counts[state],
            }))}
          />
        </div>

        <SearchField
          placeholder="Filter…"
          value={search}
          onValueChange={setSearch}
        />
      </div>

      {/* Content area */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <TableCard className="min-h-0 overflow-auto">
          <table className="w-full text-[14px]">
            <thead className="sticky top-0 z-10 bg-mat backdrop-blur-xl">
              <tr className="border-b border-border text-left text-[13px] text-label-2">
                <th className="h-11 w-10 pl-5 pr-1 font-semibold"></th>
                <th className="h-11 w-[30%] px-3 font-semibold">Service</th>
                <th className="h-11 w-36 px-3 font-semibold">State</th>
                <th className="h-11 w-36 px-3 font-semibold">Sub-state</th>
                <th className="h-11 px-3 pr-5 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((svc) => (
                <ContextMenu key={svc.name} onOpenChange={(open) => { pauseRefreshRef.current = open; }}>
                  <ContextMenuTrigger asChild>
                    <tr
                      className={cn(
                        'h-12 cursor-default border-b border-border transition-colors duration-150 last:border-0 hover:bg-fill data-[state=open]:bg-accent-soft',
                        actionBusy === svc.name && 'opacity-50',
                      )}
                    >
                      <td className="pl-5 pr-1">
                        <ActiveStateIcon state={svc.activeState} />
                      </td>
                      <td className="px-3 font-semibold text-foreground">
                        <div className="max-w-[240px] truncate">{svc.name}</div>
                      </td>
                      <td className="px-3">
                        <ActiveStateBadge state={svc.activeState} />
                      </td>
                      <td className="px-3 text-label-2">
                        {svc.subState}
                      </td>
                      <td className="px-3 pr-5 text-label-2">
                        <div className="max-w-[420px] truncate">{svc.description}</div>
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
                  <td colSpan={5} className="px-3 py-12 text-center text-[13px] text-label-3">
                    {search || filterState !== 'all' ? 'No services match filter' : 'No services found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableCard>

        {/* Detail panel */}
        {detailTarget && (
          <div className="mt-auto h-[35%] min-h-[130px] shrink-0">
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
