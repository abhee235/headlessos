// M7.2: Security Section — users, sessions, login history, SSH config, fail2ban
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Lock, Users, LogIn, Key, ShieldCheck } from 'lucide-react';
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
import { fetchSecurityInfo } from '@/lib/api';
import type { SecurityInfo } from '@/lib/api';

export function SecuritySection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSecurityInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch security info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch security info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading security info…
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

  // Filter to human users (uid >= 1000) and system accounts separately
  const humanUsers = data.users.filter((u) => u.uid >= 1000);
  const systemUsers = data.users.filter((u) => u.uid < 1000);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Security</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">
            <LogIn size={14} className="mr-1" />
            Active Sessions <Badge variant="secondary" className="ml-1.5 text-xs">{data.sessions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users size={14} className="mr-1" />
            Users <Badge variant="secondary" className="ml-1.5 text-xs">{humanUsers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="ssh">
            <Key size={14} className="mr-1" />
            SSH Config
          </TabsTrigger>
          <TabsTrigger value="history">Login History</TabsTrigger>
          <TabsTrigger value="fail2ban">
            <ShieldCheck size={14} className="mr-1" />
            Fail2ban
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead>Login Time</TableHead>
                <TableHead>Remote Host</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.user}</TableCell>
                  <TableCell className="font-mono text-xs">{s.terminal}</TableCell>
                  <TableCell className="text-xs">{s.loginTime}</TableCell>
                  <TableCell className="font-mono text-xs">{s.remoteHost || '-'}</TableCell>
                </TableRow>
              ))}
              {data.sessions.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No active sessions</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="users" className="mt-3">
          <h3 className="text-sm font-medium mb-2">Human Users (UID &ge; 1000)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>UID</TableHead>
                <TableHead>Home</TableHead>
                <TableHead>Shell</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {humanUsers.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell className="text-xs">{u.uid}</TableCell>
                  <TableCell className="font-mono text-xs">{u.home}</TableCell>
                  <TableCell className="font-mono text-xs">{u.shell}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {systemUsers.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-4 mb-2">
                System Accounts
                <Badge variant="secondary" className="ml-1.5 text-xs">{systemUsers.length}</Badge>
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>UID</TableHead>
                    <TableHead>Shell</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemUsers.map((u) => (
                    <TableRow key={u.uid}>
                      <TableCell className="text-xs">{u.username}</TableCell>
                      <TableCell className="text-xs">{u.uid}</TableCell>
                      <TableCell className="font-mono text-xs">{u.shell}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </TabsContent>

        <TabsContent value="ssh" className="mt-3">
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            {Object.entries(data.sshConfig).map(([key, value]) => (
              <div key={key} className="flex justify-between p-2 rounded-md border border-border">
                <span className="text-xs text-muted-foreground capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <Badge
                  variant={
                    (key === 'passwordAuthentication' && value === 'no') ||
                    (key === 'permitRootLogin' && value === 'no')
                      ? 'success'
                      : (key === 'passwordAuthentication' && value === 'yes') ||
                        (key === 'permitRootLogin' && value === 'yes')
                        ? 'warning'
                        : 'secondary'
                  }
                  className="text-xs font-mono"
                >
                  {value}
                </Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Terminal</TableHead>
                <TableHead>Remote Host</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Logout</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.loginHistory.map((h, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-xs">{h.user}</TableCell>
                  <TableCell className="font-mono text-xs">{h.terminal}</TableCell>
                  <TableCell className="font-mono text-xs">{h.remoteHost}</TableCell>
                  <TableCell className="text-xs">{h.loginTime}</TableCell>
                  <TableCell className="text-xs">{h.logoutTime}</TableCell>
                  <TableCell className="text-xs">{h.duration || '-'}</TableCell>
                </TableRow>
              ))}
              {data.loginHistory.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No login history</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="fail2ban" className="mt-3">
          {data.fail2ban.available ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-success" />
                <span className="text-sm font-medium">Fail2ban is active</span>
              </div>
              {data.fail2ban.jails && data.fail2ban.jails.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Active Jails</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.fail2ban.jails.map((j) => (
                      <Badge key={j} variant="outline">{j}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
              <ShieldCheck size={24} className="opacity-40" />
              <p className="text-sm">{data.fail2ban.message || 'Fail2ban is not installed'}</p>
              <p className="text-xs">Install with: <code className="bg-muted px-1.5 py-0.5 rounded">sudo apt install fail2ban</code></p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
