// M7.2: Logs Section — journalctl, dmesg, syslog viewer
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, ScrollText } from 'lucide-react';
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
import { fetchLogInfo } from '@/lib/api';
import type { LogInfo } from '@/lib/api';

type LogSource = 'journal' | 'dmesg' | 'syslog';

export function LogsSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<LogInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<LogSource>('journal');
  const [unit, setUnit] = useState('');
  const [lines, setLines] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLogInfo(serverId, {
        source,
        unit: unit || undefined,
        lines,
      });
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
  }, [serverId, source, unit, lines]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">System Logs</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Source</span>
          <Select value={source} onValueChange={(v) => setSource(v as LogSource)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="journal">journalctl</SelectItem>
              <SelectItem value="dmesg">dmesg</SelectItem>
              <SelectItem value="syslog">syslog</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {source === 'journal' && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Unit</span>
            <Input
              className="w-36 h-8 text-xs"
              placeholder="e.g. nginx"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Lines</span>
          <Select value={String(lines)} onValueChange={(v) => setLines(Number(v))}>
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading logs…
        </div>
      ) : error || !data ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <AlertCircle size={24} />
          <p className="text-sm">{error || 'No data'}</p>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-md border bg-card">
          {data.entries.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No log entries found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.entries.map((entry, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 text-xs hover:bg-muted/30">
                  <span className="text-muted-foreground shrink-0 w-44 font-mono">{entry.timestamp}</span>
                  {entry.unit && (
                    <Badge variant="outline" className="text-[10px] shrink-0 h-5">{entry.unit}</Badge>
                  )}
                  <span className="font-mono truncate" title={entry.message}>{entry.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
