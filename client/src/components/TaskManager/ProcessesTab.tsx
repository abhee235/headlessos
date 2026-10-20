// M7.1: Processes Tab — sortable process table with search + kill
// EX8.6: LumenOS v3 restyle — pill search with count, table in a .lumen-card with a
// fixed 11px uppercase header, 56px rows (name + mono command), slim CPU/memory bars.
// Clicking a row opens ProcessDetailCard above the table; All / Running / Idle /
// My processes filter the list client-side.
// @see docs/phases/phase-7.md, docs/phases/phase-ex8.md

import { useState, useMemo, useEffect } from 'react';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Skull, Square, ClipboardCopy } from 'lucide-react';
import type { ProcessData, ProcessSignal } from '../../lib/api';
import { killProcess } from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { ProcessDetailCard, formatKb, shortProcessName, type CpuSample } from './ProcessDetailCard';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Meter, SERIES } from './parts';

// ─── Types ───────────────────────────────────────────────────────────────────

type SortField = 'pid' | 'user' | 'cpu' | 'memory' | 'command' | 'rss';

interface ProcessesTabProps {
  processes: ProcessData[];
  serverId: string;
  onRefresh: () => void;
  refreshing: boolean;
  onContextMenuOpenChange?: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatBadge(stat: string): { variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline'; label: string } {
  const c = stat.charAt(0);
  switch (c) {
    case 'R':
      return { variant: 'success', label: 'Running' };
    case 'S':
      return { variant: 'secondary', label: 'Sleeping' };
    case 'D':
      return { variant: 'warning', label: 'Disk Wait' };
    case 'Z':
      return { variant: 'destructive', label: 'Zombie' };
    case 'T':
      return { variant: 'warning', label: 'Stopped' };
    default:
      return { variant: 'secondary', label: stat };
  }
}

// One column template shared by the header and every row, so the header can sit
// outside the scroll area (always visible, no opaque backing needed).
// Narrow windows scroll the whole table sideways below TABLE_MIN.
const COLS =
  'grid grid-cols-[52px_minmax(140px,1fr)_84px_86px_minmax(96px,170px)_minmax(96px,170px)_68px] items-center gap-x-3 px-4';
const TABLE_MIN = 'min-w-[720px]';

type StateFilter = 'all' | 'running' | 'idle' | 'mine';
const STATE_FILTERS: Array<{ id: StateFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'idle', label: 'Idle' },
  { id: 'mine', label: 'My processes' },
];

/**
 * Commands HeadlessOS itself runs to fill the Task Manager and Dashboard. ps
 * sees them (often at 100% CPU, with a new PID every poll), so they are hidden
 * when they belong to the SSH user we connect as.
 */
const PROBE_COMMANDS = new Set([
  'ps aux', 'top -bn1 -1', 'head -20', 'cat /proc/loadavg', 'nproc', 'free -m',
  'cat /proc/net/dev', 'cat /proc/diskstats', 'cat /proc/stat', 'df -h',
  'ip -brief addr', 'uname -a', 'uptime -p', 'cat /etc/os-release',
]);
export function isHeadlessProbe(p: ProcessData, sshUser: string | undefined): boolean {
  if (!sshUser || p.user !== sshUser) return false;
  const cmd = p.command.trim();
  return PROBE_COMMANDS.has(cmd) || cmd.startsWith('ps -o nlwp=') || /^(ba)?sh -c (top -bn1|uname -a|ps -o nlwp=)/.test(cmd);
}

/** CPU history window for the detail card */
const HISTORY_MS = 60_000;

