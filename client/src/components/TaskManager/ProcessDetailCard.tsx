// EX8.6: Process detail card — opens above the process table when a row is
// clicked (LumenOS Activity). Name + status, PID · user, the command, Suspend /
// Resume and End task, a CPU sparkline for the last 60 s, and Memory (RSS) /
// Threads / Started / Priority. Threads, priority and the exact start time come
// from GET /taskmanager/process/:pid; the rest from the process list itself.
// @see docs/phases/phase-ex8.md

import { useEffect, useState } from 'react';
import { PauseCircle, PlayCircle, XCircle, X } from 'lucide-react';
import type { ProcessData, ProcessDetailData, ProcessSignal } from '../../lib/api';
import { fetchProcessDetail } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Sparkline, SERIES } from './parts';

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

  return (
    <section
      aria-label={`Process ${p.pid} details`}
      className="lumen-card mb-3 shrink-0 rounded-[22px] p-5 @container"
    >
      <div className="grid gap-5 @[820px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Identity, command, actions ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <h3 className="truncate text-[22px] font-bold leading-7 tracking-[-0.01em]" title={p.command}>
                  {shortProcessName(p.command)}
                </h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-0.5 text-[14px] text-label-2">
                PID <span className="tabular-nums">{p.pid}</span> · {p.user}
                {exited && <> · this process has exited</>}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close process details"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-label-2 transition-colors duration-150 hover:bg-fill-2 hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <code className="block truncate rounded-[14px] bg-chip-2 px-4 py-3 font-mono text-[13px] text-foreground" title={p.command}>
            {p.command}
          </code>

          <div className="mt-auto flex gap-2.5">
            <Button
              variant="secondary"
              className="h-10 flex-1"
              disabled={busy || exited}
              onClick={() => onSignal(suspended ? 18 : 19)}
            >
              {suspended ? <PlayCircle strokeWidth={1.75} /> : <PauseCircle strokeWidth={1.75} />}
              {suspended ? 'Resume' : 'Suspend'}
            </Button>
            <Button variant="danger" className="h-10 flex-1" disabled={busy || exited} onClick={() => onSignal(15)}>
              <XCircle strokeWidth={1.75} />
              End task
            </Button>
          </div>
        </div>

        {/* ── CPU over the last 60 s ── */}
        <div className="flex min-h-[150px] flex-col rounded-[18px] bg-chip-2 p-4 shadow-[inset_0_1px_3px_rgba(0,0,0,.25)]">
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-label-2">CPU · last 60 s</span>
            <span className="font-bold tabular-nums">{p.cpu.toFixed(1)}%</span>
          </div>
          <div className="relative mt-3 min-h-0 flex-1">
            {cpuHistory.length > 1 ? (
              <Sparkline
                data={cpuHistory}
                dataKey="cpu"
                color={SERIES.cpu.color}
                domain={[0, Math.max(10, Math.ceil(Math.max(...cpuHistory.map((s) => s.cpu)) * 1.15))]}
                className="absolute inset-0 h-full"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-label-3">Collecting samples…</div>
            )}
          </div>
        </div>

        {/* ── Facts ── */}
        <dl className="flex flex-col justify-center">
          {rows.map(([k, v], i) => (
            <div
              key={k}
              className={`flex min-h-11 items-center justify-between gap-3 ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
            >
              <dt className="text-[14px] text-label-2">{k}</dt>
              <dd className="truncate text-[14px] font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
