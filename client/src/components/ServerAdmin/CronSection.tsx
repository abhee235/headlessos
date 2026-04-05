// M7.2: Cron Section — cron jobs list
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchCronInfo } from '@/lib/api';
import type { CronInfo } from '@/lib/api';

export function CronSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<CronInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCronInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch cron info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cron info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading cron jobs…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle size={24} />
        <p className="text-sm">{error || 'No data'}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  const allJobs = data.jobs;

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Scheduled Jobs</h2>
          <Badge variant="secondary" className="text-xs">{allJobs.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      {allJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Clock size={32} className="opacity-40 mb-2" />
          <p className="text-sm">No cron jobs found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Schedule</TableHead>
              <TableHead>Command</TableHead>
              <TableHead className="w-24">Source</TableHead>
              <TableHead className="w-28">Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allJobs.map((job, i) => (
              <TableRow key={`${job.source}-${i}`}>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {job.schedule}
                  </code>
                </TableCell>
                <TableCell className="font-mono text-xs max-w-md truncate" title={job.command}>
                  {job.command}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{job.source}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{job.description || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
