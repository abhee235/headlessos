// M8.7: Network Section — listening ports, routes, DNS, interfaces, hostname management
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Wifi, Pencil, ArrowUpCircle, ArrowDownCircle, Save, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchNetworkInfo, setHostname, setDnsConfig, setInterfaceUp, setInterfaceDown } from '@/lib/api';
import type { NetworkInfo } from '@/lib/api';
import { toast } from 'sonner';

export function NetworkSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Hostname editing
  const [editingHostname, setEditingHostname] = useState(false);
  const [hostnameInput, setHostnameInput] = useState('');

  // DNS editing
  const [editingDns, setEditingDns] = useState(false);
  const [dnsInput, setDnsInput] = useState('');
  const [searchDomainsInput, setSearchDomainsInput] = useState('');

  // Interface confirm
  const [confirmInterface, setConfirmInterface] = useState<{ name: string; action: 'up' | 'down' } | null>(null);

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

  // ── Hostname ────────────────────────────────
  const openHostnameEdit = () => {
    setHostnameInput(data?.hostname || '');
    setEditingHostname(true);
  };

  const handleSaveHostname = async () => {
    const h = hostnameInput.trim();
    if (!h) { toast.error('Hostname cannot be empty'); return; }
    setBusy(true);
    try {
      const res = await setHostname(serverId, h);
      if (res.success) {
        toast.success(res.message || 'Hostname updated');
        setEditingHostname(false);
        await load();
      } else {
        toast.error(res.error || 'Failed to set hostname');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // ── DNS ─────────────────────────────────────
  const openDnsEdit = () => {
    setDnsInput(data?.dns.nameservers.join(', ') || '');
    setSearchDomainsInput(data?.dns.searchDomains.join(', ') || '');
    setEditingDns(true);
  };

  const handleSaveDns = async () => {
    const nameservers = dnsInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (nameservers.length === 0) { toast.error('At least one nameserver required'); return; }
    const searchDomains = searchDomainsInput.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const res = await setDnsConfig(serverId, nameservers, searchDomains.length > 0 ? searchDomains : undefined);
      if (res.success) {
        toast.success(res.message || 'DNS updated');
        setEditingDns(false);
        await load();
      } else {
        toast.error(res.error || 'Failed to set DNS');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  // ── Interface toggle ────────────────────────
  const handleInterfaceToggle = async () => {
    if (!confirmInterface) return;
    setBusy(true);
    try {
      const res = confirmInterface.action === 'up'
        ? await setInterfaceUp(serverId, confirmInterface.name)
        : await setInterfaceDown(serverId, confirmInterface.name);
      if (res.success) {
        toast.success(res.message || `Interface ${confirmInterface.name} ${confirmInterface.action}`);
        setConfirmInterface(null);
        await load();
      } else {
        toast.error(res.error || 'Failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

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
      {/* Header with hostname */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Network</h2>
          {data.hostname && !editingHostname && (
            <div className="flex items-center gap-1.5 ml-2">
              <Badge variant="outline" className="font-mono text-xs">{data.hostname}</Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openHostnameEdit} disabled={busy} title="Change hostname">
                <Pencil size={12} />
              </Button>
            </div>
          )}
          {editingHostname && (
            <div className="flex items-center gap-2 ml-2">
              <Input
                value={hostnameInput}
                onChange={e => setHostnameInput(e.target.value)}
                className="h-7 w-48 text-xs font-mono"
                placeholder="new-hostname"
                disabled={busy}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveHostname(); if (e.key === 'Escape') setEditingHostname(false); }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void handleSaveHostname()} disabled={busy}>
                <Save size={12} />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingHostname(false)} disabled={busy}>
                <X size={12} />
              </Button>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh" disabled={busy}>
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
          <TabsTrigger value="interfaces">
            Interfaces <Badge variant="secondary" className="ml-1.5 text-xs">{data.interfaces?.length ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="dns">DNS</TabsTrigger>
        </TabsList>

        {/* Ports */}
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

        {/* Connections */}
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

        {/* Interfaces */}
        <TabsContent value="interfaces" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-20">State</TableHead>
                <TableHead>MAC Address</TableHead>
                <TableHead className="w-20">MTU</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.interfaces ?? []).map((iface) => (
                <TableRow key={iface.name}>
                  <TableCell className="font-mono text-xs font-medium">{iface.name}</TableCell>
                  <TableCell>
                    <Badge variant={iface.state === 'UP' ? 'success' : iface.state === 'DOWN' ? 'destructive' : 'secondary'} className="text-xs">
                      {iface.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{iface.mac || '-'}</TableCell>
                  <TableCell className="text-xs">{iface.mtu ?? '-'}</TableCell>
                  <TableCell className="text-xs">{iface.type || '-'}</TableCell>
                  <TableCell className="text-right">
                    {iface.name !== 'lo' && (
                      iface.state === 'UP' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive"
                          onClick={() => setConfirmInterface({ name: iface.name, action: 'down' })}
                          disabled={busy}
                        >
                          <ArrowDownCircle size={14} className="mr-1" /> Down
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-green-600"
                          onClick={() => setConfirmInterface({ name: iface.name, action: 'up' })}
                          disabled={busy}
                        >
                          <ArrowUpCircle size={14} className="mr-1" /> Up
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!data.interfaces || data.interfaces.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No interface data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* Routes */}
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

        {/* DNS */}
        <TabsContent value="dns" className="mt-3">
          <div className="space-y-3">
            {!editingDns ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Nameservers</h3>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openDnsEdit} disabled={busy}>
                    <Pencil size={12} className="mr-1" /> Edit DNS
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.dns.nameservers.map((ns, i) => (
                    <Badge key={i} variant="outline" className="font-mono">{ns}</Badge>
                  ))}
                  {data.dns.nameservers.length === 0 && (
                    <span className="text-sm text-muted-foreground">None configured</span>
                  )}
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
              </>
            ) : (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <h3 className="font-medium text-sm">Edit DNS Configuration</h3>
                <div className="space-y-1">
                  <Label className="text-xs">Nameservers (comma-separated)</Label>
                  <Input
                    value={dnsInput}
                    onChange={e => setDnsInput(e.target.value)}
                    placeholder="8.8.8.8, 8.8.4.4"
                    className="font-mono text-sm"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Search Domains (comma-separated, optional)</Label>
                  <Input
                    value={searchDomainsInput}
                    onChange={e => setSearchDomainsInput(e.target.value)}
                    placeholder="example.com, local.lan"
                    className="font-mono text-sm"
                    disabled={busy}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => void handleSaveDns()} disabled={busy || !dnsInput.trim()}>
                    {busy && <Loader2 size={14} className="animate-spin mr-1" />}
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingDns(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Interface confirm */}
      <ConfirmDialog
        open={confirmInterface !== null}
        onOpenChange={(open) => { if (!open) setConfirmInterface(null); }}
        title={`Bring ${confirmInterface?.name ?? ''} ${confirmInterface?.action ?? ''}`}
        description={`Are you sure you want to bring interface ${confirmInterface?.name} ${confirmInterface?.action}?${confirmInterface?.action === 'down' ? ' This may disconnect you if it is the main network interface.' : ''}`}
        confirmLabel={confirmInterface?.action === 'down' ? 'Bring Down' : 'Bring Up'}
        variant={confirmInterface?.action === 'down' ? 'destructive' : 'default'}
        onConfirm={() => { void handleInterfaceToggle(); }}
      />
    </div>
  );
}
