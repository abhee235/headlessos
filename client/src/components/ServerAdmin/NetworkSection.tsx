// M8.7: Network Section — listening ports, routes, DNS, interfaces, hostname management
// EX8.6: LumenOS v3 — section header, lit segmented tabs, pill search, glass table cards.
// @see docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import {
  Network, Pencil, ArrowUpCircle, ArrowDownCircle, Save, X, Globe, Lock, Eye, Ban, FileText, Circle, Target, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchNetworkInfo, setHostname, setDnsConfig, setInterfaceUp, setInterfaceDown } from '@/lib/api';
import type { NetworkInfo } from '@/lib/api';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, SegmentTabs, SearchField, TableCard, HeadRow, Th, Tr, Td,
  EmptyRow, MonoChip, RoundIconButton, RowMenuButton, Panel, PanelTitle, FIELD_LABEL, ErrorState,
} from './admin-ui';

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

  // Port search filter (must be before any early returns to satisfy hooks rules)
  const [portSearch, setPortSearch] = useState('');

  // Active sub-tab (controlled so the active pill can be lit)
  const [tab, setTab] = useState('ports');

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

  // ── Action handlers ──────────────────────────
  const openHostnameEdit = () => {
    setHostnameInput(data?.hostname || '');
    setEditingHostname(true);
  };

  const handleSaveHostname = async () => {
    const h = hostnameInput.trim();
    if (!h) return;
    setBusy(true);
    try {
      const res = await setHostname(serverId, h);
      if (res.success) { toast.success(`Hostname set to ${h}`); await load(); }
      else toast.error(res.error || 'Failed to set hostname');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set hostname');
    } finally {
      setBusy(false);
      setEditingHostname(false);
    }
  };

  const openDnsEdit = () => {
    setDnsInput(data?.dns.nameservers.join(', ') || '');
    setSearchDomainsInput(data?.dns.searchDomains.join(', ') || '');
    setEditingDns(true);
  };

  const handleSaveDns = async () => {
    const nameservers = dnsInput.split(',').map(s => s.trim()).filter(Boolean);
    const searchDomains = searchDomainsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (nameservers.length === 0) return;
    setBusy(true);
    try {
      const res = await setDnsConfig(serverId, nameservers, searchDomains);
      if (res.success) { toast.success('DNS configuration updated'); await load(); }
      else toast.error(res.error || 'Failed to update DNS');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update DNS');
    } finally {
      setBusy(false);
      setEditingDns(false);
    }
  };

  const handleInterfaceToggle = async () => {
    if (!confirmInterface) return;
    const { name, action } = confirmInterface;
    setBusy(true);
    try {
      const res = action === 'up' ? await setInterfaceUp(serverId, name) : await setInterfaceDown(serverId, name);
      if (res.success) { toast.success(`Interface ${name} brought ${action}`); await load(); }
      else toast.error(res.error || `Failed to bring ${name} ${action}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to bring ${name} ${action}`);
    } finally {
      setBusy(false);
      setConfirmInterface(null);
    }
  };

  // ── Loading/Error guards ─────────────────────
  if (loading) {
    return <LoadingView label="Loading network info…" fullHeight={false} />;
  }

  if (error || !data) {
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  // ── Helpers (data is guaranteed non-null below) ──
  const getProcessTag = (process: string): { label: string; variant: 'success' | 'secondary' } | null => {
    const p = process.toLowerCase();
    if (p.includes('ssh')) return { label: 'Running', variant: 'success' };
    if (p.includes('dns') || p.includes('systemd-resolve')) return { label: 'DNS', variant: 'secondary' };
    if (p.includes('nginx') || p.includes('apache') || p.includes('http')) return { label: 'Running', variant: 'success' };
    if (p.includes('docker') || p.includes('containerd')) return { label: 'Running', variant: 'success' };
    return null;
  };

  const isSecureProcess = (process: string) => {
    const p = process.toLowerCase();
    return p.includes('ssh') || p.includes('nginx') || p.includes('https') || p.includes('tls') || p.includes('secure');
  };

  const getStateBadgeVariant = (state: string): 'success' | 'secondary' | 'warning' | 'outline' => {
    if (state === 'ESTABLISHED') return 'success';
    if (state === 'LISTEN') return 'secondary';
    if (state === 'TIME_WAIT' || state === 'CLOSE_WAIT') return 'warning';
    if (state === 'CLOSED') return 'outline';
    return 'secondary';
  };

  const isPublicPort = (port: number) => [22, 80, 443, 8080, 3000, 3001, 5432, 3306, 6379, 27017].includes(port);
  const isLoopback = (addr: string) => addr.startsWith('127.') || addr === '::1' || addr === '[::1]';

  // Filtered ports
  const filteredPorts = data.ports.filter(p => {
    if (!portSearch) return true;
    const q = portSearch.toLowerCase();
    return (
      p.protocol.toLowerCase().includes(q) ||
      p.localAddress.toLowerCase().includes(q) ||
      String(p.localPort).includes(q) ||
      p.process.toLowerCase().includes(q)
    );
  });

  const upCount = (data.interfaces ?? []).filter((i) => i.state === 'UP').length;

  return (
    <SectionBody>
      {/* ── Title Row ── */}
      <SectionHeader
        icon={Network}
        title="Network"
        badge={<Badge variant="success">Online</Badge>}
        subtitle={
          editingHostname ? (
            <span className="flex items-center gap-1.5 py-0.5">
              <Input
                value={hostnameInput}
                onChange={e => setHostnameInput(e.target.value)}
                className="h-7 w-48 font-mono text-xs"
                placeholder="new-hostname"
                disabled={busy}
                onKeyDown={e => { if (e.key === 'Enter') void handleSaveHostname(); if (e.key === 'Escape') setEditingHostname(false); }}
              />
              <RoundIconButton className="h-7 w-7" onClick={() => void handleSaveHostname()} disabled={busy} title="Save hostname">
                <Save strokeWidth={1.75} />
              </RoundIconButton>
              <RoundIconButton className="h-7 w-7" onClick={() => setEditingHostname(false)} disabled={busy} title="Cancel">
                <X strokeWidth={1.75} />
              </RoundIconButton>
            </span>
          ) : (
            <>
              {data.hostname && (
                <>
                  <span className="truncate font-mono">{data.hostname}</span>
                  <button
                    className="rounded-full p-1 text-label-3 transition-colors duration-150 hover:bg-fill hover:text-foreground"
                    onClick={openHostnameEdit}
                    disabled={busy}
                    title="Change hostname"
                  >
                    <Pencil size={12} strokeWidth={1.75} />
                  </button>
                  <span className="text-label-3">·</span>
                </>
              )}
              <span className="truncate">
                {upCount} of {data.interfaces?.length ?? 0} interfaces up
              </span>
            </>
          )
        }
        actions={<RefreshButton onClick={load} disabled={busy} spinning={busy} />}
      />

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentTabs
            value={tab}
            items={[
              { value: 'ports', label: 'Listening ports', count: data.ports.length },
              { value: 'connections', label: 'Connections', count: data.connections.length },
              { value: 'interfaces', label: 'Interfaces', count: data.interfaces?.length ?? 0 },
              { value: 'routes', label: 'Routes' },
              { value: 'dns', label: 'DNS' },
            ]}
          />
          {tab === 'ports' && (
            <SearchField
              placeholder="Search ports or addresses"
              value={portSearch}
              onValueChange={setPortSearch}
            />
          )}
        </div>

        {/* ── Ports Tab ── */}
        <TabsContent value="ports" className="mt-4 space-y-3">
          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <SlidersHorizontal strokeWidth={1.75} />
                  Filters
                  <ChevronDown className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuItem>Show All</DropdownMenuItem>
                <DropdownMenuItem>Public Only</DropdownMenuItem>
                <DropdownMenuItem>Private Only</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  All Protocols
                  <ChevronDown className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                <DropdownMenuItem>All Protocols</DropdownMenuItem>
                <DropdownMenuItem>TCP</DropdownMenuItem>
                <DropdownMenuItem>UDP</DropdownMenuItem>
                <DropdownMenuItem>TCP6</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  All Ports
                  <ChevronDown className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-36">
                <DropdownMenuItem>All Ports</DropdownMenuItem>
                <DropdownMenuItem>Common Ports</DropdownMenuItem>
                <DropdownMenuItem>High Ports</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  All Status
                  <ChevronDown className="opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-32">
                <DropdownMenuItem>All Status</DropdownMenuItem>
                <DropdownMenuItem>Running</DropdownMenuItem>
                <DropdownMenuItem>Listening</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th className="w-20">Proto</Th>
                  <Th>Address</Th>
                  <Th className="w-24">Port</Th>
                  <Th>Process</Th>
                  <Th className="w-28">Exposure</Th>
                  <Th className="w-14"></Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {filteredPorts.map((p, i) => {
                  const tag = getProcessTag(p.process);
                  const exposure = isPublicPort(p.localPort) ? 'public' : isLoopback(p.localAddress) ? 'local' : null;
                  return (
                    <Tr key={i}>
                      <Td>
                        <MonoChip>{p.protocol.toUpperCase()}</MonoChip>
                      </Td>
                      <Td className="font-mono text-foreground">{p.localAddress}</Td>
                      <Td className="font-mono font-bold tabular-nums text-foreground">{p.localPort}</Td>
                      <Td>
                        <div className="flex min-w-0 items-center gap-2">
                          {isSecureProcess(p.process) && (
                            <Lock size={13} strokeWidth={1.75} className="shrink-0 text-label-3" />
                          )}
                          <span className="truncate text-label-2">{p.process}</span>
                          {p.pid && <span className="font-mono text-[12px] text-label-3">{p.pid}</span>}
                          {tag && <Badge variant={tag.variant}>{tag.label}</Badge>}
                        </div>
                      </Td>
                      <Td>
                        {exposure === 'public' && (
                          <Badge variant="warning" title="Common public port">Public</Badge>
                        )}
                        {exposure === 'local' && <Badge variant="secondary">Local</Badge>}
                      </Td>
                      <Td className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <RowMenuButton />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>
                              <Eye size={14} className="mr-2" /> Inspect
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Target size={14} className="mr-2" /> Kill Process
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Ban size={14} className="mr-2" /> Block IP
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <FileText size={14} className="mr-2" /> View Logs
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                })}
                {filteredPorts.length === 0 && (
                  <EmptyRow colSpan={6}>
                    {portSearch ? 'No ports match your filter' : 'No listening ports'}
                  </EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        {/* ── Connections Tab ── */}
        <TabsContent value="connections" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th className="w-20">Proto</Th>
                  <Th>Local</Th>
                  <Th>Remote</Th>
                  <Th className="w-36">State</Th>
                  <Th>Process</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.connections.map((c, i) => (
                  <Tr key={i}>
                    <Td>
                      <MonoChip>{c.protocol.toUpperCase()}</MonoChip>
                    </Td>
                    <Td className="font-mono text-foreground">{c.localAddress}:{c.localPort}</Td>
                    <Td className="font-mono text-foreground">{c.remoteAddress}:{c.remotePort}</Td>
                    <Td>
                      <Badge variant={getStateBadgeVariant(c.state)}>{c.state}</Badge>
                    </Td>
                    <Td className="text-label-2">{c.process || '—'}</Td>
                  </Tr>
                ))}
                {data.connections.length === 0 && (
                  <EmptyRow colSpan={5}>No active connections</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        {/* ── Interfaces Tab ── */}
        <TabsContent value="interfaces" className="mt-4">
          <TableCard className="divide-y divide-border">
            {(data.interfaces ?? []).map((iface) => (
              <div
                key={iface.name}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-fill"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-edge bg-fill">
                    <Globe size={17} strokeWidth={1.75} className={iface.state === 'UP' ? 'text-label-2' : 'text-label-3'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-semibold text-foreground">{iface.name}</span>
                      <Badge variant={iface.state === 'UP' ? 'success' : 'secondary'}>
                        <Circle size={6} className={iface.state === 'UP' ? 'fill-current' : 'fill-current opacity-50'} />
                        {iface.state}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12px] text-label-3">
                      {iface.mac && <span className="font-mono">MAC {iface.mac}</span>}
                      {iface.mtu && <span>MTU {iface.mtu}</span>}
                      {iface.type && <span>{iface.type}</span>}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {iface.name !== 'lo' && (
                    iface.state === 'UP' ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirmInterface({ name: iface.name, action: 'down' })}
                        disabled={busy}
                      >
                        <ArrowDownCircle strokeWidth={1.75} /> Disable
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmInterface({ name: iface.name, action: 'up' })}
                        disabled={busy}
                      >
                        <ArrowUpCircle strokeWidth={1.75} /> Enable
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
            {(!data.interfaces || data.interfaces.length === 0) && (
              <div className="py-12 text-center text-[13px] text-label-3">No interface data</div>
            )}
          </TableCard>
        </TabsContent>

        {/* ── Routes Tab ── */}
        <TabsContent value="routes" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th>Destination</Th>
                  <Th>Gateway</Th>
                  <Th>Interface</Th>
                  <Th className="w-28">Metric</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.routes.map((r, i) => (
                  <Tr key={i}>
                    <Td className="font-mono text-foreground">{r.destination}</Td>
                    <Td className="font-mono text-label-2">{r.gateway || '—'}</Td>
                    <Td>
                      <MonoChip>{r.interface}</MonoChip>
                    </Td>
                    <Td className="tabular-nums text-label-2">{r.metric ?? '—'}</Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        {/* ── DNS Tab ── */}
        <TabsContent value="dns" className="mt-4">
          <div className="space-y-4">
            {!editingDns ? (
              <>
                <Panel>
                  <div className="flex items-center justify-between">
                    <PanelTitle>Nameservers</PanelTitle>
                    <Button variant="secondary" size="sm" onClick={openDnsEdit} disabled={busy}>
                      <Pencil strokeWidth={1.75} /> Edit DNS
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.dns.nameservers.map((ns, i) => (
                      <MonoChip key={i} className="h-7 px-2.5 text-foreground">{ns}</MonoChip>
                    ))}
                    {data.dns.nameservers.length === 0 && (
                      <span className="text-[13px] text-label-3">None configured</span>
                    )}
                  </div>
                </Panel>
                <Panel>
                  <PanelTitle>Search Domains</PanelTitle>
                  <div className="flex flex-wrap gap-2">
                    {data.dns.searchDomains.map((d, i) => (
                      <MonoChip key={i} className="h-7 px-2.5 text-foreground">{d}</MonoChip>
                    ))}
                    {data.dns.searchDomains.length === 0 && (
                      <span className="text-[13px] text-label-3">None configured</span>
                    )}
                  </div>
                </Panel>
              </>
            ) : (
              <Panel>
                <PanelTitle>Edit DNS Configuration</PanelTitle>
                <div className="space-y-1.5">
                  <Label className={FIELD_LABEL}>Nameservers (comma-separated)</Label>
                  <Input
                    value={dnsInput}
                    onChange={e => setDnsInput(e.target.value)}
                    placeholder="8.8.8.8, 8.8.4.4"
                    className="font-mono"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={FIELD_LABEL}>Search Domains (comma-separated, optional)</Label>
                  <Input
                    value={searchDomainsInput}
                    onChange={e => setSearchDomainsInput(e.target.value)}
                    placeholder="example.com, local.lan"
                    className="font-mono"
                    disabled={busy}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => void handleSaveDns()} disabled={busy || !dnsInput.trim()}>
                    {busy && <Spinner size={14} />}
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingDns(false)} disabled={busy}>Cancel</Button>
                </div>
              </Panel>
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
    </SectionBody>
  );
}
