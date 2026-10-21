// M7.1: Performance Tab — real-time performance charts
// CPU, Memory, Network, Disk panels with area charts
// EX8.6: LumenOS v3 restyle — metric cards on the left (selected one tinted with the
// accent), a big chart card, stat tiles and a Cores card with load-coloured bars.
// @see docs/phases/phase-7.md, docs/phases/phase-ex8.md

import { useState, type ReactNode } from 'react';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Cpu, MemoryStick, Network, HardDrive, type LucideIcon } from 'lucide-react';
import type { CpuStatsData, NetworkIoEntry, DiskIoEntry } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  Meter,
  SERIES,
  Sparkline,
  chartTick,
  chartTooltipStyle,
  formatBytes,
  formatBytesPerSec,
  formatMb,
} from './parts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PerformanceTabProps {
  cpu: CpuStatsData;
  memory: {
    totalMb: number;
    usedMb: number;
    freeMb: number;
    availableMb: number;
    swapTotalMb: number;
    swapUsedMb: number;
  };
  networkIo: NetworkIoEntry[];
  diskIo: DiskIoEntry[];
  cpuHistory: Array<Record<string, number>>;
  memHistory: Array<{ time: number; value: number }>;
  netHistory: Array<{ time: number; rx: number; tx: number }>;
  diskHistory: Array<{ time: number; read: number; write: number }>;
}

type PanelId = 'cpu' | 'memory' | 'network' | 'disk';

interface PanelConfig {
  id: PanelId;
  label: string;
  icon: LucideIcon;
  color: string;
}

const PANELS: PanelConfig[] = [
  { id: 'cpu', label: 'Processor', icon: Cpu, color: SERIES.cpu.color },
  { id: 'memory', label: 'Memory', icon: MemoryStick, color: SERIES.memory.color },
  { id: 'disk', label: 'Disk', icon: HardDrive, color: SERIES.disk.color },
  { id: 'network', label: 'Network', icon: Network, color: SERIES.network.color },
];

// Two-series charts: [series colour for recharts, matching Tailwind class for legends]
const DISK_READ = { color: 'var(--viz-green)', bg: 'bg-viz-green' };
const DISK_WRITE = { color: 'var(--viz-blue)', bg: 'bg-viz-blue' };
const NET_RX = { color: 'var(--viz-green)', bg: 'bg-viz-green' };
const NET_TX = { color: 'var(--viz-blue)', bg: 'bg-viz-blue' };

// ─── Full Chart (main content area) ─────────────────────────────────────────

