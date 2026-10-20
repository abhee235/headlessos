// EX8.9: Task Manager — Startup apps. On a server these are the services that
// start at boot (systemd unit files or SysV start links) plus @reboot cron lines.
// Toggling one runs `systemctl enable|disable` / `update-rc.d`, after a confirm.
// @see docs/phases/phase-ex8.md

import { useState } from 'react';
import { Info, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchStartupItems, setStartupItem, type StartupItemData } from '../../lib/api';
import {
  EmptyRows, PageState, ProcessGlyph, ROW, StatRow, StatTile, TableCard,
  formatAgo, formatDay, formatMs, usePolled,
} from './kit';

const COLS = 'grid grid-cols-[minmax(240px,2fr)_minmax(120px,1fr)_110px_90px_64px] items-center gap-4 px-5';

const SOURCE_LABEL: Record<StartupItemData['source'], string> = {
  systemd: 'systemd unit',
  sysv: 'SysV init script',
  cron: 'cron @reboot',
};

const IMPACT: Record<NonNullable<StartupItemData['impact']>, { label: string; variant: 'destructive' | 'warning' | 'success' }> = {
  high: { label: 'High', variant: 'destructive' },
  medium: { label: 'Medium', variant: 'warning' },
  low: { label: 'Low', variant: 'success' },
};

export function StartupTab({ serverId }: { serverId: string }) {
  const { data, error, loading, reload } = usePolled(() => fetchStartupItems(serverId), 0, [serverId]);
  const [pending, setPending] = useState<StartupItemData | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!data) return <PageState loading={loading} error={error} onRetry={reload} label="Reading startup items…" />;

  const enabled = data.items.filter((i) => i.enabled).length;
  const high = data.items.filter((i) => i.enabled && i.impact === 'high').length;
  const boot = data.boot;
  const bootParts = boot && [
    boot.firmwareMs !== null && `Firmware ${formatMs(boot.firmwareMs)}`,
    boot.loaderMs !== null && `loader ${formatMs(boot.loaderMs)}`,
    boot.kernelMs !== null && `kernel ${formatMs(boot.kernelMs)}`,
    boot.userspaceMs !== null && `services ${formatMs(boot.userspaceMs)}`,
  ].filter(Boolean).join(' · ');
  // PID 1 isn't an init system: a container, where start links only run if the entrypoint runs them
  const container = data.init !== 'systemd' && !/^(init|systemd|upstart|openrc-init|runit|s6-svscan)$/.test(data.pid1);

  const toggle = async (item: StartupItemData) => {
    setBusyId(item.id);
    const action = item.enabled ? 'disable' : 'enable';
    try {
      const res = await setStartupItem(serverId, item.id, action);
      if (!res.success) throw new Error(res.error ?? `Could not ${action} ${item.name}`);
      toast.success(`${item.name} ${action}d at boot`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${action} ${item.name}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <StatRow>
        {boot ? (
          <StatTile label="Last boot time" value={formatMs(boot.totalMs)} caption={bootParts || 'From systemd-analyze'} />
        ) : (
          <StatTile label="Up since" value={formatDay(data.bootedAt)} caption={`Up ${formatAgo(data.bootedAt)} · PID 1: ${data.pid1}`} />
        )}
        <StatTile label="Enabled" value={`${enabled} of ${data.items.length}`} caption="Start at boot" />
        <StatTile
          label="High impact"
          value={boot ? String(high) : '—'}
          caption={boot ? 'Add the most boot time' : 'Needs systemd-analyze'}
        />
      </StatRow>

      {container && (
        <div className="lumen-card mb-3 flex shrink-0 items-start gap-2.5 rounded-[16px] px-4 py-3 text-[13px] text-label-2">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-text" strokeWidth={1.75} />
          <span>
            PID 1 is <span className="font-mono text-foreground">{data.pid1}</span>, so this looks like a container.
            {' '}These start links only run if its entrypoint starts them.
          </span>
        </div>
      )}

      <TableCard
        label="Startup apps"
        cols={COLS}
        header={
          <>
            <div role="columnheader">Name</div>
            <div role="columnheader">Source</div>
            <div role="columnheader">Impact</div>
            <div role="columnheader" className="text-right">Delay</div>
            <div role="columnheader" className="text-right">On</div>
          </>
        }
        footer={
          <span className="flex items-center justify-between gap-3">
            <span>Changes take effect at the next boot and need sudo on the server.</span>
            <Button variant="ghost" size="sm" onClick={() => void reload()}><RotateCw strokeWidth={1.75} />Refresh</Button>
          </span>
        }
      >
        {data.init === 'none' && data.items.length === 0 && (
          <EmptyRows>No init system found (no systemd and no /etc/init.d), and no @reboot cron entries.</EmptyRows>
        )}
        {data.init !== 'none' && data.items.length === 0 && <EmptyRows>Nothing is set to start at boot</EmptyRows>}
        {data.items.map((item) => (
          <div key={`${item.source}:${item.id}`} role="row" className={cn(COLS, ROW, 'h-[64px]', !item.enabled && 'opacity-70')}>
            <div role="cell" className="flex min-w-0 items-center gap-3">
              <ProcessGlyph name={item.id} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground" title={item.id}>{item.name}</div>
                {item.command && <div className="truncate font-mono text-[12px] text-label-3" title={item.command}>{item.command}</div>}
              </div>
            </div>
            <div role="cell" className="truncate text-label-2">{SOURCE_LABEL[item.source]}</div>
            <div role="cell">
              {!item.enabled
                ? <Badge variant="secondary">Disabled</Badge>
                : item.impact
                  ? <Badge variant={IMPACT[item.impact].variant}>{IMPACT[item.impact].label}</Badge>
                  : <span className="text-label-3">—</span>}
            </div>
            <div role="cell" className="text-right tabular-nums text-foreground">
              {item.enabled && item.delayMs !== null ? `+${formatMs(item.delayMs)}` : <span className="text-label-3">—</span>}
            </div>
            <div role="cell" className="flex justify-end">
              <Switch
                checked={item.enabled}
                disabled={!item.toggleable || busyId === item.id}
                onCheckedChange={() => setPending(item)}
                aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name} at boot`}
                title={item.toggleable ? undefined : 'Edit the crontab to change @reboot entries'}
              />
            </div>
          </div>
        ))}
      </TableCard>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.enabled ? `Don't start ${pending?.name} at boot?` : `Start ${pending?.name} at boot?`}
        description={
          pending?.enabled
            ? `${pending.id} will not start the next time the server boots. It keeps running now.`
            : `${pending?.id ?? ''} will start every time the server boots.`
        }
        confirmLabel={pending?.enabled ? 'Disable' : 'Enable'}
        variant={pending?.enabled ? 'destructive' : 'default'}
        onConfirm={() => { const p = pending; setPending(null); if (p) void toggle(p); }}
      />
    </div>
  );
}
