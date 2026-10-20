// EX8.6: Process detail card — opens above the process table when a row is
// clicked (LumenOS Activity). Name + status, PID · user, the command, Suspend /
// Resume and End task, a CPU sparkline for the last 60 s, and Memory (RSS) /
// Threads / Started / Priority. Threads, priority and the exact start time come
// from GET /taskmanager/process/:pid; the rest from the process list itself.
// EX8.13: layout ported from Activity.dc.html — three flex-wrap columns
// (flex 1 1 220 / 228 / 180px, 18px gap) that fold to two rows, then a stack, as
// the window narrows. The prototype has no box-sizing reset, so its sizes exclude
// padding and borders: the chart's 200px basis + 28px padding is 228px here,
// badge 22+2, fact rows 30+1 (buttons are border-box even there: 38); violet-tinted card, wrapped mono command, 38px pill
// actions, the prototype's own SVG sparkline and 30px fact rows.
// @see docs/phases/phase-ex8.md

import { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import type { ProcessData, ProcessDetailData, ProcessSignal } from '../../lib/api';
import { fetchProcessDetail } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export type CpuSample = { t: number; cpu: number };

interface ProcessDetailCardProps {
  process: ProcessData;
  serverId: string;
  /** CPU samples for this PID over the last 60 s, oldest first */
  cpuHistory: CpuSample[];
  status: { variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'; label: string };
  busy: boolean;
  /** The process is no longer running; show its last snapshot, actions off */
  exited?: boolean;
  onSignal: (signal: ProcessSignal) => void;
  onClose: () => void;
}

export function formatKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / 1024 / 1024).toFixed(1)} GB`;
}

/** "10 · low", "0 · normal", "-5 · high" */
export function formatPriority(nice: number | null): string {
  if (nice === null) return '—';
  const label = nice < 0 ? 'high' : nice > 0 ? 'low' : 'normal';
  return `${nice} · ${label}`;
}

/** `ps -o lstart` text → "04:28 PM" today, otherwise "Oct 18, 04:28 PM". */
export function formatStarted(lstart: string | null, fallback: string): string {
  if (!lstart) return fallback;
  const d = new Date(lstart);
  if (Number.isNaN(d.getTime())) return lstart;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

/**
 * The prototype's spark(): points across a w×h box with 2px of inner padding,
 * values scaled to `max` and clipped at it. Returns the line and filled area.
 */
export function sparkPaths(values: number[], max: number, w = 200, h = 48): { line: string; area: string } {
  if (values.length < 2) return { line: '', area: '' };
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)} ${(h - 2 - Math.min(1, v / max) * (h - 4)).toFixed(1)}`);
  return { line: `M ${pts.join(' L ')}`, area: `M 0 ${h} L ${pts.join(' L ')} L ${w} ${h} Z` };
}

export function shortProcessName(command: string): string {
  return command.split('/').pop()?.split(' ')[0] ?? command;
}

export function ProcessDetailCard({ process: p, serverId, cpuHistory, status, busy, exited = false, onSignal, onClose }: ProcessDetailCardProps) {
  const [detail, setDetail] = useState<ProcessDetailData | null>(null);
  const suspended = p.stat.startsWith('T');

  // Threads / priority / start time for the selected PID. Re-read on every list
  // refresh (the `p` object changes), so thread counts stay current.
  useEffect(() => {
    if (exited) return;
    let cancelled = false;
    fetchProcessDetail(serverId, p.pid)
      .then((res) => {
        if (!cancelled) setDetail(res.success && res.data ? res.data : null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, p, exited]);

  const rows: Array<[string, string]> = [
    ['Memory (RSS)', formatKb(p.rss)],
    ['Threads', detail?.threads != null ? String(detail.threads) : '—'],
    ['Started', formatStarted(detail?.startedAt ?? null, p.started)],
    ['Priority', formatPriority(detail?.nice ?? null)],
  ];

  const cpuValues = cpuHistory.map((c) => c.cpu);
  const spark = sparkPaths(cpuValues, Math.max(4, ...cpuValues) * 1.1);

  return (
    <section
      aria-label={`Process ${p.pid} details`}
      className="mb-3.5 flex shrink-0 flex-wrap items-stretch gap-[18px] rounded-[22px] border border-[rgba(156,139,255,.35)] bg-[linear-gradient(150deg,rgba(156,139,255,.16),rgba(255,255,255,.04))] px-[18px] py-4 shadow-[inset_0_1px_0_var(--lumen-spec2),0_14px_30px_-18px_rgba(106,79,176,.7)]"
    >
      {/* ── Identity, command, actions (flex 1 1 220px) ── */}
      <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <h3 className="truncate text-[17px] font-semibold leading-[22px]" title={p.command}>
                {shortProcessName(p.command)}
              </h3>
              <Badge variant={status.variant} className="h-6 shrink-0 whitespace-nowrap">{status.label}</Badge>
            </div>
            <p className="text-[13px] leading-[17px] text-label-2">
              PID <span className="tabular-nums">{p.pid}</span> · {p.user}
              {exited && <> · this process has exited</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close process details"
            title="Close"
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-chip text-foreground transition-colors duration-150 hover:bg-chip-2"
          >
            <XCircle className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <code className="block break-all rounded-[12px] bg-chip px-3 py-2 font-mono text-[12px] leading-[18px] text-label-2" title={p.command}>
          {p.command}
        </code>

        <div className="mt-auto flex gap-2">
          <Button
            variant="secondary"
            className="h-[38px] flex-1 text-[14px] [&_svg]:size-[18px]"
            disabled={busy || exited}
            onClick={() => onSignal(suspended ? 18 : 19)}
          >
            {suspended ? <PlayCircle strokeWidth={1.75} /> : <PauseCircle strokeWidth={1.75} />}
            {suspended ? 'Resume' : 'Suspend'}
          </Button>
          <Button
            variant="danger"
            className="h-[38px] flex-1 border border-white/[.18] bg-[linear-gradient(180deg,#E5534B,#B93A33)] text-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_10px_20px_-10px_rgba(229,83,75,.7)] hover:bg-[linear-gradient(180deg,#E9645C,#C1413A)] [&_svg]:size-[18px]"
            disabled={busy || exited}
            onClick={() => onSignal(15)}
          >
            <XCircle strokeWidth={1.75} />
            End task
          </Button>
        </div>
      </div>

      {/* ── CPU over the last 60 s (prototype basis 200px + 28px padding) ── */}
      <div className="flex min-w-0 flex-[1_1_228px] flex-col rounded-[16px] bg-chip px-3.5 pb-1.5 pt-3 shadow-[inset_0_1px_2px_rgba(0,0,0,.24)]">
        <div className="flex justify-between text-[13px] leading-[17px]">
          <span className="text-label-2">CPU · last 60 s</span>
          <span className="font-semibold tabular-nums">{p.cpu.toFixed(1)}%</span>
        </div>
        {spark.line ? (
          <svg viewBox="0 0 200 48" preserveAspectRatio="none" className="mt-1.5 block min-h-[60px] w-full flex-1" aria-hidden>
            <path d={spark.area} fill="rgba(156,139,255,.22)" />
            <path d={spark.line} fill="none" stroke="#9C8BFF" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="mt-1.5 grid min-h-[60px] flex-1 place-items-center text-xs text-label-3">Collecting samples…</div>
        )}
      </div>

      {/* ── Facts (flex 1 1 180px) ── */}
      <dl className="flex min-w-0 flex-[1_1_180px] flex-col justify-center">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-[31px] items-center justify-between gap-2.5 border-b border-border text-[13px]">
            <dt className="text-label-2">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
