// M8.8: Logs Section — enhanced journalctl/dmesg/syslog viewer
// Priority filters, date range, grep search, export
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw, AlertCircle, ScrollText, Search, Download, ArrowDown, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchLogInfo, getLogExportUrl } from '@/lib/api';
import type { LogInfo, LogQueryOpts } from '@/lib/api';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';

type LogSource = 'journal' | 'dmesg' | 'syslog';

// Semantic colors: destructive=danger, warning=caution, blue=info, gray=neutral
const PRIORITY_LABELS: Record<string, { label: string; color: string; chipActive: string; chipInactive: string }> = {
  '0': { label: 'Emergency', color: 'bg-destructive/10 text-destructive', chipActive: 'bg-destructive/20 text-destructive border-destructive/40', chipInactive: 'bg-destructive/10 text-destructive/80 border-destructive/20' },
  '1': { label: 'Alert', color: 'bg-destructive/10 text-destructive', chipActive: 'bg-destructive/20 text-destructive border-destructive/40', chipInactive: 'bg-destructive/10 text-destructive/80 border-destructive/20' },
  '2': { label: 'Critical', color: 'bg-destructive/10 text-destructive', chipActive: 'bg-destructive/20 text-destructive border-destructive/40', chipInactive: 'bg-destructive/10 text-destructive/80 border-destructive/20' },
  '3': { label: 'Error', color: 'bg-destructive/10 text-destructive', chipActive: 'bg-destructive/20 text-destructive border-destructive/40', chipInactive: 'bg-destructive/10 text-destructive/80 border-destructive/20' },
  '4': { label: 'Warning', color: 'bg-warning/10 text-warning', chipActive: 'bg-warning/20 text-warning border-warning/40', chipInactive: 'bg-warning/10 text-warning/80 border-warning/20' },
  '5': { label: 'Notice', color: 'bg-blue-500/10 text-blue-500', chipActive: 'bg-blue-500/20 text-blue-600 border-blue-500/40', chipInactive: 'bg-blue-500/10 text-blue-500/80 border-blue-500/20' },
  '6': { label: 'Info', color: 'bg-foreground/5 text-foreground/50', chipActive: 'bg-foreground/15 text-foreground/80 border-foreground/25', chipInactive: 'bg-foreground/8 text-foreground/50 border-foreground/12' },
  '7': { label: 'Debug', color: 'bg-foreground/5 text-foreground/30', chipActive: 'bg-foreground/12 text-foreground/70 border-foreground/20', chipInactive: 'bg-foreground/6 text-foreground/40 border-foreground/10' },
};

