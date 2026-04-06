// M8.8: Logs Section — enhanced journalctl/dmesg/syslog viewer
// Priority filters, date range, grep search, export
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, ScrollText, Search,
  Download, ArrowDown, X, Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { fetchLogInfo, getLogExportUrl } from '@/lib/api';
import type { LogInfo, LogQueryOpts } from '@/lib/api';
import { toast } from 'sonner';

type LogSource = 'journal' | 'dmesg' | 'syslog';

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  '0': { label: 'Emergency', color: 'bg-red-600 text-white' },
  '1': { label: 'Alert', color: 'bg-red-500 text-white' },
  '2': { label: 'Critical', color: 'bg-red-400 text-white' },
  '3': { label: 'Error', color: 'bg-destructive text-destructive-foreground' },
  '4': { label: 'Warning', color: 'bg-warning text-warning-foreground' },
  '5': { label: 'Notice', color: 'bg-blue-500/20 text-blue-400' },
  '6': { label: 'Info', color: 'bg-muted text-muted-foreground' },
  '7': { label: 'Debug', color: 'bg-muted/50 text-muted-foreground' },
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
    <div className="p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">System Logs</h2>
          {data && (
            <Badge variant="secondary" className="text-xs">
              {data.entries.length} entries
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoRefresh ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autoRefresh ? 'Stop auto-refresh' : 'Auto-refresh (5s)'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoScroll ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => setAutoScroll(!autoScroll)}
              >
                <ArrowDown size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{autoScroll ? 'Stop auto-scroll' : 'Auto-scroll to bottom'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport}>
                <Download size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export logs as text file</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Controls — Row 1: Source, Lines, Search */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Source</span>
          <Select value={source} onValueChange={(v) => setSource(v as LogSource)}>
            <SelectTrigger className="w-28 h-7 text-xs">
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
          <span className="text-xs text-muted-foreground">Lines</span>
          <Select value={String(lines)} onValueChange={(v) => setLines(Number(v))}>
            <SelectTrigger className="w-18 h-7 text-xs">
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
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7 pr-7"
              placeholder="Search logs (grep)..."
              value={grepInput}
              onChange={(e) => setGrepInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {grepInput && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => { setGrepInput(''); setGrep(''); }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={handleSearch}>
            Search
          </Button>
        </div>

        {/* Advanced filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1 px-2"
            >
              <Filter size={12} />
              Filters
              {hasActiveFilters && <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">{[unit, priority, since, until, grep].filter(Boolean).length}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <div className="text-sm font-medium">Advanced Filters</div>

              {source === 'journal' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Unit / Service</label>
                  <Input
                    className="h-7 text-xs"
                    placeholder="e.g. nginx, sshd"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              )}

              {source === 'journal' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
                  <Select value={priority || '__all__'} onValueChange={(v) => setPriority(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-7 text-xs">
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
                    <label className="text-xs text-muted-foreground mb-1 block">Since</label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="2025-01-15, yesterday, 1 hour ago"
                      value={since}
                      onChange={(e) => setSince(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Until</label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="2025-01-16, today"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="text-xs h-7 flex-1" onClick={clearFilters}>
                  Clear all
                </Button>
                <Button size="sm" className="text-xs h-7 flex-1" onClick={load}>
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
          <span className="text-[10px] text-muted-foreground mr-1">Priority:</span>
          {Object.entries(PRIORITY_LABELS).map(([val, { label }]) => (
            <button
              key={val}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                priority === val
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
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
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading logs…
        </div>
      ) : error && !data ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <AlertCircle size={24} />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : (
        <div
          ref={logContainerRef}
          className="flex-1 overflow-auto rounded-md border bg-card relative"
        >
          {loading && (
            <div className="absolute top-2 right-2 z-10">
              <Loader2 className="animate-spin text-muted-foreground" size={14} />
            </div>
          )}
          {!data || data.entries.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No log entries found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.entries.map((entry, i) => (
                <div key={i} className="flex gap-3 px-3 py-1 text-xs hover:bg-muted/30 font-mono">
                  <span className="text-muted-foreground shrink-0 w-40">{entry.timestamp || ''}</span>
                  {entry.priority && (
                    <span className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_LABELS[entry.priority]?.color || 'bg-muted text-muted-foreground'}`}>
                      {PRIORITY_LABELS[entry.priority]?.label || `P${entry.priority}`}
                    </span>
                  )}
                  {entry.unit && (
                    <Badge variant="outline" className="text-[10px] shrink-0 h-5">{entry.unit}</Badge>
                  )}
                  <span className="truncate" title={entry.message}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