function FullChart({
  data,
  dataKeys,
  labels,
  colors,
  yDomain,
  yFormatter,
  valueFormatter,
  gradientIds,
}: {
  data: Array<Record<string, number>>;
  dataKeys: string[];
  labels: string[];
  colors: string[];
  yDomain?: [number, number];
  yFormatter?: (v: number) => string;
  valueFormatter: (v: number) => string;
  gradientIds: string[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
          <defs>
            {dataKeys.map((key, i) => (
              <linearGradient key={key} id={gradientIds[i]} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[i]} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors[i]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="time" hide />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            width={52}
            tick={chartTick}
            tickFormatter={yFormatter}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            cursor={{ stroke: 'var(--border)' }}
            labelFormatter={() => ''}
            formatter={(value, name) => {
              const i = dataKeys.indexOf(String(name));
              return [valueFormatter(Number(value)), labels[i] ?? String(name)];
            }}
          />
          {dataKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={colors[i]}
              strokeWidth={2}
              fill={`url(#${gradientIds[i]})`}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────────────

/** Big chart card: caption, 40px number, meta on the right, then the chart. */
function ChartCard({
  title,
  value,
  meta,
  children,
}: {
  title: string;
  value: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="lumen-card rounded-[22px] p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] text-label-2">{title}</h3>
          <p className="mt-1 text-[40px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground">
            {value}
          </p>
        </div>
        {meta && <span className="shrink-0 pb-1 text-[13px] text-label-2 tabular-nums">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-label-2">
      <span className={cn('h-[3px] w-3.5 rounded-full', swatch)} />
      {label}
    </span>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">{children}</div>;
}

/** Small stat tile: optional status dot + label, then the value. */
function StatTile({ label, value, dot, className }: { label: string; value: string; dot?: string; className?: string }) {
  return (
    <div className={cn('lumen-card min-w-0 rounded-[18px] px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-[13px] text-label-2">
        {dot && <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', dot)} />}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-0.5 truncate text-[20px] font-bold tracking-[-0.02em] tabular-nums text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">{children}</div>;
}

/** Per-device list (disks, interfaces): mono name left, totals right. */
function DeviceList({ title, rows }: { title: string; rows: Array<{ name: string; value: string }> }) {
  if (rows.length === 0) return null;
  return (
    <section className="lumen-card rounded-[22px] px-5 py-4">
      <h3 className="mb-1 text-[15px] font-bold">{title}</h3>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
            <span className="truncate font-mono text-foreground" title={r.name}>{r.name}</span>
            <span className="shrink-0 tabular-nums text-label-2">{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Detail Panels ──────────────────────────────────────────────────────────

function CpuDetail({ cpu, history }: { cpu: CpuStatsData; history: Array<Record<string, number>> }) {
  const coreKeys = cpu.cores.map((c) => `core${c.id}`);
  const avg = cpu.cores.length > 0 ? cpu.cores.reduce((s, c) => s + c.percent, 0) / cpu.cores.length : 0;

  return (
    <>
      <ChartCard
        title="Processor"
        value={`${cpu.overallPercent.toFixed(1)}%`}
        meta={`${cpu.coreCount} core${cpu.coreCount !== 1 ? 's' : ''}`}
      >
        {/* Single graph: overall area in the accent + thin neutral per-core lines */}
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="cpu-overall-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.cpu.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={SERIES.cpu.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="time" hide />
              <YAxis
                domain={[0, 100]}
                width={44}
                tick={chartTick}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                cursor={{ stroke: 'var(--border)' }}
                labelFormatter={() => ''}
                formatter={(value, name) => {
                  const v = Number(value);
                  if (name === 'value') return [`${v.toFixed(1)}%`, 'Overall'];
                  const coreNum = String(name).replace('core', '');
                  return [`${v.toFixed(1)}%`, `Core ${coreNum}`];
                }}
              />
              {/* Per-core lines — recessive, so the overall line reads first */}
              {coreKeys.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke="var(--lumen-label3)"
                  strokeWidth={1}
                  strokeOpacity={0.55}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
              {/* Overall — accent area */}
              <Area
                type="monotone"
                dataKey="value"
                stroke={SERIES.cpu.color}
                strokeWidth={2}
                fill="url(#cpu-overall-grad)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend>
          <LegendItem swatch={SERIES.cpu.bg} label="Overall" />
          {cpu.cores.length > 0 && <LegendItem swatch="bg-label-3" label="Per core" />}
        </Legend>
      </ChartCard>

      <StatGrid>
        <StatTile label="Uptime" value={cpu.uptime} />
        <StatTile label="Processes" value={String(cpu.processes.total)} />
        <StatTile label="Running" value={String(cpu.processes.running)} dot="bg-success" />
        <StatTile label="Sleeping" value={String(cpu.processes.sleeping)} dot="bg-label-3" />
        <StatTile label="Zombie" value={String(cpu.processes.zombie)} dot="bg-destructive" />
        <StatTile
          label="Load avg (1/5/15)"
          value={`${cpu.loadAverage.one} / ${cpu.loadAverage.five} / ${cpu.loadAverage.fifteen}`}
          className="col-span-2"
        />
      </StatGrid>

      {/* Cores: 6px bars in a recessed track — accent < 75%, warning ≥ 75%, destructive ≥ 90% */}
      {cpu.cores.length > 0 && (
        <section className="@container lumen-card rounded-[22px] px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h3 className="text-[15px] font-bold">Cores</h3>
            <span className="text-[13px] text-label-2 tabular-nums">
              {cpu.coreCount} core{cpu.coreCount !== 1 ? 's' : ''} · avg {avg.toFixed(0)}%
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 @sm:grid-cols-2 @3xl:grid-cols-3">
            {cpu.cores.map((core) => (
              <div key={core.id} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-[13px] text-label-2">Core {core.id}</span>
                <Meter value={core.percent} className="flex-1" />
                <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">
                  {core.percent.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function MemoryDetail({
  memory,
  history,
}: {
  memory: PerformanceTabProps['memory'];
  history: Array<{ time: number; value: number }>;
}) {
  const usedPct = memory.totalMb > 0 ? (memory.usedMb / memory.totalMb) * 100 : 0;
  const cachedPct = memory.totalMb > 0 ? ((memory.availableMb - memory.freeMb) / memory.totalMb) * 100 : 0;

  return (
    <>
      <ChartCard
        title="Memory"
        value={`${usedPct.toFixed(1)}%`}
        meta={`${formatMb(memory.usedMb)} / ${formatMb(memory.totalMb)}`}
      >
        <FullChart
          data={history}
          dataKeys={['value']}
          labels={['Used']}
          colors={[SERIES.memory.color]}
          yDomain={[0, 100]}
          yFormatter={(v) => `${v}%`}
          valueFormatter={(v) => `${v.toFixed(1)}%`}
          gradientIds={['mem-full-grad']}
        />

        {/* Memory composition bar */}
        <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-chip">
          <div
            className="h-full rounded-full bg-viz-blue transition-[width] duration-300"
            style={{ width: `${usedPct}%` }}
            title={`Used: ${memory.usedMb} MB`}
          />
          <div
            className="h-full rounded-full bg-viz-blue/35 transition-[width] duration-300"
            style={{ width: `${Math.max(0, cachedPct)}%` }}
            title={`Cached: ${memory.availableMb - memory.freeMb} MB`}
          />
        </div>
        <Legend>
          <LegendItem swatch="bg-viz-blue" label="Used" />
          <LegendItem swatch="bg-viz-blue/35" label="Cached" />
          <LegendItem swatch="bg-chip-2" label="Free" />
        </Legend>
      </ChartCard>

      <StatGrid>
        <StatTile label="Total" value={formatMb(memory.totalMb)} />
        <StatTile label="Used" value={formatMb(memory.usedMb)} />
        <StatTile label="Available" value={formatMb(memory.availableMb)} />
        <StatTile label="Free" value={formatMb(memory.freeMb)} />
        {memory.swapTotalMb > 0 && (
          <StatTile label="Swap" value={`${formatMb(memory.swapUsedMb)} / ${formatMb(memory.swapTotalMb)}`} />
        )}
      </StatGrid>
    </>
  );
}

function DiskDetail({
  diskIo,
  history,
}: {
  diskIo: DiskIoEntry[];
  history: Array<{ time: number; read: number; write: number }>;
}) {
  const lastPoint = history[history.length - 1];
  const readRate = lastPoint?.read ?? 0;
  const writeRate = lastPoint?.write ?? 0;

  return (
    <>
      <ChartCard title="Disk" value={formatBytesPerSec(readRate + writeRate)} meta="Read + write">
        <FullChart
          data={history}
          dataKeys={['read', 'write']}
          labels={['Read', 'Write']}
          colors={[DISK_READ.color, DISK_WRITE.color]}
          yFormatter={(v) => formatBytes(v)}
          valueFormatter={formatBytesPerSec}
          gradientIds={['disk-read-grad', 'disk-write-grad']}
        />
        <Legend>
          <LegendItem swatch={DISK_READ.bg} label="Read" />
          <LegendItem swatch={DISK_WRITE.bg} label="Write" />
        </Legend>
      </ChartCard>

      <StatGrid>
        <StatTile label="Read rate" value={formatBytesPerSec(readRate)} />
        <StatTile label="Write rate" value={formatBytesPerSec(writeRate)} />
      </StatGrid>

      <DeviceList
        title="Devices"
        rows={diskIo.map((d) => ({
          name: d.device,
          value: `R: ${formatBytes(d.readBytes)} / W: ${formatBytes(d.writeBytes)}`,
        }))}
      />
    </>
  );
}

function NetworkDetail({
  networkIo,
  history,
}: {
  networkIo: NetworkIoEntry[];
  history: Array<{ time: number; rx: number; tx: number }>;
}) {
  const lastPoint = history[history.length - 1];
  const rxRate = lastPoint?.rx ?? 0;
  const txRate = lastPoint?.tx ?? 0;

  return (
    <>
      <ChartCard title="Network" value={formatBytesPerSec(rxRate + txRate)} meta="Receive + send">
        <FullChart
          data={history}
          dataKeys={['rx', 'tx']}
          labels={['Receive', 'Send']}
          colors={[NET_RX.color, NET_TX.color]}
          yFormatter={(v) => formatBytes(v)}
          valueFormatter={formatBytesPerSec}
          gradientIds={['net-rx-grad', 'net-tx-grad']}
        />
        <Legend>
          <LegendItem swatch={NET_RX.bg} label="Receive" />
          <LegendItem swatch={NET_TX.bg} label="Send" />
        </Legend>
      </ChartCard>

      <StatGrid>
        <StatTile label="Receive" value={formatBytesPerSec(rxRate)} />
        <StatTile label="Send" value={formatBytesPerSec(txRate)} />
      </StatGrid>

      <DeviceList
        title="Interfaces"
        rows={networkIo.map((n) => ({
          name: n.interface,
          value: `RX: ${formatBytes(n.rxBytes)} / TX: ${formatBytes(n.txBytes)}`,
        }))}
      />
    </>
  );
}

// ─── Metric card (left column selector) ─────────────────────────────────────

function MetricCard({
  panel,
  active,
  value,
  subtitle,
  onSelect,
  children,
}: {
  panel: PanelConfig;
  active: boolean;
  value: string;
  subtitle: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  const Icon = panel.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'lumen-card w-full shrink-0 rounded-[20px] px-4 pb-3 pt-3.5 text-left transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-accent-soft ring-1 ring-accent-glow' : 'hover:bg-fill',
      )}
    >
      <span className="block">
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-edge bg-fill">
            <Icon
              className={cn('h-4 w-4', active ? 'text-accent-text' : 'text-label-2')}
              strokeWidth={1.75}
            />
          </span>
          <span className="flex-1 truncate text-[15px] font-bold text-foreground">{panel.label}</span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{value}</span>
        </span>
        <span className="mt-1.5 block truncate text-[12px] text-label-2 tabular-nums">{subtitle}</span>
        <span className="mt-1.5 block">{children}</span>
      </span>
    </button>
  );
}

// ─── Performance Tab (main export) ──────────────────────────────────────────

export function PerformanceTab({
  cpu,
  memory,
  networkIo,
  diskIo,
  cpuHistory,
  memHistory,
  netHistory,
  diskHistory,
}: PerformanceTabProps) {
  const [selected, setSelected] = useState<PanelId>('cpu');

  // Summary values for the metric cards
  const memPct = memory.totalMb > 0 ? (memory.usedMb / memory.totalMb) * 100 : 0;
  const lastNet = netHistory[netHistory.length - 1];
  const netTotal = (lastNet?.rx ?? 0) + (lastNet?.tx ?? 0);
  const lastDisk = diskHistory[diskHistory.length - 1];
  const diskTotal = (lastDisk?.read ?? 0) + (lastDisk?.write ?? 0);

  const panelValues: Record<PanelId, string> = {
    cpu: `${cpu.overallPercent.toFixed(0)}%`,
    memory: `${memPct.toFixed(0)}%`,
    disk: formatBytesPerSec(diskTotal),
    network: formatBytesPerSec(netTotal),
  };

  const panelSubtitles: Record<PanelId, string> = {
    cpu: `${cpu.coreCount} core${cpu.coreCount !== 1 ? 's' : ''} · load ${cpu.loadAverage.one}`,
    memory: `${formatMb(memory.usedMb)} / ${formatMb(memory.totalMb)}`,
    disk: `Read ${formatBytesPerSec(lastDisk?.read ?? 0)} · Write ${formatBytesPerSec(lastDisk?.write ?? 0)}`,
    network: `↓ ${formatBytesPerSec(lastNet?.rx ?? 0)} · ↑ ${formatBytesPerSec(lastNet?.tx ?? 0)}`,
  };

  const miniData: Record<PanelId, Array<Record<string, number>>> = {
    cpu: cpuHistory,
    memory: memHistory,
    disk: diskHistory.map((d) => ({ time: d.time, value: d.read + d.write })),
    network: netHistory.map((n) => ({ time: n.time, value: n.rx + n.tx })),
  };

  return (
    <div className="flex h-full min-h-0 gap-3.5">
      {/* ── Left: metric cards ── */}
      <div className="flex w-[248px] shrink-0 flex-col gap-3 overflow-y-auto pb-0.5">
        {PANELS.map((panel) => (
          <MetricCard
            key={panel.id}
            panel={panel}
            active={selected === panel.id}
            value={panelValues[panel.id]}
            subtitle={panelSubtitles[panel.id]}
            onSelect={() => setSelected(panel.id)}
          >
            <Sparkline
              data={miniData[panel.id]}
              dataKey="value"
              color={panel.color}
              domain={panel.id === 'cpu' || panel.id === 'memory' ? [0, 100] : undefined}
              className="h-8"
            />
          </MetricCard>
        ))}
      </div>

      {/* ── Right: detail ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pb-0.5">
        {selected === 'cpu' && <CpuDetail cpu={cpu} history={cpuHistory} />}
        {selected === 'memory' && <MemoryDetail memory={memory} history={memHistory} />}
        {selected === 'disk' && <DiskDetail diskIo={diskIo} history={diskHistory} />}
        {selected === 'network' && <NetworkDetail networkIo={networkIo} history={netHistory} />}
      </div>
    </div>
  );
}