const SIGNAL_DONE: Record<ProcessSignal, string> = {
  15: 'ended',
  9: 'killed',
  19: 'suspended',
  18: 'resumed',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ProcessesTab({ processes, serverId, onRefresh, refreshing, onContextMenuOpenChange }: ProcessesTabProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [cpuHistory, setCpuHistory] = useState<Map<number, CpuSample[]>>(() => new Map());
  const username = useAppStore((s) => s.servers.find((srv) => srv.id === serverId)?.username);
  // The list without HeadlessOS's own monitoring commands
  const visible = useMemo(() => processes.filter((p) => !isHeadlessProbe(p, username)), [processes, username]);

  // One CPU sample per PID per refresh; keep the last 60 s, drop exited PIDs.
  useEffect(() => {
    const now = Date.now();
    setCpuHistory((prev) => {
      const next = new Map<number, CpuSample[]>();
      for (const p of visible) {
        const kept = (prev.get(p.pid) ?? []).filter((s) => now - s.t <= HISTORY_MS);
        next.set(p.pid, [...kept, { t: now, cpu: p.cpu }]);
      }
      return next;
    });
  }, [visible]);

  // The selected process as last seen. When it exits the card stays open,
  // marked Exited, until the user closes it (instead of vanishing mid-read).
  const liveSelected = selectedPid !== null ? visible.find((p) => p.pid === selectedPid) : undefined;
  const [lastSeen, setLastSeen] = useState<ProcessData | null>(null);
  useEffect(() => {
    if (liveSelected) setLastSeen(liveSelected);
    else if (selectedPid === null) setLastSeen(null);
  }, [liveSelected, selectedPid]);
  const selectedProcess = liveSelected ?? (lastSeen?.pid === selectedPid ? lastSeen : undefined);
  const selectedExited = !!selectedProcess && !liveSelected;

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = visible;
    if (stateFilter === 'running') list = list.filter((p) => p.stat.startsWith('R'));
    else if (stateFilter === 'idle') list = list.filter((p) => /^[SI]/.test(p.stat));
    else if (stateFilter === 'mine' && username) list = list.filter((p) => p.user === username);
    if (q) {
      list = list.filter(
        (p) =>
          p.command.toLowerCase().includes(q) ||
          p.user.toLowerCase().includes(q) ||
          String(p.pid).includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'pid':
          cmp = a.pid - b.pid;
          break;
        case 'user':
          cmp = a.user.localeCompare(b.user);
          break;
        case 'cpu':
          cmp = a.cpu - b.cpu;
          break;
        case 'memory':
          cmp = a.memory - b.memory;
          break;
        case 'rss':
          cmp = a.rss - b.rss;
          break;
        case 'command':
          cmp = a.command.localeCompare(b.command);
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [visible, search, sortField, sortAsc, stateFilter, username]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleKill = async (signal: ProcessSignal, targetPid?: number) => {
    const pid = targetPid ?? selectedPid;
    if (!pid) return;
    setKilling(true);
    try {
      const res = await killProcess(serverId, pid, signal);
      if (res.success) {
        toast.success(`Process ${pid} ${SIGNAL_DONE[signal]}`);
        // Suspend / resume keep the card open; ending the process closes it
        if (signal === 15 || signal === 9) setSelectedPid(null);
        onRefresh();
      } else {
        toast.error(res.error ?? 'Failed to signal process');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signal failed');
    } finally {
      setKilling(false);
    }
  };

  const sortHeader = (field: SortField, label: string, align: 'left' | 'right' = 'left') => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : sortAsc ? ArrowUp : ArrowDown;
    return (
      <div role="columnheader" aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className={cn(
            'flex w-full select-none items-center gap-1 uppercase tracking-[.06em] transition-colors duration-150 hover:text-label-2 focus-visible:outline-none focus-visible:text-foreground',
            align === 'right' && 'justify-end',
            active && 'text-label-2',
          )}
        >
          {label}
          <Icon size={11} strokeWidth={2} className={active ? 'text-accent-text' : 'opacity-60'} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar: pill search with count, kill actions for the selection ── */}
      <div className="mb-3.5 flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={17}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-label-3"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processes, users or PIDs"
            className="h-[38px] pl-10 pr-28"
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
              {filtered.length} / {visible.length}
            </span>
          </div>
        </div>

        {/* State filter (segmented) */}
        <div className="flex shrink-0 rounded-full bg-fill p-[3px]" role="radiogroup" aria-label="Filter processes">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={stateFilter === f.id}
              onClick={() => setStateFilter(f.id)}
              disabled={f.id === 'mine' && !username}
              className={cn(
                'h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-150 disabled:opacity-40',
                stateFilter === f.id ? 'lumen-lit' : 'text-label-2 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Detail card for the selected process ── */}
      {selectedProcess && (
        <ProcessDetailCard
          process={selectedProcess}
          serverId={serverId}
          cpuHistory={cpuHistory.get(selectedProcess.pid) ?? []}
          status={selectedExited ? { variant: 'secondary', label: 'Exited' } : getStatBadge(selectedProcess.stat)}
          exited={selectedExited}
          busy={killing}
          onSignal={(sig) => handleKill(sig, selectedProcess.pid)}
          onClose={() => setSelectedPid(null)}
        />
      )}

      {/* ── Table ── */}
      <div role="table" aria-label="Processes" className="lumen-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]">
        <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
          <div className={cn('flex min-h-0 flex-1 flex-col', TABLE_MIN)}>
            <div role="rowgroup" className="shrink-0 overflow-hidden border-b border-border [scrollbar-gutter:stable]">
              <div role="row" className={cn(COLS, 'h-10 text-[11px] font-semibold text-label-3')}>
                {sortHeader('pid', 'PID')}
                {sortHeader('command', 'Name')}
                {sortHeader('user', 'User')}
                <div role="columnheader" className="uppercase tracking-[.06em]">Status</div>
                {sortHeader('cpu', 'CPU')}
                {sortHeader('memory', 'Memory')}
                {sortHeader('rss', 'RSS', 'right')}
              </div>
            </div>
    
            <div role="rowgroup" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
              {filtered.length === 0 && (
                <div className="flex h-24 items-center justify-center text-[13px] text-label-3">
                  No matching processes
                </div>
              )}
              {filtered.map((p) => {
                const statBadge = getStatBadge(p.stat);
                const shortName = shortProcessName(p.command);
                const selected = selectedPid === p.pid;
                return (
                  <ContextMenu key={p.pid} onOpenChange={onContextMenuOpenChange}>
                    <ContextMenuTrigger asChild>
                      <div
                        role="row"
                        aria-selected={selected}
                        className={cn(
                          COLS,
                          'h-14 cursor-pointer border-b border-border text-[13px] transition-colors duration-150 last:border-b-0',
                          selected ? 'bg-accent-soft' : 'hover:bg-fill active:bg-fill-2',
                        )}
                        onClick={() => setSelectedPid(selected ? null : p.pid)}
                      >
                        <div role="cell" className="font-mono text-[12px] tabular-nums text-label-2">
                          {p.pid}
                        </div>
                        <div role="cell" className="min-w-0">
                          <div
                            className={cn('truncate font-semibold', selected ? 'text-accent-text' : 'text-foreground')}
                            title={p.command}
                          >
                            {shortName}
                          </div>
                          <div className="truncate font-mono text-[11px] text-label-3">{p.command}</div>
                        </div>
                        <div role="cell" className="truncate text-label-2" title={p.user}>
                          {p.user}
                        </div>
                        <div role="cell">
                          <Badge variant={statBadge.variant}>{statBadge.label}</Badge>
                        </div>
                        <div role="cell" className="flex items-center gap-2.5">
                          <Meter value={p.cpu} className="flex-1" />
                          <span className="w-12 shrink-0 text-right tabular-nums text-foreground">
                            {p.cpu.toFixed(1)}%
                          </span>
                        </div>
                        <div role="cell" className="flex items-center gap-2.5">
                          <Meter value={p.memory} fillClassName={SERIES.memory.bg} className="flex-1" />
                          <span className="w-12 shrink-0 text-right tabular-nums text-foreground">
                            {p.memory.toFixed(1)}%
                          </span>
                        </div>
                        <div role="cell" className="text-right tabular-nums text-foreground">
                          {formatKb(p.rss)}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem className="font-medium text-xs pointer-events-none">
                        <Square className="w-4 h-4 mr-2 opacity-60" />
                        {shortName} (PID {p.pid})
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleKill(15, p.pid)}
                      >
                        <X className="w-4 h-4 mr-2 opacity-60" />
                        End Task
                      </ContextMenuItem>
                      <ContextMenuItem
                        danger
                        onClick={() => handleKill(9, p.pid)}
                      >
                        <Skull className="w-4 h-4 mr-2" />
                        Force Kill (SIGKILL)
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(String(p.pid));
                          toast.success(`PID ${p.pid} copied`);
                        }}
                      >
                        <ClipboardCopy className="w-4 h-4 mr-2 opacity-60" />
                        Copy PID
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(p.command);
                          toast.success('Command copied');
                        }}
                      >
                        <ClipboardCopy className="w-4 h-4 mr-2 opacity-60" />
                        Copy Command
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status line ── */}
      <div className="flex shrink-0 items-center justify-between px-1.5 pt-2 text-[12px] text-label-3">
        <span>Processes: {visible.length}</span>
        <span className="tabular-nums">
          CPU: {visible.reduce((s, p) => s + p.cpu, 0).toFixed(1)}% ·
          Memory: {visible.reduce((s, p) => s + p.memory, 0).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
