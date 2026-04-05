// M7.2: Firewall Section — UFW status, rules, add/remove/toggle
// @see docs/phases/phase-7.md

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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
} from '@/lib/api';
import type { FirewallStatus } from '@/lib/api';
import { toast } from 'sonner';

export function FirewallSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<FirewallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-rule form state
  const [newPort, setNewPort] = useState('');
  const [newProto, setNewProto] = useState<'tcp' | 'udp'>('tcp');
  const [newAction, setNewAction] = useState<'allow' | 'deny'>('allow');

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

      {/* Add Rule */}
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

      {/* Rules Table */}
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
    </div>
  );
}
