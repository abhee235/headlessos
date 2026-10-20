// EX8.9: Task Manager — Services (systemd, or SysV on hosts without systemd).
// Search + All / Running / Stopped; Start and Stop are confirmed, and stopping
// ssh warns that it can cut the connection HeadlessOS is using.
// @see docs/phases/phase-ex8.md

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchServices, serviceAction, type ServiceData, type ServicesResponse } from '../../lib/api';
import { EmptyRows, PageState, ROW, TableCard, usePolled } from './kit';
import { SEGMENT_WELL, segmentItemClass } from '@/components/ui/segmented';

type Filter = 'all' | 'running' | 'stopped';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'stopped', label: 'Stopped' },
];

const COLS = 'grid grid-cols-[minmax(240px,2.4fr)_80px_120px_110px_96px] items-center gap-4 px-5';

type Status = { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' };

export function serviceStatus(s: ServiceData): Status {
  if (s.activeState === 'failed') return { label: 'Failed', variant: 'destructive' };
  if (s.activeState === 'active') return s.subState === 'running' || !s.subState
    ? { label: 'Running', variant: 'success' }
    : { label: 'Active', variant: 'success' };
  if (s.activeState === 'activating') return { label: 'Starting', variant: 'warning' };
  if (s.activeState === 'deactivating') return { label: 'Stopping', variant: 'warning' };
  if (s.startup === 'disabled' || s.loadState === 'masked') return { label: 'Disabled', variant: 'secondary' };
  return { label: 'Stopped', variant: 'warning' };
}

const isUp = (s: ServiceData) => s.activeState === 'active' || s.activeState === 'activating';

const STARTUP_LABEL = { automatic: 'Automatic', manual: 'Manual', disabled: 'Disabled' } as const;

/** Services whose stop would cut HeadlessOS's own SSH connection */
const SSH_UNITS = new Set(['ssh', 'sshd', 'openssh', 'openssh-server', 'dropbear']);

export function ServicesTab({ serverId }: { serverId: string }) {
  const { data, error, loading, reload } = usePolled<ServicesResponse>(
    async () => {
      const r = await fetchServices(serverId);
      // usePolled wants { data }; keep the whole response so `init` survives
      return { success: r.success, error: r.error, data: r };
    },
    10_000,
    [serverId],
  );
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<{ svc: ServiceData; action: 'start' | 'stop' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const services = data?.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services
      .filter((s) => filter === 'all' || (filter === 'running' ? isUp(s) : !isUp(s)))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      // running first, then by name — the prototype's order
      .sort((a, b) => Number(isUp(b)) - Number(isUp(a)) || a.name.localeCompare(b.name));
  }, [services, search, filter]);

  if (!data) return <PageState loading={loading} error={error} onRetry={reload} label="Reading services…" />;

  const running = services.filter(isUp).length;
  const noManager = data.init === 'none' || (data.systemdAvailable === false && data.init !== 'sysv' && services.length === 0);

  const run = async (svc: ServiceData, action: 'start' | 'stop') => {
    setBusy(svc.name);
    try {
      const res = await serviceAction(serverId, svc.name, action);
      if (!res.success) throw new Error(res.error ?? `Could not ${action} ${svc.name}`);
      toast.success(`${svc.name} ${action === 'start' ? 'started' : 'stopped'}`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${action} ${svc.name}`);
    } finally {
      setBusy(null);
    }
  };

  const sshStop = pending?.action === 'stop' && SSH_UNITS.has(pending.svc.name);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={17} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services"
            className="h-[38px] pl-10 pr-44"
            aria-label="Search services"
          />
          <div className="absolute right-3.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="flex h-5 w-5 items-center justify-center rounded-full text-label-3 transition-colors duration-150 hover:bg-fill hover:text-foreground"
              >
                <X size={13} strokeWidth={2} />
              </button>
            )}
            <span className="text-[12px] font-medium tabular-nums text-label-2">
              {running} running · {services.length} total
            </span>
          </div>
        </div>
        <div className={SEGMENT_WELL} role="radiogroup" aria-label="Filter services">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={segmentItemClass(filter === f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <TableCard
        label="Services"
        cols={COLS}
        header={
          <>
            <div role="columnheader">Service</div>
            <div role="columnheader">PID</div>
            <div role="columnheader">Status</div>
            <div role="columnheader">Startup</div>
            <div role="columnheader" className="text-right">Action</div>
          </>
        }
        footer={data.init === 'sysv'
          ? <>No systemd on this host: these are SysV init scripts (<span className="font-mono">service --status-all</span>).</>
          : undefined}
      >
        {noManager && <EmptyRows>No service manager found on this host (no systemd and no /etc/init.d).</EmptyRows>}
        {!noManager && filtered.length === 0 && <EmptyRows>No matching services</EmptyRows>}
        {filtered.map((s) => {
          const st = serviceStatus(s);
          const up = isUp(s);
          return (
            <div key={s.name} role="row" className={cn(COLS, ROW, 'h-[60px]')}>
              <div role="cell" className="min-w-0">
                <div className="truncate font-mono text-[14px] font-bold text-foreground">{s.name}</div>
                {s.description && <div className="truncate text-[12px] text-label-2" title={s.description}>{s.description}</div>}
              </div>
              <div role="cell" className="font-mono text-[12px] tabular-nums text-label-2">{s.pid ?? '—'}</div>
              <div role="cell"><Badge variant={st.variant}>{st.label}</Badge></div>
              <div role="cell" className="text-label-2">{s.startup ? STARTUP_LABEL[s.startup] : '—'}</div>
              <div role="cell" className="flex justify-end">
                {up ? (
                  <Button size="sm" variant="destructive" disabled={busy === s.name} onClick={() => setPending({ svc: s, action: 'stop' })}>
                    Stop
                  </Button>
                ) : (
                  <Button size="sm" disabled={busy === s.name || s.loadState === 'masked'} onClick={() => setPending({ svc: s, action: 'start' })}>
                    Start
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </TableCard>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending ? `${pending.action === 'stop' ? 'Stop' : 'Start'} ${pending.svc.name}?` : ''}
        description={
          sshStop
            ? 'This is the SSH server. Stopping it can drop the connection HeadlessOS uses, and you may not be able to reconnect until it is started on the server itself.'
            : pending?.action === 'stop'
              ? `Runs "sudo ${data.init === 'sysv' ? 'service' : 'systemctl'} stop" on the server. Anything that depends on ${pending?.svc.name ?? 'it'} may stop working.`
              : `Runs "sudo ${data.init === 'sysv' ? 'service' : 'systemctl'} start" on the server.`
        }
        confirmLabel={pending?.action === 'stop' ? 'Stop' : 'Start'}
        variant={pending?.action === 'stop' ? 'destructive' : 'default'}
        onConfirm={() => { const p = pending; setPending(null); if (p) void run(p.svc, p.action); }}
      />
    </div>
  );
}
