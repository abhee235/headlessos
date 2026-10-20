// M2.2: Network Card — network interfaces display
// EX8.6: LumenOS v3 — live Download / Upload tiles + area chart (rates sampled by
// DashboardView from the Task Manager endpoint), then each interface with a status
// dot and its IPs as mono chips.
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { ArrowDown, ArrowUp, Network } from 'lucide-react';
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { chartTooltipStyle, formatBytesPerSec } from '../TaskManager/parts';
import { DashCard, MonoChip } from './parts';

interface NetworkInterfaceData {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  ipAddresses: string[];
}

export interface NetRatePoint {
  time: number;
  /** bytes per second */
  rx: number;
  tx: number;
}

interface NetworkCardProps {
  interfaces: NetworkInterfaceData[];
  /** Recent throughput samples, oldest first (empty until two samples exist) */
  history?: NetRatePoint[];
}

const DOWNLOAD = { color: 'var(--chart-5)' };
const UPLOAD = { color: 'var(--chart-3)' };

export function NetworkCard({ interfaces, history = [] }: NetworkCardProps) {
  // Show UP interfaces first, then UNKNOWN, then DOWN
  const sorted = [...interfaces].sort((a, b) => {
    const order = { UP: 0, UNKNOWN: 1, DOWN: 2 };
    return order[a.status] - order[b.status];
  });

  const last = history[history.length - 1];

  return (
    <DashCard
      icon={Network}
      title="Network"
      meta={`${interfaces.filter(i => i.status === 'UP').length} up / ${interfaces.length} total`}
    >
      {/* Live rates */}
      <div className="grid grid-cols-2 gap-2.5">
        <RateTile icon={ArrowDown} iconClassName="text-success" label="Download" rate={last?.rx} />
        <RateTile icon={ArrowUp} iconClassName="text-accent-text" label="Upload" rate={last?.tx} />
      </div>

      <div className="mt-3 h-[72px] w-full">
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="dash-net-rx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DOWNLOAD.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={DOWNLOAD.color} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, 'auto']} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                cursor={{ stroke: 'var(--border)' }}
                labelFormatter={() => ''}
                formatter={(value, name) => [
                  formatBytesPerSec(Math.round(Number(value))),
                  name === 'rx' ? 'Download' : 'Upload',
                ]}
              />
              <Area
                type="monotone"
                dataKey="rx"
                stroke={DOWNLOAD.color}
                strokeWidth={2}
                fill="url(#dash-net-rx)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="tx"
                stroke={UPLOAD.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-[14px] border border-dashed border-border text-[12px] text-label-3">
            Collecting samples…
          </div>
        )}
      </div>

      {/* Interfaces */}
      <div className="mt-3 divide-y divide-border border-t border-border">
        {sorted.map(iface => (
          <InterfaceRow key={iface.name} iface={iface} />
        ))}
      </div>
    </DashCard>
  );
}

/** Splits a bytes/sec rate into a big number and its unit caption. */
function splitRate(bps: number): { value: string; unit: string } {
  if (bps >= 1024 * 1024) return { value: (bps / 1024 / 1024).toFixed(1), unit: 'MB/s' };
  if (bps >= 1024) {
    const kb = bps / 1024;
    return { value: kb < 10 ? kb.toFixed(1) : kb.toFixed(0), unit: 'KB/s' };
  }
  return { value: bps.toFixed(0), unit: 'B/s' };
}

function RateTile({
  icon: Icon,
  iconClassName,
  label,
  rate,
}: {
  icon: typeof ArrowDown;
  iconClassName: string;
  label: string;
  rate: number | undefined;
}) {
  const r = rate === undefined ? null : splitRate(rate);
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[14px] border border-edge bg-chip px-3.5 py-2.5">
      <Icon className={cn('h-[17px] w-[17px] shrink-0', iconClassName)} strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="truncate text-[20px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
          {r ? r.value : '—'}
        </p>
        <p className="truncate text-[12px] text-label-2">
          {label}{r ? ` · ${r.unit}` : ''}
        </p>
      </div>
    </div>
  );
}

const STATUS = {
  UP: { dot: 'bg-success', label: 'Up' },
  UNKNOWN: { dot: 'bg-warning', label: 'Unknown' },
  DOWN: { dot: 'bg-label-3', label: 'Down' },
} as const;

function InterfaceRow({ iface }: { iface: NetworkInterfaceData }) {
  const status = STATUS[iface.status] ?? STATUS.UNKNOWN;

  return (
    <div className="flex items-center gap-3 py-2.5 text-[13px]">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', status.dot)} aria-hidden />
      <span className="w-28 shrink-0 truncate font-mono text-foreground" title={iface.name}>
        {iface.name}
      </span>
      <span className="w-16 shrink-0 text-label-2">{status.label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
        {iface.ipAddresses.length > 0 ? (
          iface.ipAddresses.map(ip => (
            <MonoChip key={ip} title={ip}>{ip}</MonoChip>
          ))
        ) : (
          <span className="italic text-label-3">no address</span>
        )}
      </div>
    </div>
  );
}
