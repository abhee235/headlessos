// M7.2: Storage Section — directory sizes, mount points, swap
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { fetchStorageInfo } from '@/lib/api';
import type { StorageInfo } from '@/lib/api';

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
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading storage info…
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

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Storage</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      <Tabs defaultValue="mounts">
        <TabsList>
          <TabsTrigger value="mounts">
            Mount Points <Badge variant="secondary" className="ml-1 text-xs">{data.mounts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="directories">
            Directory Sizes <Badge variant="secondary" className="ml-1 text-xs">{data.dirSizes.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="swap">
            Swap <Badge variant="secondary" className="ml-1 text-xs">{data.swap.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mounts">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>FS Type</TableHead>

                <TableHead>Options</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.mounts.map((m) => (
                <TableRow key={m.target}>
                  <TableCell className="font-mono text-xs">{m.source}</TableCell>
                  <TableCell className="font-mono text-xs">{m.target}</TableCell>
                  <TableCell className="text-xs">{m.fstype}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={m.options}>
                    {m.options || '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.mounts.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No mount points found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="directories">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Directory</TableHead>
                <TableHead className="w-32">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dirSizes.map((d) => (
                <TableRow key={d.path}>
                  <TableCell className="font-mono text-xs">{d.path}</TableCell>
                  <TableCell className="text-sm font-medium">{d.size}</TableCell>
                </TableRow>
              ))}
              {data.dirSizes.length === 0 && (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No directory data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="swap">
          {data.swap.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              No swap configured
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead className="w-20">Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.swap.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-mono text-xs">{s.name}</TableCell>
                    <TableCell className="text-xs">{s.type}</TableCell>
                    <TableCell className="text-xs">{s.size}</TableCell>
                    <TableCell className="text-xs">{s.used}</TableCell>
                    <TableCell className="text-xs">{s.priority}</TableCell>
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
