// M8.7: Network Section — listening ports, routes, DNS, interfaces, hostname management
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, AlertCircle, Wifi, Pencil, ArrowUpCircle, ArrowDownCircle, Save, X, Activity, Globe, Radio, Search, MoreHorizontal, Shield, Lock, Eye, Ban, FileText, Circle, CheckCircle2, Target, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { fetchNetworkInfo, setHostname, setDnsConfig, setInterfaceUp, setInterfaceDown } from '@/lib/api';
import type { NetworkInfo } from '@/lib/api';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';

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
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <AlertCircle size={24} />
        <span className="text-sm">{error || 'No data'}</span>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  // ── Helpers (data is guaranteed non-null below) ──
  const getProcessColor = (process: string) => {
    const p = process.toLowerCase();
    if (p.includes('ssh')) return 'text-foreground/70 bg-foreground/5';
    if (p.includes('nginx') || p.includes('apache') || p.includes('http')) return 'text-foreground/70 bg-foreground/5';
    if (p.includes('dns') || p.includes('systemd-resolve')) return 'text-foreground/70 bg-foreground/5';
    if (p.includes('docker') || p.includes('containerd')) return 'text-foreground/70 bg-foreground/5';
    if (p.includes('postgres') || p.includes('mysql') || p.includes('mongo')) return 'text-foreground/70 bg-foreground/5';
    return 'text-foreground/60 bg-foreground/5';
  };

  const getProcessTag = (process: string): { label: string; color: string } | null => {
    const p = process.toLowerCase();
    if (p.includes('ssh')) return { label: 'Running', color: 'text-emerald-600 bg-emerald-500/10' };
    if (p.includes('dns') || p.includes('systemd-resolve')) return { label: 'DNS', color: 'text-foreground/50 bg-foreground/5' };
    if (p.includes('nginx') || p.includes('apache') || p.includes('http')) return { label: 'Running', color: 'text-emerald-600 bg-emerald-500/10' };
    if (p.includes('docker') || p.includes('containerd')) return { label: 'Running', color: 'text-emerald-600 bg-emerald-500/10' };
    return null;
  };

  const isSecureProcess = (process: string) => {
    const p = process.toLowerCase();
    return p.includes('ssh') || p.includes('nginx') || p.includes('https') || p.includes('tls') || p.includes('secure');
  };

  const getProtoBadgeColor = (proto: string) => {
    if (proto === 'tcp') return 'bg-foreground/8 text-foreground/70';
    if (proto === 'udp') return 'bg-foreground/8 text-foreground/70';
    if (proto === 'tcp6') return 'bg-foreground/8 text-foreground/70';
    return 'bg-foreground/5 text-foreground/60';
  };

  const getStateBadgeColor = (state: string) => {
    if (state === 'ESTABLISHED') return 'bg-emerald-500/10 text-emerald-600';
    if (state === 'LISTEN') return 'bg-foreground/5 text-foreground/60';
    if (state === 'TIME_WAIT' || state === 'CLOSE_WAIT') return 'bg-amber-500/10 text-amber-600';
    if (state === 'CLOSED') return 'bg-foreground/5 text-foreground/40';
    return 'bg-foreground/5 text-foreground/50';
  };

  const isPublicPort = (port: number) => [22, 80, 443, 8080, 3000, 3001, 5432, 3306, 6379, 27017].includes(port);

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

  return (
    <div className="@container p-6 space-y-4">
      {/* ── Title Row ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wifi size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Network</h2>
          {data.hostname && !editingHostname && (
            <div className="flex items-center gap-1.5 ml-1">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span className="text-sm text-foreground/60 font-mono">{data.hostname}</span>
              <button
                className="p-0.5 rounded text-foreground/25 hover:text-foreground/60 transition-colors"
                onClick={openHostnameEdit}
                disabled={busy}
                title="Change hostname"
              >
                <Pencil size={11} />
              </button>
            </div>
          )}
          {editingHostname && (
            <div className="flex items-center gap-2 ml-1">
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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} disabled={busy}>
          <RefreshCw size={16} className={cn(busy && 'animate-spin')} />
        </Button>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="ports">
        <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
          {[
            { value: 'ports', label: 'Listening Ports', count: data.ports.length, icon: Radio },
            { value: 'connections', label: 'Connections', count: data.connections.length, icon: Activity },
            { value: 'interfaces', label: 'Interfaces', count: data.interfaces?.length ?? 0, icon: Globe },
            { value: 'routes', label: 'Routes', icon: Globe },
            { value: 'dns', label: 'DNS', icon: Globe },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70"
            >
              {tab.label}
            
              
             {'count' in tab && tab.count !== undefined && (  
        <Badge variant="secondary" className="ml-1.5 px-1.5 text-muted-foreground">
          {tab.count}
        </Badge>
      )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Ports Tab ── */}
        <TabsContent value="ports" className="mt-4">
          {/* Filter bar with chips + search */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-border/50">
                    <SlidersHorizontal size={13} />
                    Filters
                    <ChevronDown size={12} className="opacity-40" />
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
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-border/50">
                    All Protocols
                    <ChevronDown size={12} className="opacity-40" />
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
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-border/50">
                    All Ports
                    <ChevronDown size={12} className="opacity-40" />
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
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium border-border/50">
                    All Status
                    <ChevronDown size={12} className="opacity-40" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-32">
                  <DropdownMenuItem>All Status</DropdownMenuItem>
                  <DropdownMenuItem>Running</DropdownMenuItem>
                  <DropdownMenuItem>Listening</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="relative w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/30" />
              <Input
                placeholder="Search..."
                value={portSearch}
                onChange={e => setPortSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-muted/30 border shadow-none"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-20 text-xs font-medium text-foreground/40 h-9">Proto</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Address</TableHead>
                <TableHead className="w-20 text-xs font-medium text-foreground/40 h-9">Port</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Process</TableHead>
                <TableHead className="w-10 text-xs font-medium text-foreground/40 h-9"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPorts.map((p, i) => {
                const tag = getProcessTag(p.process);
                return (
                <TableRow key={i} className="border-0 hover:bg-muted/20 group">
                  <TableCell className="py-3">
                    <span className={cn('inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide', getProtoBadgeColor(p.protocol))}>
                      {p.protocol.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-foreground/80 py-3">{p.localAddress}</TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground tabular-nums">{p.localPort}</span>
                      {isPublicPort(p.localPort) && (
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Common public port" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      {isSecureProcess(p.process) && (
                        <Lock size={12} className="text-foreground/30" />
                      )}
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium', getProcessColor(p.process))}>
                        {p.process}
                        {p.pid && <span className="ml-1 opacity-40">({p.pid})</span>}
                      </span>
                      {tag && (
                        <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', tag.color)}>
                          {tag.label}
                        </span>
                      )}
                      {isPublicPort(p.localPort) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600">
                          <Shield size={9} />
                          PUBLIC
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-md text-foreground/20 hover:text-foreground/60 hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
                          <MoreHorizontal size={15} />
                        </button>
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
                  </TableCell>
                </TableRow>
                );
              })}
              {filteredPorts.length === 0 && (
                <TableRow className="border-0">
                  <TableCell colSpan={5} className="text-center text-foreground/30 py-12 text-sm">
                    {portSearch ? 'No ports match your filter' : 'No listening ports'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Connections Tab ── */}
        <TabsContent value="connections" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-20 text-xs font-medium text-foreground/40 h-9">Proto</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Local</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Remote</TableHead>
                <TableHead className="w-30 text-xs font-medium text-foreground/40 h-9">State</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Process</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.connections.map((c, i) => (
                <TableRow key={i} className="border-0 hover:bg-muted/20">
                  <TableCell className="py-2.5">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium', getProtoBadgeColor(c.protocol))}>
                      {c.protocol.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-foreground/80 py-2.5">{c.localAddress}:{c.localPort}</TableCell>
                  <TableCell className="font-mono text-sm text-foreground/80 py-2.5">{c.remoteAddress}:{c.remotePort}</TableCell>
                  <TableCell className="py-2.5">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium', getStateBadgeColor(c.state))}>
                      {c.state}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-foreground/60 py-2.5">{c.process || '—'}</TableCell>
                </TableRow>
              ))}
              {data.connections.length === 0 && (
                <TableRow className="border-0"><TableCell colSpan={5} className="text-center text-foreground/30 py-12 text-sm">No active connections</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Interfaces Tab ── */}
        <TabsContent value="interfaces" className="mt-4">
          <div className="grid gap-2">
            {(data.interfaces ?? []).map((iface) => (
              <div
                key={iface.name}
                className="rounded-lg p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg',
                    iface.state === 'UP' ? 'bg-foreground/5' : 'bg-foreground/5',
                  )}>
                    <Globe size={16} className={iface.state === 'UP' ? 'text-foreground/50' : 'text-foreground/30'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{iface.name}</span>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
                        iface.state === 'UP' ? 'bg-emerald-500/10 text-emerald-600' :
                        iface.state === 'DOWN' ? 'bg-foreground/5 text-foreground/40' :
                        'bg-foreground/5 text-foreground/40',
                      )}>
                        <Circle size={6} className={iface.state === 'UP' ? 'fill-emerald-500' : 'fill-foreground/30'} />
                        {iface.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      {iface.mac && <span className="text-xs font-mono text-foreground/40">MAC {iface.mac}</span>}
                      {iface.mtu && <span className="text-xs text-foreground/40">MTU {iface.mtu}</span>}
                      {iface.type && <span className="text-xs text-foreground/40">{iface.type}</span>}
                    </div>
                  </div>
                </div>
                <div>
                  {iface.name !== 'lo' && (
                    iface.state === 'UP' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmInterface({ name: iface.name, action: 'down' })}
                        disabled={busy}
                      >
                        <ArrowDownCircle size={13} className="mr-1" /> Disable
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-emerald-500/70 hover:text-emerald-500 hover:bg-emerald-500/10"
                        onClick={() => setConfirmInterface({ name: iface.name, action: 'up' })}
                        disabled={busy}
                      >
                        <ArrowUpCircle size={13} className="mr-1" /> Enable
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
            {(!data.interfaces || data.interfaces.length === 0) && (
              <div className="text-center text-foreground/30 py-12 text-sm">No interface data</div>
            )}
          </div>
        </TabsContent>

        {/* ── Routes Tab ── */}
        <TabsContent value="routes" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Destination</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Gateway</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Interface</TableHead>
                <TableHead className="w-25 text-xs font-medium text-foreground/40 h-9">Metric</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.routes.map((r, i) => (
                <TableRow key={i} className="border-0 hover:bg-muted/20">
                  <TableCell className="font-mono text-sm text-foreground/80 py-2.5">{r.destination}</TableCell>
                  <TableCell className="font-mono text-sm text-foreground/60 py-2.5">{r.gateway || '—'}</TableCell>
                  <TableCell className="text-sm text-foreground py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-foreground/5 text-foreground/60">
                      {r.interface}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-foreground/50 tabular-nums py-2.5">{r.metric ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── DNS Tab ── */}
        <TabsContent value="dns" className="mt-4">
          <div className="space-y-4">
            {!editingDns ? (
              <>
                <div className="rounded-lg bg-muted/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">Nameservers</h3>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openDnsEdit} disabled={busy}>
                      <Pencil size={11} className="mr-1.5" /> Edit DNS
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.dns.nameservers.map((ns, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-foreground/5 text-foreground/70">{ns}</span>
                    ))}
                    {data.dns.nameservers.length === 0 && (
                      <span className="text-sm text-foreground/30">None configured</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Search Domains</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.dns.searchDomains.map((d, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-foreground/5 text-foreground/70">{d}</span>
                    ))}
                    {data.dns.searchDomains.length === 0 && (
                      <span className="text-sm text-foreground/30">None configured</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-muted/20 p-4 space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Edit DNS Configuration</h3>
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground/50">Nameservers (comma-separated)</Label>
                  <Input
                    value={dnsInput}
                    onChange={e => setDnsInput(e.target.value)}
                    placeholder="8.8.8.8, 8.8.4.4"
                    className="font-mono text-sm"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground/50">Search Domains (comma-separated, optional)</Label>
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
                    {busy && <Spinner size={14} className="mr-1" />}
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
