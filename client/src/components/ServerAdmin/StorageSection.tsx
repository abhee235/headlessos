// M7.2: Storage Section — directory sizes, mount points, swap
// EX8.6: LumenOS v3 — section header, lit segmented tabs, glass table cards.
// @see docs/phases/phase-7.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import { fetchStorageInfo } from '@/lib/api';
import type { StorageInfo } from '@/lib/api';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, SegmentTabs, TableCard, HeadRow, Th, Tr, Td,
  EmptyRow, MonoChip, ErrorState,
} from './admin-ui';

export function StorageSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Active sub-tab (controlled so the active pill can be lit)
  const [tab, setTab] = useState('mounts');

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
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  return (
    <SectionBody>
      <SectionHeader
        icon={HardDrive}
        title="Storage"
        subtitle={`${data.mounts.length} mount points · ${data.swap.length} swap`}
        actions={<RefreshButton onClick={load} />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <SegmentTabs
          value={tab}
          items={[
            { value: 'mounts', label: 'Mount points', count: data.mounts.length },
            { value: 'directories', label: 'Directory sizes', count: data.dirSizes.length },
            { value: 'swap', label: 'Swap', count: data.swap.length },
          ]}
        />

        <TabsContent value="mounts" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th>Source</Th>
                  <Th>Target</Th>
                  <Th>FS Type</Th>
                  <Th>Options</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.mounts.map((m) => (
                  <Tr key={m.target}>
                    <Td className="font-mono text-label-2">{m.source}</Td>
                    <Td className="font-mono font-semibold text-foreground">{m.target}</Td>
                    <Td>
                      <MonoChip>{m.fstype}</MonoChip>
                    </Td>
                    <Td className="text-[13px] text-label-3" title={m.options}>
                      <div className="max-w-[260px] truncate">{m.options || '—'}</div>
                    </Td>
                  </Tr>
                ))}
                {data.mounts.length === 0 && (
                  <EmptyRow colSpan={4}>No mount points found</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="directories" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th>Directory</Th>
                  <Th className="w-32 text-right">Size</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.dirSizes.map((d) => (
                  <Tr key={d.path}>
                    <Td className="font-mono text-foreground">{d.path}</Td>
                    <Td className="text-right font-mono font-semibold tabular-nums text-foreground">{d.size}</Td>
                  </Tr>
                ))}
                {data.dirSizes.length === 0 && (
                  <EmptyRow colSpan={2}>No directory data</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="swap" className="mt-4">
          {data.swap.length === 0 ? (
            <TableCard className="py-12 text-center text-[13px] text-label-3">
              No swap configured
            </TableCard>
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <HeadRow>
                    <Th>Name</Th>
                    <Th>Type</Th>
                    <Th>Size</Th>
                    <Th>Used</Th>
                    <Th className="w-24">Priority</Th>
                  </HeadRow>
                </TableHeader>
                <TableBody>
                  {data.swap.map((s) => (
                    <Tr key={s.name}>
                      <Td className="font-mono font-semibold text-foreground">{s.name}</Td>
                      <Td className="text-label-2">{s.type}</Td>
                      <Td className="font-mono tabular-nums">{s.size}</Td>
                      <Td className="font-mono tabular-nums">{s.used}</Td>
                      <Td className="tabular-nums text-label-2">{s.priority}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </TabsContent>
      </Tabs>
    </SectionBody>
  );
}
