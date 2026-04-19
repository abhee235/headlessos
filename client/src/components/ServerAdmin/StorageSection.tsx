// M7.2: Storage Section — directory sizes, mount points, swap
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fetchStorageInfo } from '@/lib/api';
import type { StorageInfo } from '@/lib/api';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';

export function StorageSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStorageInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch storage info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch storage info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <LoadingView label="Loading storage info…" fullHeight={false} />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <AlertCircle size={24} />
        <p className="text-sm">{error || 'No data'}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="@container p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HardDrive size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Storage</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} title="Refresh"><RefreshCw size={16} /></Button>
      </div>

      <Tabs defaultValue="mounts">
        <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
          <TabsTrigger value="mounts" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            Mount Points
            <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{data.mounts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="directories" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            Directory Sizes
            <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{data.dirSizes.length}</span>
          </TabsTrigger>
          <TabsTrigger value="swap" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            Swap
            <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{data.swap.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mounts" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Source</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Target</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">FS Type</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Options</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mounts.map((m) => (
                  <TableRow key={m.target} className="border-0 hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-foreground/70">{m.source}</TableCell>
                    <TableCell className="font-mono text-xs font-medium">{m.target}</TableCell>
                    <TableCell className="text-xs text-foreground/50">{m.fstype}</TableCell>
                    <TableCell className="text-xs text-foreground/50 max-w-48 truncate" title={m.options}>
                      {m.options || '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {data.mounts.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-foreground/30 py-12 text-sm">No mount points found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
        </TabsContent>

        <TabsContent value="directories" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Directory</TableHead>
                  <TableHead className="w-32 text-xs font-medium text-foreground/40 h-9">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dirSizes.map((d) => (
                  <TableRow key={d.path} className="border-0 hover:bg-muted/20">
                    <TableCell className="font-mono text-xs text-foreground/70">{d.path}</TableCell>
                    <TableCell className="text-xs font-medium tabular-nums">{d.size}</TableCell>
                  </TableRow>
                ))}
                {data.dirSizes.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-foreground/30 py-12 text-sm">No directory data</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
        </TabsContent>

        <TabsContent value="swap" className="mt-4">
          {data.swap.length === 0 ? (
            <div className="flex items-center justify-center text-foreground/30 text-sm py-12">
              No swap configured
            </div>
          ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Name</TableHead>
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Type</TableHead>
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Size</TableHead>
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Used</TableHead>
                    <TableHead className="w-20 text-xs font-medium text-foreground/40 h-9">Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.swap.map((s) => (
                    <TableRow key={s.name} className="border-0 hover:bg-muted/20">
                      <TableCell className="font-mono text-xs font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-foreground/50">{s.type}</TableCell>
                      <TableCell className="text-xs tabular-nums">{s.size}</TableCell>
                      <TableCell className="text-xs tabular-nums">{s.used}</TableCell>
                      <TableCell className="text-xs tabular-nums">{s.priority}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
