// M8.8: Logs Section — enhanced journalctl/dmesg/syslog viewer
// Priority filters, date range, grep search, export
// EX8.6: LumenOS v3 — section header, glass pill controls, tinted priority chips, paper log pane.
// @see docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RotateCw,
  AlertCircle,
  ScrollText,
  Download,
  ArrowDown,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  SectionBody, SectionHeader, RefreshButton, SearchField, CountChip, FIELD_LABEL, EmptyState,
} from './admin-ui';

type LogSource = 'journal' | 'dmesg' | 'syslog';

const SOURCE_LABELS: Record<LogSource, string> = {
  journal: 'journalctl',
  dmesg: 'dmesg',
  syslog: 'syslog',
};

// Semantic colors: danger = emerg…err, warning = caution, accent = notice, neutral = info/debug
const DANGER = {
  color: 'bg-danger/14 text-danger',
  chipActive: 'bg-danger/25 text-danger border-danger/50',
  chipInactive: 'bg-danger/10 text-danger border-danger/25',
};
const PRIORITY_LABELS: Record<string, { label: string; color: string; chipActive: string; chipInactive: string }> = {
  '0': { label: 'Emergency', ...DANGER },
  '1': { label: 'Alert', ...DANGER },
  '2': { label: 'Critical', ...DANGER },
  '3': { label: 'Error', ...DANGER },
  '4': { label: 'Warning', color: 'bg-warning/14 text-warning', chipActive: 'bg-warning/25 text-warning border-warning/50', chipInactive: 'bg-warning/10 text-warning border-warning/25' },
  '5': { label: 'Notice', color: 'bg-accent-soft text-accent-text', chipActive: 'bg-accent-solid/25 text-accent-text border-accent-solid/50', chipInactive: 'bg-accent-soft text-accent-text border-accent-solid/25' },
  '6': { label: 'Info', color: 'bg-fill text-label-2', chipActive: 'bg-fill-2 text-foreground border-edge-2', chipInactive: 'bg-fill text-label-2 border-edge' },
  '7': { label: 'Debug', color: 'bg-fill text-label-3', chipActive: 'bg-fill-2 text-foreground border-edge-2', chipInactive: 'bg-fill text-label-3 border-edge' },
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
    <SectionBody className="flex h-full flex-col gap-3 space-y-0">
      {/* Header */}
      <SectionHeader
        icon={ScrollText}
        title="System logs"
        badge={data && (
          <Badge variant="secondary" className="tabular-nums">
            {data.entries.length} entries
          </Badge>
        )}
        subtitle={`${SOURCE_LABELS[source]} · last ${lines} lines`}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoRefresh ? 'default' : 'secondary'}
                  size="icon"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  <RotateCw strokeWidth={1.75} className={autoRefresh ? 'animate-spin' : ''} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoRefresh ? 'Stop auto-refresh' : 'Auto-refresh (5s)'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={autoScroll ? 'default' : 'secondary'}
                  size="icon"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  <ArrowDown strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{autoScroll ? 'Stop auto-scroll' : 'Auto-scroll to bottom'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" onClick={handleExport}>
                  <Download strokeWidth={1.75} />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export logs as text file</TooltipContent>
            </Tooltip>
            <RefreshButton onClick={load} />
          </>
        }
      />

      {/* Controls — Row 1: Source, Lines, Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className={FIELD_LABEL}>Source</span>
          <Select value={source} onValueChange={(v) => setSource(v as LogSource)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="journal">journalctl</SelectItem>
              <SelectItem value="dmesg">dmesg</SelectItem>
              <SelectItem value="syslog">syslog</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className={FIELD_LABEL}>Lines</span>
          <Select value={String(lines)} onValueChange={(v) => setLines(Number(v))}>
            <SelectTrigger className="w-24">
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
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <SearchField
            wrapperClassName="w-auto flex-1"
            className="h-[34px]"
            placeholder="Search logs (grep)..."
            value={grepInput}
            onValueChange={setGrepInput}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            onClear={() => { setGrepInput(''); setGrep(''); }}
          />
          <Button variant="secondary" onClick={handleSearch}>
            Search
          </Button>
        </div>

        {/* Advanced filters popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={hasActiveFilters ? 'default' : 'secondary'}>
              <Filter strokeWidth={1.75} />
              Filters
              {hasActiveFilters && <CountChip lit>{[unit, priority, since, until, grep].filter(Boolean).length}</CountChip>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-3">
              <div className="text-[15px] font-bold text-foreground">Advanced Filters</div>

              {source === 'journal' && (
                <div>
                  <label className={`${FIELD_LABEL} mb-1.5 block`}>Unit / Service</label>
                  <Input
                    placeholder="e.g. nginx, sshd"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              )}

              {source === 'journal' && (
                <div>
                  <label className={`${FIELD_LABEL} mb-1.5 block`}>Priority</label>
                  <Select value={priority || '__all__'} onValueChange={(v) => setPriority(v === '__all__' ? '' : v)}>
                    <SelectTrigger>
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
                    <label className={`${FIELD_LABEL} mb-1.5 block`}>Since</label>
                    <Input
                      placeholder="2025-01-15, yesterday, 1 hour ago"
                      value={since}
                      onChange={(e) => setSince(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={`${FIELD_LABEL} mb-1.5 block`}>Until</label>
                    <Input
                      placeholder="2025-01-16, today"
                      value={until}
                      onChange={(e) => setUntil(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="secondary" size="sm" className="flex-1" onClick={clearFilters}>
                  Clear all
                </Button>
                <Button size="sm" className="flex-1" onClick={load}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Priority quick-filter chips (journal only) */}
      {source === 'journal' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`${FIELD_LABEL} mr-1`}>Priority</span>
          {Object.entries(PRIORITY_LABELS).map(([val, { label, chipActive, chipInactive }]) => (
            <button
              key={val}
              className={cn(
                'h-6 rounded-[6px] border px-2.5 text-[11px] font-semibold transition-colors duration-150',
                priority === val ? chipActive : chipInactive,
              )}
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
        <EmptyState
          icon={AlertCircle}
          title={error}
          className="flex-1"
          action={<Button variant="secondary" size="sm" onClick={load}>Retry</Button>}
        />
      ) : (
        <div
          ref={logContainerRef}
          className="relative min-h-0 flex-1 overflow-auto rounded-[20px] border border-edge bg-paper py-2 shadow-[var(--lumen-spec)]"
        >
          {loading && (
            <div className="absolute right-3 top-3 z-10">
              <Spinner className="text-label-3" size={14} />
            </div>
          )}
          {!data || data.entries.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-[13px] text-label-3">
              No log entries found
            </div>
          ) : (
            <div>
              {data.entries.map((entry, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-1.5 font-mono text-[12px] transition-colors duration-150 hover:bg-fill">
                  <span className="w-44 shrink-0 tabular-nums text-label-3">{entry.timestamp || ''}</span>
                  {entry.priority && (
                    <span className={cn('shrink-0 rounded-[5px] px-1.5 py-0.5 text-[11px] font-bold leading-none', PRIORITY_LABELS[entry.priority]?.color || 'bg-fill text-label-2')}>
                      {PRIORITY_LABELS[entry.priority]?.label || `P${entry.priority}`}
                    </span>
                  )}
                  {entry.unit && (
                    <span className="shrink-0 rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-accent-text">{entry.unit}</span>
                  )}
                  <span className="truncate text-foreground" title={entry.message}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionBody>
  );
}
