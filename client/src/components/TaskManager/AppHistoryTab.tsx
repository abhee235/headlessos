// EX8.9: Task Manager — App history. Linux keeps no history of exited programs,
// so this is per-command totals for the processes running now, since boot:
// CPU time, memory, disk I/O and instance count.
// @see docs/phases/phase-ex8.md

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { fetchAppHistory, type AppUsageData } from '../../lib/api';
import { Meter, SERIES } from './parts';
import { formatKb } from './ProcessDetailCard';
import {
  EmptyRows, PageState, ProcessGlyph, ROW, StatRow, StatTile, TableCard,
  formatAgo, formatBytesShort, formatCpuTime, formatDay, usePolled,
} from './kit';

type SortKey = 'name' | 'cpu' | 'memory' | 'disk' | 'instances';

const COLS = 'grid grid-cols-[minmax(180px,1.6fr)_minmax(150px,1.2fr)_minmax(150px,1.2fr)_minmax(150px,1.2fr)_90px] items-center gap-4 px-5';

const diskOf = (a: AppUsageData) => (a.readBytes ?? 0) + (a.writeBytes ?? 0);

export function AppHistoryTab({ serverId }: { serverId: string }) {
  const { data, error, loading, reload } = usePolled(() => fetchAppHistory(serverId), 10_000, [serverId]);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'cpu', asc: false });

  const apps = useMemo(() => {
    const list = [...(data?.apps ?? [])];
    const val = (a: AppUsageData): number | string => {
      switch (sort.key) {
        case 'name': return a.name.toLowerCase();
        case 'cpu': return a.cpuSeconds;
        case 'memory': return a.rssKb;
        case 'disk': return diskOf(a);
        case 'instances': return a.instances;
      }
    };
    list.sort((x, y) => {
      const a = val(x), b = val(y);
      const cmp = typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number);
      return sort.asc ? cmp : -cmp;
    });
    return list;
  }, [data, sort]);

  if (!data) return <PageState loading={loading} error={error} onRetry={reload} label="Reading process totals…" />;

  const totalCpu = data.apps.reduce((s, a) => s + a.cpuSeconds, 0);
  const totalRss = data.apps.reduce((s, a) => s + a.rssKb, 0);
  const totalDisk = data.apps.reduce((s, a) => s + diskOf(a), 0);
  const maxCpu = Math.max(1, ...data.apps.map((a) => a.cpuSeconds));
  const maxRss = Math.max(1, ...data.apps.map((a) => a.rssKb));
  const maxDisk = Math.max(1, ...data.apps.map(diskOf));
  const top = [...data.apps].sort((a, b) => b.cpuSeconds - a.cpuSeconds)[0];

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key;
    const Arrow = sort.asc ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        role="columnheader"
        aria-sort={active ? (sort.asc ? 'ascending' : 'descending') : 'none'}
        onClick={() => setSort(active ? { key, asc: !sort.asc } : { key, asc: key === 'name' })}
        className={cn('flex items-center gap-1 uppercase tracking-[.06em] hover:text-foreground', align === 'right' && 'justify-end', active && 'text-foreground')}
      >
        {label}
        {active && <Arrow className="size-3" strokeWidth={2} />}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <StatRow>
        <StatTile label="Tracking since" value={formatDay(data.since)} caption={`Boot · up ${formatAgo(data.since)}`} />
        <StatTile label="CPU time" value={formatCpuTime(totalCpu)} caption={`Across ${data.apps.length} apps`} />
        <StatTile
          label="Disk I/O"
          value={formatBytesShort(totalDisk)}
          caption={data.ioReadable ? 'Read and written' : 'Your processes only'}
          title={data.ioReadable ? undefined : "Other users' I/O counters need root to read"}
        />
        <StatTile label="Memory" value={formatKb(totalRss)} caption={top ? `Most CPU: ${top.name}` : 'Resident, all apps'} />
      </StatRow>

      <TableCard
        label="Resource use by app"
        title="Resource use by app"
        cols={COLS}
        minWidth="min-w-[820px]"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            <RotateCw strokeWidth={1.75} />
            Refresh
          </Button>
        }
        header={
          <>
            {header('name', 'App')}
            {header('cpu', 'CPU time')}
            {header('memory', 'Memory')}
            {header('disk', 'Disk')}
            {header('instances', 'Running', 'right')}
          </>
        }
        footer="Totals for programs running now, since they started. Linux keeps no record of programs that have exited, and per-app network use needs root tools, so neither is shown."
      >
        {apps.length === 0 && <EmptyRows>No processes reported</EmptyRows>}
        {apps.map((a) => {
          const disk = a.readBytes === null && a.writeBytes === null ? null : diskOf(a);
          return (
            <div key={a.name} role="row" className={cn(COLS, ROW, 'h-[60px]')}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <ProcessGlyph name={a.name} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{a.name}</div>
                  <div className="truncate text-[12px] text-label-3">{a.users.join(', ')}</div>
                </div>
              </div>
              <BarCell value={a.cpuSeconds} max={maxCpu} fill={SERIES.cpu.bg} label={formatCpuTime(a.cpuSeconds)} />
              <BarCell value={a.rssKb} max={maxRss} fill={SERIES.memory.bg} label={formatKb(a.rssKb)} />
              {disk === null
                ? <div role="cell" className="text-label-3" title="Needs root to read this process's I/O counters">—</div>
                : <BarCell value={disk} max={maxDisk} fill={SERIES.disk.bg} label={formatBytesShort(disk)} />}
              <div role="cell" className="text-right tabular-nums text-foreground">{a.instances}</div>
            </div>
          );
        })}
      </TableCard>
    </div>
  );
}

function BarCell({ value, max, fill, label }: { value: number; max: number; fill: string; label: string }) {
  return (
    <div role="cell" className="flex items-center gap-3">
      <Meter value={(value / max) * 100} fillClassName={fill} className="flex-1" />
      <span className="w-[68px] shrink-0 text-right tabular-nums text-foreground">{label}</span>
    </div>
  );
}