export function LogsSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<LogInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [source, setSource] = useState<LogSource>('journal');
  const [unit, setUnit] = useState('');
  const [lines, setLines] = useState(100);
  const [priority, setPriority] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [grep, setGrep] = useState('');
  const [grepInput, setGrepInput] = useState('');

  // Auto-scroll
  const [autoScroll, setAutoScroll] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildOpts = useCallback((): LogQueryOpts => ({
    source,
    unit: unit || undefined,
    lines,
    priority: priority || undefined,
    since: since || undefined,
    until: until || undefined,
    grep: grep || undefined,
  }), [source, unit, lines, priority, since, until, grep]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLogInfo(serverId, buildOpts());
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [serverId, buildOpts]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [data, autoScroll]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { load(); }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, load]);

  const handleSearch = () => {
    setGrep(grepInput);
  };

  const handleExport = () => {
    const url = getLogExportUrl(serverId, buildOpts());
    window.open(url, '_blank');
    toast.success('Downloading log export...');
  };

  const clearFilters = () => {
    setUnit('');
    setPriority('');
    setSince('');
    setUntil('');
    setGrep('');
    setGrepInput('');
  };

  const hasActiveFilters = !!(unit || priority || since || until || grep);

  return (
    <div className="@container p-6 flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <ScrollText size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">System Logs</h2>
          {data && (
            <span className="text-xs tabular-nums text-foreground/50 bg-foreground/5 px-2 py-0.5 rounded-full">
              {data.entries.length} entries
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoRefresh ? 'default' : 'ghost'}
                size="icon"
                className={cn("h-8 w-8", !autoRefresh && "text-foreground/30 hover:text-foreground")}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autoRefresh ? 'Stop auto-refresh' : 'Auto-refresh (5s)'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoScroll ? 'default' : 'ghost'}
                size="icon"
                className={cn("h-8 w-8", !autoScroll && "text-foreground/30 hover:text-foreground")}
                onClick={() => setAutoScroll(!autoScroll)}
              >
                <ArrowDown size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autoScroll ? 'Stop auto-scroll' : 'Auto-scroll to bottom'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={handleExport}>
                <Download size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export logs as text file</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Controls — Row 1: Source, Lines, Search */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-foreground/40">Source</span>
          <Select value={source} onValueChange={(v) => setSource(v as LogSource)}>
            <SelectTrigger className="w-28 h-8 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="journal">journalctl</SelectItem>
              <SelectItem value="dmesg">dmesg</SelectItem>
              <SelectItem value="syslog">syslog</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-foreground/40">Lines</span>
          <Select value={String(lines)} onValueChange={(v) => setLines(Number(v))}>
            <SelectTrigger className="w-18 h-8 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="1000">1000</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-1 flex-1 min-w-48">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/30" />
            <Input
              className="h-8 text-xs pl-8 pr-7 bg-muted/30 border shadow-none"
              placeholder="Search logs (grep)..."
              value={grepInput}
              onChange={(e) => setGrepInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {grepInput && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
                onClick={() => { setGrepInput(''); setGrep(''); }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs px-2 border-border/50" onClick={handleSearch}>
            Search
          </Button>
        </div>

        {/* Advanced filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1 px-2 border-border/50"
            >
              <Filter size={12} />
              Filters
              {hasActiveFilters && <span className="text-[10px] tabular-nums bg-foreground/10 text-foreground/60 px-1.5 py-0 rounded-full ml-1">{[unit, priority, since, until, grep].filter(Boolean).length}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground/70">Advanced Filters</div>

              {source === 'journal' && (
                <div>
                  <label className="text-xs text-foreground/40 mb-1 block">Unit / Service</label>
                  <Input
                    className="h-8 text-xs shadow-none"
                    placeholder="e.g. nginx, sshd"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              )}

              {source === 'journal' && (
                <div>
                  <label className="text-xs text-foreground/40 mb-1 block">Priority</label>
                  <Select value={priority || '__all__'} onValueChange={(v) => setPriority(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs shadow-none">
                      <SelectValue placeholder="All priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All priorities</SelectItem>
                      {Object.entries(PRIORITY_LABELS).map(([val, { label }]) => (
                        <SelectItem key={val} value={val}>{val} — {label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {source === 'journal' && (
                <>
                  <div>
                    <label className="text-xs text-foreground/40 mb-1 block">Since</label>
                    <Input
                      className="h-8 text-xs shadow-none"
                      placeholder="2025-01-15, yesterday, 1 hour ago"
                      value={since}
                      onChange={(e) => setSince(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-foreground/40 mb-1 block">Until</label>
                    <Input
                      className="h-8 text-xs shadow-none"
                      placeholder="2025-01-16, today"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="text-xs h-8 flex-1" onClick={clearFilters}>
                  Clear all
                </Button>
                <Button size="sm" className="text-xs h-8 flex-1" onClick={load}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Priority quick-filter chips (journal only) */}
      {source === 'journal' && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <span className="text-[10px] text-foreground/40 mr-1">Priority:</span>
          {Object.entries(PRIORITY_LABELS).map(([val, { label, chipActive, chipInactive }]) => (
            <button
              key={val}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border ${
                priority === val ? chipActive : chipInactive
              }`}
              onClick={() => setPriority(priority === val ? '' : val)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading && !data ? (
        <div className="flex-1">
          <LoadingView label="Loading logs…" />
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-foreground/40">
          <AlertCircle size={24} />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : (
        <div
          ref={logContainerRef}
          className="flex-1 overflow-auto rounded-lg bg-muted/20 relative"
        >
          {loading && (
            <div className="absolute top-2 right-2 z-10">
              <Spinner className="text-foreground/40" size={14} />
            </div>
          )}
          {!data || data.entries.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-foreground/30 text-sm">
              No log entries found
            </div>
          ) : (
            <div className="divide-y divide-foreground/5">
              {data.entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-foreground/5 font-mono">
                  <span className="text-foreground/30 shrink-0 w-44 text-[11px] tabular-nums">{entry.timestamp || ''}</span>
                  {entry.priority && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-semibold leading-none ${PRIORITY_LABELS[entry.priority]?.color || 'bg-foreground/5 text-foreground/50'}`}>
                      {PRIORITY_LABELS[entry.priority]?.label || `P${entry.priority}`}
                    </span>
                  )}
                  {entry.unit && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium leading-none bg-primary/8 text-primary/70">{entry.unit}</span>
                  )}
                  <span className="truncate text-foreground/80" title={entry.message}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
