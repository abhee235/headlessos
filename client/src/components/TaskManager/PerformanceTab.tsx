// M7.1: Performance Tab — Windows 11-style real-time performance charts
// CPU, Memory, Network, Disk panels with area charts
// @see docs/phases/phase-7.md

import { useState } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Cpu, MemoryStick, Network, HardDrive } from 'lucide-react';
import type { CpuStatsData, NetworkIoEntry, DiskIoEntry } from '../../lib/api';
import { cn } from '../../lib/utils';

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
  icon: React.ReactNode;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  lineColor: string;
}

const PANELS: PanelConfig[] = [
  {
    id: 'cpu',
    label: 'CPU',
    icon: <Cpu size={15} />,
    color: '#6366f1',
    gradientFrom: '#6366f1',
    gradientTo: 'rgba(99,102,241,0.08)',
    lineColor: '#818cf8',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: <MemoryStick size={15} />,
    color: '#8b5cf6',
    gradientFrom: '#8b5cf6',
    gradientTo: 'rgba(139,92,246,0.08)',
    lineColor: '#a78bfa',
  },
  {
    id: 'disk',
    label: 'Disk',
    icon: <HardDrive size={15} />,
    color: '#22c55e',
    gradientFrom: '#22c55e',
    gradientTo: 'rgba(34,197,94,0.08)',
    lineColor: '#4ade80',
  },
  {
    id: 'network',
    label: 'Network',
    icon: <Network size={15} />,
    color: '#f59e0b',
    gradientFrom: '#f59e0b',
    gradientTo: 'rgba(245,158,11,0.08)',
    lineColor: '#fbbf24',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Distinct colors for CPU cores (up to 16)
const CORE_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f97316', // orange
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#e11d48', // rose
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#d946ef', // fuchsia
  '#eab308', // yellow
  '#22d3ee', // sky
  '#a855f7', // purple
  '#fb923c', // orange-light
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatBytesPerSec(bytes: number): string {
  if (bytes < 1024) return `${bytes} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB/s`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB/s`;
}

// ─── Mini Chart (sidebar panel thumbnails) ──────────────────────────────────

function MiniChart({
  data,
  dataKey,
  color,
  gradientId,
}: {
  data: Array<Record<string, number>>;
  dataKey: string;
  color: string;
  gradientId: string;
}) {
  return (
    <div className="w-full h-8 mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// CPU mini chart with per-core lines
function CpuMiniChart({
  data,
  coreCount,
}: {
  data: Array<Record<string, number>>;
  coreCount: number;
}) {
  const coreKeys = Array.from({ length: coreCount }, (_, i) => `core${i}`);
  return (
    <div className="w-full h-8 mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {coreKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CORE_COLORS[i % CORE_COLORS.length]}
              strokeWidth={0.8}
              strokeOpacity={0.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          <Line
            type="monotone"
            dataKey="value"
            stroke="#818cf8"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Full Chart (main content area) ─────────────────────────────────────────

function FullChart({
  data,
  dataKeys,
  colors,
  yDomain,
  yFormatter,
  gradientIds,
}: {
  data: Array<Record<string, number>>;
  dataKeys: string[];
  colors: string[];
  yDomain?: [number, number];
  yFormatter?: (v: number) => string;
  gradientIds: string[];
}) {
  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            {dataKeys.map((key, i) => (
              <linearGradient key={key} id={gradientIds[i]} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[i]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors[i]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
          <XAxis dataKey="time" hide />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            width={40}
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
            tickFormatter={yFormatter}
            axisLine={false}
            tickLine={false}
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

// ─── Stat Row ───────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

// ─── Detail Panels ──────────────────────────────────────────────────────────

function CpuDetail({ cpu, history }: { cpu: CpuStatsData; history: Array<Record<string, number>> }) {
  const coreKeys = cpu.cores.map((c) => `core${c.id}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] text-muted-foreground">CPU</h3>
          <p className="text-[28px] font-semibold text-foreground leading-tight tabular-nums">
            {cpu.overallPercent.toFixed(1)}%
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {cpu.coreCount} core{cpu.coreCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Single graph: thick overall line + thin per-core lines */}
      <div className="w-full h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cpu-overall-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />
            <XAxis dataKey="time" hide />
            <YAxis
              domain={[0, 100]}
              width={40}
              tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
              tickFormatter={(v) => `${v}%`}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                fontSize: 11,
                padding: '6px 10px',
              }}
              labelFormatter={() => ''}
              formatter={(value, name) => {
                const v = Number(value);
                if (name === 'value') return [`${v.toFixed(1)}%`, 'Overall'];
                const coreNum = String(name).replace('core', '');
                return [`${v.toFixed(1)}%`, `Core ${coreNum}`];
              }}
            />
            {/* Per-core lines — visible, colored */}
            {coreKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CORE_COLORS[i % CORE_COLORS.length]}
                strokeWidth={1.5}
                strokeOpacity={0.75}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            {/* Overall line — thick, solid */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#818cf8"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <div className="w-4 h-0.5 rounded-full" style={{ background: '#818cf8' }} /> Overall
        </span>
        {cpu.cores.map((core, i) => (
          <span key={core.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div
              className="w-3 h-0.5 rounded-full opacity-80"
              style={{ background: CORE_COLORS[i % CORE_COLORS.length] }}
            />
            Core {core.id}
          </span>
        ))}
      </div>

      {/* Core bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {cpu.cores.map((core, i) => (
          <div key={core.id} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-9 shrink-0">
              Core {core.id}
            </span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${core.percent}%`,
                  background: CORE_COLORS[i % CORE_COLORS.length],
                  opacity: 0.8,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
              {core.percent.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-2 space-y-0.5">
        <StatRow label="Uptime" value={cpu.uptime} />
        <StatRow label="Processes" value={String(cpu.processes.total)} />
        <StatRow label="Running" value={String(cpu.processes.running)} />
        <StatRow label="Sleeping" value={String(cpu.processes.sleeping)} />
        <StatRow label="Zombie" value={String(cpu.processes.zombie)} />
        <StatRow label="Load Avg (1/5/15)" value={`${cpu.loadAverage.one} / ${cpu.loadAverage.five} / ${cpu.loadAverage.fifteen}`} />
      </div>
    </div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13px] text-muted-foreground">Memory</h3>
          <p className="text-[28px] font-semibold text-foreground leading-tight tabular-nums">
            {usedPct.toFixed(1)}%
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {memory.usedMb} / {memory.totalMb} MB
        </span>
      </div>

      <FullChart
        data={history}
        dataKeys={['value']}
        colors={['#a78bfa']}
        yDomain={[0, 100]}
        yFormatter={(v) => `${v}%`}
        gradientIds={['mem-full-grad']}
      />

      {/* Memory composition bar */}
      <div className="space-y-1">
        <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${(memory.usedMb / memory.totalMb) * 100}%`,
              background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
            }}
            title={`Used: ${memory.usedMb} MB`}
          />
          <div
            className="h-full bg-primary/25 transition-all duration-300"
            style={{
              width: `${((memory.availableMb - memory.freeMb) / memory.totalMb) * 100}%`,
            }}
            title={`Cached: ${memory.availableMb - memory.freeMb} MB`}
          />
        </div>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary" /> Used
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary/25" /> Cached
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-secondary" /> Free
          </span>
        </div>
      </div>

      <div className="border-t border-border pt-2 space-y-0.5">
        <StatRow label="Total" value={`${memory.totalMb} MB`} />
        <StatRow label="Used" value={`${memory.usedMb} MB`} />
        <StatRow label="Available" value={`${memory.availableMb} MB`} />
        <StatRow label="Free" value={`${memory.freeMb} MB`} />
        {memory.swapTotalMb > 0 && (
          <>
            <StatRow label="Swap" value={`${memory.swapUsedMb} / ${memory.swapTotalMb} MB`} />
          </>
        )}
      </div>
    </div>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] text-muted-foreground">Disk</h3>
        <p className="text-[28px] font-semibold text-foreground leading-tight tabular-nums">
          {formatBytesPerSec(readRate + writeRate)}
        </p>
      </div>

      <FullChart
        data={history}
        dataKeys={['read', 'write']}
        colors={['#22c55e', '#f59e0b']}
        yFormatter={(v) => formatBytes(v)}
        gradientIds={['disk-read-grad', 'disk-write-grad']}
      />

      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-success" /> Read
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-warning" /> Write
        </span>
      </div>

      <div className="border-t border-border pt-2 space-y-0.5">
        <StatRow label="Read Rate" value={formatBytesPerSec(readRate)} />
        <StatRow label="Write Rate" value={formatBytesPerSec(writeRate)} />
        {diskIo.map((d) => (
          <StatRow key={d.device} label={d.device} value={`R: ${formatBytes(d.readBytes)} / W: ${formatBytes(d.writeBytes)}`} />
        ))}
      </div>
    </div>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] text-muted-foreground">Network</h3>
        <p className="text-[28px] font-semibold text-foreground leading-tight tabular-nums">
          {formatBytesPerSec(rxRate + txRate)}
        </p>
      </div>

      <FullChart
        data={history}
        dataKeys={['rx', 'tx']}
        colors={['#f59e0b', '#3b82f6']}
        yFormatter={(v) => formatBytes(v)}
        gradientIds={['net-rx-grad', 'net-tx-grad']}
      />

      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-warning" /> Receive
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-primary" /> Send
        </span>
      </div>

      <div className="border-t border-border pt-2 space-y-0.5">
        <StatRow label="Receive" value={formatBytesPerSec(rxRate)} />
        <StatRow label="Send" value={formatBytesPerSec(txRate)} />
        {networkIo.map((n) => (
          <StatRow key={n.interface} label={n.interface} value={`RX: ${formatBytes(n.rxBytes)} / TX: ${formatBytes(n.txBytes)}`} />
        ))}
      </div>
    </div>
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

  // Summary values for sidebar panels
  const memPct = memory.totalMb > 0 ? (memory.usedMb / memory.totalMb) * 100 : 0;
  const lastNet = netHistory[netHistory.length - 1];
  const netTotal = (lastNet?.rx ?? 0) + (lastNet?.tx ?? 0);
  const lastDisk = diskHistory[diskHistory.length - 1];
  const diskTotal = (lastDisk?.read ?? 0) + (lastDisk?.write ?? 0);

  const panelValues: Record<PanelId, string> = {
    cpu: `${cpu.overallPercent.toFixed(0)}%`,
    memory: `${memPct.toFixed(0)}% (${memory.usedMb}/${memory.totalMb} MB)`,
    disk: formatBytesPerSec(diskTotal),
    network: formatBytesPerSec(netTotal),
  };

  const miniData: Record<PanelId, Array<Record<string, number>>> = {
    cpu: cpuHistory,
    memory: memHistory,
    disk: diskHistory,
    network: netHistory,
  };

  const miniKeys: Record<PanelId, string> = {
    cpu: 'value',
    memory: 'value',
    disk: 'read',
    network: 'rx',
  };

  return (
    <div className="flex h-full">
      {/* ── Left panel selector ── */}
      <div className="w-52 shrink-0 border-r border-border bg-sidebar overflow-y-auto">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            onClick={() => setSelected(panel.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 border-b border-border transition-colors relative',
              selected === panel.id
                ? 'bg-accent'
                : 'hover:bg-accent/50',
            )}
          >
            {/* Active indicator */}
            {selected === panel.id && (
              <div
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                style={{ background: panel.color }}
              />
            )}
            <div className="flex items-center gap-2 mb-0.5">
              <span style={{ color: panel.color }}>{panel.icon}</span>
              <span className="text-[12px] font-medium text-foreground">{panel.label}</span>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {panelValues[panel.id]}
            </span>
            {panel.id === 'cpu' ? (
              <CpuMiniChart data={cpuHistory} coreCount={cpu.coreCount} />
            ) : (
              <MiniChart
                data={miniData[panel.id]}
                dataKey={miniKeys[panel.id]}
                color={panel.lineColor}
                gradientId={`mini-${panel.id}`}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Detail panel ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {selected === 'cpu' && <CpuDetail cpu={cpu} history={cpuHistory} />}
        {selected === 'memory' && <MemoryDetail memory={memory} history={memHistory} />}
        {selected === 'disk' && <DiskDetail diskIo={diskIo} history={diskHistory} />}
        {selected === 'network' && <NetworkDetail networkIo={networkIo} history={netHistory} />}
      </div>
    </div>
  );
}
