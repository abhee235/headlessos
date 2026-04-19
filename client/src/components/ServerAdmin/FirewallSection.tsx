// M7.2 + M8.2: Firewall Section — UFW status, rules, advanced rules, app profiles
// @see docs/phases/phase-7.md, docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, AlertCircle, Shield, ShieldOff, Plus, Trash2, Power, Globe, AppWindow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  fetchFirewallStatus,
  addFirewallRule,
  deleteFirewallRule,
  toggleFirewall,
  addAdvancedFirewallRule,
  fetchUfwAppProfiles,
  allowDenyUfwApp,
} from '@/lib/api';
import type { FirewallStatus, UfwAppProfile } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';

export function FirewallSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<FirewallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Basic add-rule form state
  const [newPort, setNewPort] = useState('');
  const [newProto, setNewProto] = useState<'tcp' | 'udp'>('tcp');
  const [newAction, setNewAction] = useState<'allow' | 'deny'>('allow');

  // M8.2 — Advanced rule form state
  const [advFrom, setAdvFrom] = useState('');
  const [advPort, setAdvPort] = useState('');
  const [advProto, setAdvProto] = useState<'tcp' | 'udp' | ''>('');
  const [advAction, setAdvAction] = useState<'allow' | 'deny'>('allow');
  const [advComment, setAdvComment] = useState('');

  // M8.2 — App profiles state
  const [appProfiles, setAppProfiles] = useState<UfwAppProfile[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState('basic');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFirewallStatus(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch firewall status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch firewall status');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  // M8.2 — Load app profiles
  const loadApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const res = await fetchUfwAppProfiles(serverId);
      if (res.success && res.data) {
        setAppProfiles(res.data.apps);
      }
    } catch {
      // silently ignore — apps tab just stays empty
    } finally {
      setAppsLoading(false);
    }
  }, [serverId]);

  const handleToggle = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await toggleFirewall(serverId, !data.active);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || 'Toggle failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddRule = async () => {
    const port = parseInt(newPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('Invalid port number (1-65535)');
      return;
    }
    setBusy(true);
    try {
      const res = await addFirewallRule(serverId, { port, protocol: newProto, action: newAction });
      if (res.success) {
        toast.success(res.message);
        setNewPort('');
        await load();
      } else {
        toast.error(res.error || 'Failed to add rule');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add rule');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRule = async (ruleNumber: number) => {
    setBusy(true);
    try {
      const res = await deleteFirewallRule(serverId, ruleNumber);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || 'Failed to delete rule');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setBusy(false);
    }
  };

  // M8.2 — Add advanced rule
  const handleAddAdvancedRule = async () => {
    if (!advFrom.trim()) {
      toast.error('Source IP or CIDR is required');
      return;
    }
    setBusy(true);
    try {
      const res = await addAdvancedFirewallRule(serverId, {
        action: advAction,
        from: advFrom.trim(),
        port: advPort.trim() || undefined,
        protocol: advProto || undefined,
        comment: advComment.trim() || undefined,
      });
      if (res.success) {
        toast.success(res.message);
        setAdvFrom('');
        setAdvPort('');
        setAdvProto('');
        setAdvComment('');
        await load();
      } else {
        toast.error(res.error || 'Failed to add advanced rule');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add advanced rule');
    } finally {
      setBusy(false);
    }
  };

  // M8.2 — Allow/deny app profile
  const handleAppAction = async (action: 'allow' | 'deny', appName: string) => {
    setBusy(true);
    try {
      const res = await allowDenyUfwApp(serverId, action, appName);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || `Failed to ${action} app`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} app`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingView label="Loading firewall status…" fullHeight={false} />;
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

  if (!data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <ShieldOff size={32} />
        <span className="text-sm">{data.message || 'UFW is not installed'}</span>
        <span className="text-xs">Install with: <code className="bg-muted px-1.5 py-0.5 rounded">sudo apt install ufw</code></span>
      </div>
    );
  }

  return (
    <div className="@container p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Firewall (UFW)</h2>
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
            data.active
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-foreground/5 text-foreground/40'
          )}>
            {data.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={data.active ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggle}
            disabled={busy}
          >
            <Power size={14} className="mr-1" />
            {data.active ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} disabled={busy}>
            <RefreshCw size={16} className={cn(busy && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Tabs above table */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'apps') loadApps(); }}>
        <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
          <TabsTrigger value="basic" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <Plus size={14} className="mr-1.5" />
            Basic Rule
          </TabsTrigger>
          <TabsTrigger value="advanced" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <Globe size={14} className="mr-1.5" />
            Advanced Rule
          </TabsTrigger>
          <TabsTrigger value="apps" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <AppWindow size={14} className="mr-1.5" />
            App Profiles
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Advanced Rule Form (shown above table when advanced tab active) */}
      {activeTab === 'advanced' && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={advAction} onValueChange={(v) => setAdvAction(v as 'allow' | 'deny')}>
              <SelectTrigger className="w-24 h-8 text-xs shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-foreground/40">from</span>
            <Input
              placeholder="Source IP or CIDR (e.g., 10.0.0.0/24)"
              className="w-56 h-8 text-xs font-mono shadow-none"
              value={advFrom}
              onChange={(e) => setAdvFrom(e.target.value)}
            />
            <span className="text-xs text-foreground/40">port</span>
            <Input
              placeholder="Port or range (e.g., 8000:9000)"
              className="w-44 h-8 text-xs font-mono shadow-none"
              value={advPort}
              onChange={(e) => setAdvPort(e.target.value)}
            />
            <Select value={advProto || 'any'} onValueChange={(v) => setAdvProto(v === 'any' ? '' : v as 'tcp' | 'udp')}>
              <SelectTrigger className="w-20 h-8 text-xs shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="udp">UDP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Comment (optional)"
              className="max-w-xs h-8 text-xs shadow-none"
              value={advComment}
              onChange={(e) => setAdvComment(e.target.value)}
            />
            <Button size="sm" onClick={handleAddAdvancedRule} disabled={busy || !advFrom.trim()}>
              <Plus size={14} className="mr-1" />
              Add Advanced Rule
            </Button>
          </div>
          <p className="text-xs text-foreground/40">
            Create IP-based rules with optional port range and protocol (e.g., allow from 192.168.1.0/24 to any port 22)
          </p>
        </div>
      )}

      {/* Rules table (basic + advanced tabs) */}
      {activeTab !== 'apps' && (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="w-12 text-xs font-medium text-foreground/40 h-9">#</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">To</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Action</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">From</TableHead>
                <TableHead className="w-16 text-xs font-medium text-foreground/40 h-9" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Inline add row (basic tab) */}
              {activeTab === 'basic' && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell />
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Input
                        placeholder="Port"
                        type="number"
                        min={1}
                        max={65535}
                        className="w-24 h-8 text-xs shadow-none"
                        value={newPort}
                        onChange={(e) => setNewPort(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && newPort && handleAddRule()}
                      />
                      <Select value={newProto} onValueChange={(v) => setNewProto(v as 'tcp' | 'udp')}>
                        <SelectTrigger className="w-20 h-8 text-xs shadow-none"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tcp">TCP</SelectItem>
                          <SelectItem value="udp">UDP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={newAction} onValueChange={(v) => setNewAction(v as 'allow' | 'deny')}>
                      <SelectTrigger className="w-24 h-8 text-xs shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allow">Allow</SelectItem>
                        <SelectItem value="deny">Deny</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-foreground/40">Anywhere</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={handleAddRule} disabled={busy || !newPort} className="gap-1">
                      <Plus size={14} />
                      Add Rule
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {/* Existing rules */}
              {data.rules.map((rule) => (
                <TableRow key={rule.number} className="border-0 hover:bg-muted/20 group">
                  <TableCell className="text-foreground/40">{rule.number}</TableCell>
                  <TableCell className="font-mono text-xs">{rule.to}</TableCell>
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      rule.action.startsWith('ALLOW')
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-red-500/10 text-red-600'
                    )}>
                      {rule.action}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{rule.from}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/70 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleDeleteRule(rule.number)}
                      disabled={busy}
                      title="Delete rule"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.rules.length === 0 && (
                <TableRow className="border-0">
                  <TableCell colSpan={5} className="text-center text-foreground/30 py-12 text-sm">
                    No firewall rules configured
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {activeTab === 'basic' && (
            <p className="text-xs text-foreground/40 mt-1.5">
              Add a simple port/protocol rule (e.g., allow 443/tcp)
            </p>
          )}
        </>
      )}

      {/* App Profiles (apps tab) */}
      {activeTab === 'apps' && (
        <div className="mt-0">
          {appsLoading ? (
            <div className="flex items-center justify-center py-12 text-foreground/40">
              <Spinner className="mr-2" size={16} />
              Loading app profiles…
            </div>
          ) : appProfiles.length > 0 ? (
            <div className="space-y-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Application</TableHead>
                    <TableHead className="w-40 text-right text-xs font-medium text-foreground/40 h-9">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appProfiles.map((app) => (
                    <TableRow key={app.name} className="border-0 hover:bg-muted/20 group">
                      <TableCell className="font-medium text-sm">{app.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAppAction('allow', app.name)}
                            disabled={busy}
                            className="text-xs"
                          >
                            Allow
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAppAction('deny', app.name)}
                            disabled={busy}
                            className="text-xs text-destructive hover:text-destructive"
                          >
                            Deny
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-foreground/40">
                App profiles are predefined firewall rules for common applications (e.g., &quot;Nginx Full&quot; opens ports 80 + 443)
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-foreground/30">
              <AppWindow size={20} className="opacity-40" />
              <span className="text-sm">No UFW app profiles found</span>
              <span className="text-xs">App profiles are typically installed with services like Nginx, Apache, OpenSSH</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
