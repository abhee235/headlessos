// M7.2: Network Section — listening ports, routes, DNS, active connections
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Wifi } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fetchNetworkInfo } from '@/lib/api';
import type { NetworkInfo } from '@/lib/api';

export function NetworkSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNetworkInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch network info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch network info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading network info…
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
          <Wifi size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Network</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      <Tabs defaultValue="ports">
        <TabsList>
          <TabsTrigger value="ports">
            Listening Ports <Badge variant="secondary" className="ml-1.5 text-xs">{data.ports.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="connections">
            Connections <Badge variant="secondary" className="ml-1.5 text-xs">{data.connections.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="dns">DNS</TabsTrigger>
        </TabsList>

        <TabsContent value="ports" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Proto</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="w-20">Port</TableHead>
                <TableHead>Process</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ports.map((p, i) => (
                <TableRow key={i}>
                  <TableCell><Badge variant="outline" className="text-xs">{p.protocol}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{p.localAddress}</TableCell>
                  <TableCell className="font-mono text-xs">{p.localPort}</TableCell>
                  <TableCell className="text-xs">{p.process}{p.pid ? ` (${p.pid})` : ''}</TableCell>
                </TableRow>
              ))}
              {data.ports.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No listening ports</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="connections" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Proto</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Remote</TableHead>
                <TableHead className="w-24">State</TableHead>
                <TableHead>Process</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.connections.map((c, i) => (
                <TableRow key={i}>
                  <TableCell><Badge variant="outline" className="text-xs">{c.protocol}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{c.localAddress}:{c.localPort}</TableCell>
                  <TableCell className="font-mono text-xs">{c.remoteAddress}:{c.remotePort}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{c.state}</Badge></TableCell>
                  <TableCell className="text-xs">{c.process || '-'}</TableCell>
                </TableRow>
              ))}
              {data.connections.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No active connections</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="routes" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destination</TableHead>
                <TableHead>Gateway</TableHead>
                <TableHead>Interface</TableHead>
                <TableHead>Metric</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.routes.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.destination}</TableCell>
                  <TableCell className="font-mono text-xs">{r.gateway || '-'}</TableCell>
                  <TableCell className="text-xs">{r.interface}</TableCell>
                  <TableCell className="text-xs">{r.metric ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="dns" className="mt-3">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium mb-1">Nameservers</h3>
              <div className="flex flex-wrap gap-2">
                {data.dns.nameservers.map((ns, i) => (
                  <Badge key={i} variant="outline" className="font-mono">{ns}</Badge>
                ))}
                {data.dns.nameservers.length === 0 && (
                  <span className="text-sm text-muted-foreground">None configured</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">Search Domains</h3>
              <div className="flex flex-wrap gap-2">
                {data.dns.searchDomains.map((d, i) => (
                  <Badge key={i} variant="outline" className="font-mono">{d}</Badge>
                ))}
                {data.dns.searchDomains.length === 0 && (
                  <span className="text-sm text-muted-foreground">None configured</span>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
