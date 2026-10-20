// M7.2 + M8.2: Firewall Section — UFW status, rules, advanced rules, app profiles
// EX8.6: LumenOS v3 — section header, lit segmented tabs, glass rule table, empty state.
// @see docs/phases/phase-7.md, docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import {
  Shield, ShieldOff, Plus, Trash2, Power, AppWindow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableHeader,
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
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, SegmentTabs, TableCard, HeadRow, Th, Tr, Td,
  EmptyRow, RoundIconButton, Panel, EmptyState, ErrorState,
} from './admin-ui';

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
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  if (!data.available) {
    // The parser's message already ends with the install hint, which the code chip below shows
    const message = data.message || 'UFW is not installed';
    const hintAt = message.indexOf('Install with:');
    const title = hintAt > 0 ? message.slice(0, hintAt).trim().replace(/\.$/, '') : message;
    return (
      <SectionBody>
        <SectionHeader
          icon={Shield}
          title="Firewall"
          badge={<Badge variant="destructive">Not installed</Badge>}
          subtitle="No firewall is protecting this server"
        />
        <EmptyState
          icon={ShieldOff}
          title={title}
          description="Install the firewall to control which ports are reachable from the internet."
          code="sudo apt install ufw"
        />
      </SectionBody>
    );
  }

  return (
    <SectionBody>
      {/* Header */}
      <SectionHeader
        icon={Shield}
        title="Firewall"
        badge={
          <Badge variant={data.active ? 'success' : 'warning'}>
            {data.active ? 'Active' : 'Inactive'}
          </Badge>
        }
        subtitle={`UFW · ${data.rules.length} ${data.rules.length === 1 ? 'rule' : 'rules'}`}
        actions={
          <>
            <Button
              variant={data.active ? 'secondary' : 'default'}
              onClick={handleToggle}
              disabled={busy}
            >
              <Power strokeWidth={1.75} />
              {data.active ? 'Disable' : 'Enable'}
            </Button>
            <RefreshButton onClick={load} disabled={busy} spinning={busy} />
          </>
        }
      />

      {/* Tabs above table */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === 'apps') loadApps(); }}>
        <SegmentTabs
          value={activeTab}
          items={[
            { value: 'basic', label: 'Basic rule' },
            { value: 'advanced', label: 'Advanced rule' },
            { value: 'apps', label: 'App profiles' },
          ]}
        />
      </Tabs>

      {/* Advanced Rule Form (shown above table when advanced tab active) */}
      {activeTab === 'advanced' && (
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={advAction} onValueChange={(v) => setAdvAction(v as 'allow' | 'deny')}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[13px] text-label-3">from</span>
            <Input
              placeholder="Source IP or CIDR (e.g., 10.0.0.0/24)"
              className="w-64 font-mono"
              value={advFrom}
              onChange={(e) => setAdvFrom(e.target.value)}
            />
            <span className="text-[13px] text-label-3">port</span>
            <Input
              placeholder="Port or range (e.g., 8000:9000)"
              className="w-52 font-mono"
              value={advPort}
              onChange={(e) => setAdvPort(e.target.value)}
            />
            <Select value={advProto || 'any'} onValueChange={(v) => setAdvProto(v === 'any' ? '' : v as 'tcp' | 'udp')}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
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
              className="max-w-xs"
              value={advComment}
              onChange={(e) => setAdvComment(e.target.value)}
            />
            <Button onClick={handleAddAdvancedRule} disabled={busy || !advFrom.trim()}>
              <Plus strokeWidth={1.75} />
              Add Advanced Rule
            </Button>
          </div>
          <p className="text-[12px] text-label-3">
            Create IP-based rules with optional port range and protocol (e.g., allow from 192.168.1.0/24 to any port 22)
          </p>
        </Panel>
      )}

      {/* Rules table (basic + advanced tabs) */}
      {activeTab !== 'apps' && (
        <>
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th className="w-14">#</Th>
                  <Th>To</Th>
                  <Th>Action</Th>
                  <Th>From</Th>
                  <Th className="w-32" />
                </HeadRow>
              </TableHeader>
              <TableBody>
                {/* Inline add row (basic tab) */}
                {activeTab === 'basic' && (
                  <Tr className="hover:bg-transparent">
                    <Td />
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Input
                          placeholder="Port"
                          type="number"
                          min={1}
                          max={65535}
                          className="h-[30px] w-24 font-mono"
                          value={newPort}
                          onChange={(e) => setNewPort(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && newPort && handleAddRule()}
                        />
                        <Select value={newProto} onValueChange={(v) => setNewProto(v as 'tcp' | 'udp')}>
                          <SelectTrigger className="h-[30px] w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tcp">TCP</SelectItem>
                            <SelectItem value="udp">UDP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </Td>
                    <Td>
                      <Select value={newAction} onValueChange={(v) => setNewAction(v as 'allow' | 'deny')}>
                        <SelectTrigger className="h-[30px] w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="allow">Allow</SelectItem>
                          <SelectItem value="deny">Deny</SelectItem>
                        </SelectContent>
                      </Select>
                    </Td>
                    <Td className="text-label-3">Anywhere</Td>
                    <Td className="text-right">
                      <Button size="sm" onClick={handleAddRule} disabled={busy || !newPort}>
                        <Plus strokeWidth={1.75} />
                        Add Rule
                      </Button>
                    </Td>
                  </Tr>
                )}
                {/* Existing rules */}
                {data.rules.map((rule) => (
                  <Tr key={rule.number}>
                    <Td className="tabular-nums text-label-3">{rule.number}</Td>
                    <Td className="font-mono text-foreground">{rule.to}</Td>
                    <Td>
                      <Badge variant={rule.action.startsWith('ALLOW') ? 'success' : 'destructive'}>
                        {rule.action}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-label-2">{rule.from}</Td>
                    <Td className="text-right">
                      <RoundIconButton
                        tone="danger"
                        onClick={() => handleDeleteRule(rule.number)}
                        disabled={busy}
                        title="Delete rule"
                        className="ml-auto"
                      >
                        <Trash2 strokeWidth={1.75} />
                      </RoundIconButton>
                    </Td>
                  </Tr>
                ))}
                {data.rules.length === 0 && (
                  <EmptyRow colSpan={5}>No firewall rules configured</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
          {activeTab === 'basic' && (
            <p className="-mt-2 px-1 text-[12px] text-label-3">
              Add a simple port/protocol rule (e.g., allow 443/tcp)
            </p>
          )}
        </>
      )}

      {/* App Profiles (apps tab) */}
      {activeTab === 'apps' && (
        <div className="mt-0">
          {appsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-label-3">
              <Spinner size={16} />
              Loading app profiles…
            </div>
          ) : appProfiles.length > 0 ? (
            <div className="space-y-2">
              <TableCard>
                <Table>
                  <TableHeader>
                    <HeadRow>
                      <Th>Application</Th>
                      <Th className="w-48 text-right">Actions</Th>
                    </HeadRow>
                  </TableHeader>
                  <TableBody>
                    {appProfiles.map((app) => (
                      <Tr key={app.name}>
                        <Td className="font-medium text-foreground">{app.name}</Td>
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleAppAction('allow', app.name)}
                              disabled={busy}
                            >
                              Allow
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleAppAction('deny', app.name)}
                              disabled={busy}
                            >
                              Deny
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
              <p className="px-1 text-[12px] text-label-3">
                App profiles are predefined firewall rules for common applications (e.g., &quot;Nginx Full&quot; opens ports 80 + 443)
              </p>
            </div>
          ) : (
            <EmptyState
              icon={AppWindow}
              title="No UFW app profiles found"
              description="App profiles are typically installed with services like Nginx, Apache, OpenSSH"
            />
          )}
        </div>
      )}
    </SectionBody>
  );
}
