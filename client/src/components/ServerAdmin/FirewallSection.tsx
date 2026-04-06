// M7.2 + M8.2: Firewall Section — UFW status, rules, advanced rules, app profiles
// @see docs/phases/phase-7.md, docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Shield,
  ShieldOff,
  Plus,
  Trash2,
  Power,
  Globe,
  AppWindow,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';

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
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading firewall status…
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

  if (!data.available) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldOff size={32} />
        <p className="text-sm">{data.message || 'UFW is not installed'}</p>
        <p className="text-xs">Install with: <code className="bg-muted px-1.5 py-0.5 rounded">sudo apt install ufw</code></p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Firewall (UFW)</h2>
          <Badge variant={data.active ? 'success' : 'destructive'}>
            {data.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button
            variant={data.active ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggle}
            disabled={busy}
          >
            <Power size={14} className="mr-1" />
            {data.active ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="ghost" size="icon" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Rules table (always visible) */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>From</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rules.map((rule) => (
            <TableRow key={rule.number}>
              <TableCell className="text-muted-foreground">{rule.number}</TableCell>
              <TableCell className="font-mono text-xs">{rule.to}</TableCell>
              <TableCell>
                <Badge variant={rule.action.startsWith('ALLOW') ? 'success' : 'destructive'} className="text-xs">
                  {rule.action}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">{rule.from}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive/70 hover:text-destructive"
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
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No firewall rules configured
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Add Rule Tabs */}
      <Tabs defaultValue="basic" onValueChange={(v) => { if (v === 'apps') loadApps(); }}>
        <TabsList>
          <TabsTrigger value="basic">
            <Plus size={14} className="mr-1" />
            Basic Rule
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <Globe size={14} className="mr-1" />
            Advanced Rule
          </TabsTrigger>
          <TabsTrigger value="apps">
            <AppWindow size={14} className="mr-1" />
            App Profiles
          </TabsTrigger>
        </TabsList>

        {/* Basic Rule Form */}
        <TabsContent value="basic" className="mt-3">
          <div className="flex items-center gap-2 p-3 rounded-md border border-border bg-muted/30">
            <Input
              placeholder="Port"
              type="number"
              min={1}
              max={65535}
              className="w-24"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
            />
            <Select value={newProto} onValueChange={(v) => setNewProto(v as 'tcp' | 'udp')}>
              <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tcp">TCP</SelectItem>
                <SelectItem value="udp">UDP</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newAction} onValueChange={(v) => setNewAction(v as 'allow' | 'deny')}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleAddRule} disabled={busy || !newPort}>
              <Plus size={14} className="mr-1" />
              Add Rule
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Add a simple port/protocol rule (e.g., allow 443/tcp)
          </p>
        </TabsContent>

        {/* Advanced Rule Form */}
        <TabsContent value="advanced" className="mt-3">
          <div className="space-y-3 p-3 rounded-md border border-border bg-muted/30">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={advAction} onValueChange={(v) => setAdvAction(v as 'allow' | 'deny')}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">from</span>
              <Input
                placeholder="Source IP or CIDR (e.g., 10.0.0.0/24)"
                className="w-56 font-mono text-sm"
                value={advFrom}
                onChange={(e) => setAdvFrom(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">port</span>
              <Input
                placeholder="Port or range (e.g., 8000:9000)"
                className="w-44 font-mono text-sm"
                value={advPort}
                onChange={(e) => setAdvPort(e.target.value)}
              />
              <Select value={advProto || 'any'} onValueChange={(v) => setAdvProto(v === 'any' ? '' : v as 'tcp' | 'udp')}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
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
                className="max-w-xs text-sm"
                value={advComment}
                onChange={(e) => setAdvComment(e.target.value)}
              />
              <Button size="sm" onClick={handleAddAdvancedRule} disabled={busy || !advFrom.trim()}>
                <Plus size={14} className="mr-1" />
                Add Advanced Rule
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Create IP-based rules with optional port range and protocol (e.g., allow from 192.168.1.0/24 to any port 22)
          </p>
        </TabsContent>

        {/* App Profiles */}
        <TabsContent value="apps" className="mt-3">
          {appsLoading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={16} />
              Loading app profiles…
            </div>
          ) : appProfiles.length > 0 ? (
            <div className="space-y-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appProfiles.map((app) => (
                    <TableRow key={app.name}>
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
              <p className="text-xs text-muted-foreground">
                App profiles are predefined firewall rules for common applications (e.g., &quot;Nginx Full&quot; opens ports 80 + 443)
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
              <AppWindow size={20} className="opacity-40" />
              <p className="text-sm">No UFW app profiles found</p>
              <p className="text-xs">App profiles are typically installed with services like Nginx, Apache, OpenSSH</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
