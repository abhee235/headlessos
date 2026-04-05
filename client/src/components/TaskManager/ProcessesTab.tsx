// M7.1: Processes Tab — sortable process table with search + kill
// @see docs/phases/phase-7.md

import { useState, useMemo } from 'react';
import { Search, X, ArrowUpDown, ArrowUp, ArrowDown, Skull, Square, ClipboardCopy } from 'lucide-react';
import type { ProcessData } from '../../lib/api';
import { killProcess } from '../../lib/api';
import { cn } from '../../lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';

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

function formatKb(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / 1024 / 1024).toFixed(1)} GB`;
}

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
      return { variant: 'outline', label: 'Stopped' };
    default:
      return { variant: 'secondary', label: stat };
  }
}

// CPU/Mem usage color gradient
function usageColor(pct: number): string {
  if (pct >= 80) return 'text-red-500';
  if (pct >= 50) return 'text-orange-400';
  if (pct >= 20) return 'text-yellow-400';
  return 'text-[rgb(var(--muted-foreground))]';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProcessesTab({ processes, serverId, onRefresh, refreshing, onContextMenuOpenChange }: ProcessesTabProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = processes;
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
  }, [processes, search, sortField, sortAsc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleKill = async (signal: 9 | 15, targetPid?: number) => {
    const pid = targetPid ?? selectedPid;
    if (!pid) return;
    setKilling(true);
    try {
      const res = await killProcess(serverId, pid, signal);
      if (res.success) {
        toast.success(`Process ${pid} killed`);
        setSelectedPid(null);
        onRefresh();
      } else {
        toast.error(res.error ?? 'Failed to kill process');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kill failed');
    } finally {
      setKilling(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-30" />;
    return sortAsc ? (
      <ArrowUp size={12} className="text-[rgb(var(--primary))]" />
    ) : (
      <ArrowDown size={12} className="text-[rgb(var(--primary))]" />
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgb(var(--border))] shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgb(var(--muted-foreground))]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search processes…"
            className="w-full pl-8 pr-7 py-1.5 text-[12px] rounded-md border border-[rgb(var(--input))] bg-[rgb(var(--background))] text-[rgb(var(--foreground))] placeholder:text-[rgb(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--ring))]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))]"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Process count */}
        <span className="text-[11px] text-[rgb(var(--muted-foreground))] tabular-nums">
          {filtered.length} / {processes.length} processes
        </span>

        {/* Kill button */}
        {selectedPid && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => handleKill(15)}
              disabled={killing}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 transition-colors disabled:opacity-50"
            >
              End Task
            </button>
            <button
              onClick={() => handleKill(9)}
              disabled={killing}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50"
            >
              <Skull size={11} />
              Force Kill
            </button>
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-[rgb(var(--secondary))] hover:bg-[rgb(var(--secondary))]">
              <TableHead className="w-16 cursor-pointer select-none" onClick={() => toggleSort('pid')}>
                <span className="flex items-center gap-1 text-[11px]">PID <SortIcon field="pid" /></span>
              </TableHead>
              <TableHead className="w-24 cursor-pointer select-none" onClick={() => toggleSort('user')}>
                <span className="flex items-center gap-1 text-[11px]">User <SortIcon field="user" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('command')}>
                <span className="flex items-center gap-1 text-[11px]">Name <SortIcon field="command" /></span>
              </TableHead>
              <TableHead className="w-14 text-right">
                <span className="text-[11px]">Status</span>
              </TableHead>
              <TableHead className="w-16 text-right cursor-pointer select-none" onClick={() => toggleSort('cpu')}>
                <span className="flex items-center gap-1 justify-end text-[11px]">CPU <SortIcon field="cpu" /></span>
              </TableHead>
              <TableHead className="w-16 text-right cursor-pointer select-none" onClick={() => toggleSort('memory')}>
                <span className="flex items-center gap-1 justify-end text-[11px]">Mem <SortIcon field="memory" /></span>
              </TableHead>
              <TableHead className="w-20 text-right cursor-pointer select-none" onClick={() => toggleSort('rss')}>
                <span className="flex items-center gap-1 justify-end text-[11px]">RSS <SortIcon field="rss" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const statBadge = getStatBadge(p.stat);
              // Extract short name from command
              const shortName = p.command.split('/').pop()?.split(' ')[0] ?? p.command;
              return (
                <ContextMenu key={p.pid} onOpenChange={onContextMenuOpenChange}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className={cn(
                        'cursor-pointer transition-colors',
                        selectedPid === p.pid
                          ? 'bg-[rgb(var(--primary))]/10 hover:bg-[rgb(var(--primary))]/15'
                          : 'hover:bg-[rgb(var(--accent))]',
                      )}
                      onClick={() => setSelectedPid(selectedPid === p.pid ? null : p.pid)}
                    >
                      <TableCell className="text-[11px] tabular-nums text-[rgb(var(--muted-foreground))]">
                        {p.pid}
                      </TableCell>
                      <TableCell className="text-[11px] text-[rgb(var(--muted-foreground))]">
                        {p.user}
                      </TableCell>
                      <TableCell className="text-[12px] font-medium text-[rgb(var(--foreground))]">
                        <div className="truncate max-w-70" title={p.command}>{shortName}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={statBadge.variant} className="text-[9px] px-1.5 py-0">
                          {statBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn('text-right text-[11px] tabular-nums font-medium', usageColor(p.cpu))}>
                        {p.cpu.toFixed(1)}%
                      </TableCell>
                      <TableCell className={cn('text-right text-[11px] tabular-nums font-medium', usageColor(p.memory))}>
                        {p.memory.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-[11px] tabular-nums text-[rgb(var(--muted-foreground))]">
                        {formatKb(p.rss)}
                      </TableCell>
                    </TableRow>
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
          </TableBody>
        </Table>
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[rgb(var(--border))] bg-[rgb(var(--secondary))] text-[10px] text-[rgb(var(--muted-foreground))] shrink-0">
        <span>Processes: {processes.length}</span>
        <span className="tabular-nums">
          CPU: {processes.reduce((s, p) => s + p.cpu, 0).toFixed(1)}% ·
          Memory: {processes.reduce((s, p) => s + p.memory, 0).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
