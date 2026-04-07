// M7.2 + M8.1 + M8.6: Security Section — users, sessions, login history, SSH config, fail2ban, user/session management
// @see docs/phases/phase-7.md, docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Lock, Users, LogIn, Key, ShieldCheck, Ban, ShieldOff, RotateCw, Plus, Trash2, KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  fetchSecurityInfo,
  fetchFail2banJailDetail,
  fail2banBanIp,
  fail2banUnbanIp,
  fail2banReload,
  createUser,
  deleteUser,
  setUserPassword,
  addUserToGroup,
  killSession,
} from '@/lib/api';
import type { SecurityInfo, Fail2banJailDetail } from '@/lib/api';
import { toast } from 'sonner';

export function SecuritySection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // M8.1 — Fail2ban management state
  const [selectedJail, setSelectedJail] = useState<string | null>(null);
  const [jailDetail, setJailDetail] = useState<Fail2banJailDetail | null>(null);
  const [jailLoading, setJailLoading] = useState(false);
  const [banIpInput, setBanIpInput] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null); // 'ban' | 'unban:<ip>' | 'reload'

  // M8.6 — User & Session management state
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserShell, setNewUserShell] = useState('/bin/bash');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [groupTarget, setGroupTarget] = useState<string | null>(null);
  const [groupInput, setGroupInput] = useState('');
  const [busy, setBusy] = useState(false);

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

  // M8.1 — Load jail detail
  const loadJailDetail = useCallback(async (jail: string) => {
    setSelectedJail(jail);
    setJailLoading(true);
    setJailDetail(null);
    try {
      const res = await fetchFail2banJailDetail(serverId, jail);
      if (res.success && res.data) {
        setJailDetail(res.data);
      } else {
        toast.error(`Failed to load jail "${jail}": ${res.error || 'Unknown error'}`);
        setSelectedJail(null);
      }
    } catch (err) {
      toast.error(`Failed to load jail "${jail}"`);
      setSelectedJail(null);
    } finally {
      setJailLoading(false);
    }
  }, [serverId]);

  // M8.1 — Ban IP
  const handleBanIp = useCallback(async () => {
    if (!selectedJail || !banIpInput.trim()) return;
    setActionLoading('ban');
    try {
      const res = await fail2banBanIp(serverId, selectedJail, banIpInput.trim());
      if (res.success) {
        toast.success(`Banned ${banIpInput.trim()} in jail "${selectedJail}"`);
        setBanIpInput('');
        loadJailDetail(selectedJail);
      } else {
        toast.error(`Ban failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('Failed to ban IP');
    } finally {
      setActionLoading(null);
    }
  }, [serverId, selectedJail, banIpInput, loadJailDetail]);

  // M8.1 — Unban IP
  const handleUnbanIp = useCallback(async (ip: string) => {
    if (!selectedJail) return;
    setActionLoading(`unban:${ip}`);
    try {
      const res = await fail2banUnbanIp(serverId, selectedJail, ip);
      if (res.success) {
        toast.success(`Unbanned ${ip} from jail "${selectedJail}"`);
        loadJailDetail(selectedJail);
      } else {
        toast.error(`Unban failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('Failed to unban IP');
    } finally {
      setActionLoading(null);
    }
  }, [serverId, selectedJail, loadJailDetail]);

  // M8.1 — Reload fail2ban
  const handleReload = useCallback(async () => {
    setActionLoading('reload');
    try {
      const res = await fail2banReload(serverId);
      if (res.success) {
        toast.success('Fail2ban configuration reloaded');
        load(); // refresh all security data
        if (selectedJail) loadJailDetail(selectedJail);
      } else {
        toast.error(`Reload failed: ${res.error || 'Unknown error'}`);
      }
    } catch (err) {
      toast.error('Failed to reload fail2ban');
    } finally {
      setActionLoading(null);
    }
  }, [serverId, selectedJail, load, loadJailDetail]);

  // M8.6 — Create user
  const handleCreateUser = async () => {
    if (!newUsername.trim()) return;
    setBusy(true);
    try {
      const res = await createUser(serverId, {
        username: newUsername.trim(),
        shell: newUserShell || '/bin/bash',
        createHome: true,
      });
      if (res.success) {
        toast.success(res.message || `User "${newUsername}" created`);
        setShowAddUser(false);
        setNewUsername('');
        setNewUserShell('/bin/bash');
        await load();
      } else {
        toast.error(res.error || 'Failed to create user');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  // M8.6 — Delete user
  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await deleteUser(serverId, deleteTarget);
      if (res.success) {
        toast.success(res.message || `User "${deleteTarget}" deleted`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error(res.error || 'Failed to delete user');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setBusy(false);
    }
  };

  // M8.6 — Set password
  const handleSetPassword = async () => {
    if (!passwordTarget || !passwordInput) return;
    setBusy(true);
    try {
      const res = await setUserPassword(serverId, passwordTarget, passwordInput);
      if (res.success) {
        toast.success(res.message || `Password set for "${passwordTarget}"`);
        setPasswordTarget(null);
        setPasswordInput('');
      } else {
        toast.error(res.error || 'Failed to set password');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setBusy(false);
    }
  };

  // M8.6 — Add to group
  const handleAddToGroup = async () => {
    if (!groupTarget || !groupInput.trim()) return;
    setBusy(true);
    try {
      const res = await addUserToGroup(serverId, groupTarget, groupInput.trim());
      if (res.success) {
        toast.success(res.message || `Added "${groupTarget}" to group "${groupInput}"`);
        setGroupTarget(null);
        setGroupInput('');
      } else {
        toast.error(res.error || 'Failed to add to group');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add to group');
    } finally {
      setBusy(false);
    }
  };

  // M8.6 — Kill session
  const handleKillSession = async (tty: string) => {
    setBusy(true);
    try {
      const res = await killSession(serverId, tty);
      if (res.success) {
        toast.success(res.message || `Session on ${tty} terminated`);
        await load();
      } else {
        toast.error(res.error || 'Failed to kill session');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to kill session');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-foreground/40">
        <Loader2 className="animate-spin mr-2" size={20} />
        Loading security info…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-foreground/40">
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
    <div className="@container p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Lock size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Security</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      <Tabs defaultValue="sessions">
        <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
          <TabsTrigger value="sessions" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <LogIn size={14} className="mr-1.5" />
            Active Sessions
            <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{data.sessions.length}</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <Users size={14} className="mr-1.5" />
            Users
            <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{humanUsers.length}</span>
          </TabsTrigger>
          <TabsTrigger value="ssh" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <Key size={14} className="mr-1.5" />
            SSH Config
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            Login History
          </TabsTrigger>
          <TabsTrigger value="fail2ban" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <ShieldCheck size={14} className="mr-1.5" />
            Fail2ban
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-medium text-foreground/40 h-9">User</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Terminal</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Login Time</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Remote Host</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9 w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s, i) => (
                <TableRow key={i} className="border-0 hover:bg-muted/20 group">
                  <TableCell className="font-medium">{s.user}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{s.terminal}</TableCell>
                  <TableCell className="text-xs text-foreground/60">{s.loginTime}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{s.remoteHost || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                      onClick={() => handleKillSession(s.terminal)}
                      disabled={busy}
                      title="Kill session"
                    >
                      <Trash2 size={13} className="mr-1" /> Kill
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.sessions.length === 0 && (
                <TableRow className="border-0">
                  <TableCell colSpan={5} className="text-center text-foreground/30 py-12 text-sm">No active sessions</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          {/* Add User button + form */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground/60">Human Users (UID &ge; 1000)</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddUser(!showAddUser)}
              disabled={busy}
            >
              <Plus size={14} className="mr-1" /> Add User
            </Button>
          </div>

          {showAddUser && (
            <div className="bg-muted/20 rounded-lg p-4 space-y-3">
              <h4 className="font-medium text-sm">Create New User</h4>
              <div className="space-y-1">
                <label className="text-xs text-foreground/50">Username</label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                  placeholder="newuser"
                  className="max-w-xs text-sm shadow-none h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-foreground/50">Shell</label>
                <Input
                  value={newUserShell}
                  onChange={(e) => setNewUserShell(e.target.value)}
                  placeholder="/bin/bash"
                  className="max-w-xs font-mono text-sm shadow-none h-8"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleCreateUser} disabled={busy || !newUsername.trim()}>
                  {busy && <Loader2 size={14} className="animate-spin mr-1" />}
                  Create
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddUser(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Username</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">UID</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Home</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Shell</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9 w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {humanUsers.map((u) => (
                <TableRow key={u.uid} className="border-0 hover:bg-muted/20 group">
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell className="text-xs text-foreground/60">{u.uid}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{u.home}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{u.shell}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setPasswordTarget(u.username); setPasswordInput(''); }}
                          >
                            <KeyRound size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Set Password</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setGroupTarget(u.username); setGroupInput(''); }}
                          >
                            <UserPlus size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add to Group</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setDeleteTarget(u.username)}
                            disabled={u.username === 'root'}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete User</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Set Password Dialog */}
          <Dialog open={passwordTarget !== null} onOpenChange={(open) => { if (!open) setPasswordTarget(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound size={18} /> Set Password
                </DialogTitle>
                <DialogDescription>
                  Set a new password for user &ldquo;{passwordTarget}&rdquo;.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <label className="text-xs text-foreground/50">New Password</label>
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  onKeyDown={(e) => e.key === 'Enter' && passwordInput && handleSetPassword()}
                  className="shadow-none h-8 text-xs"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPasswordTarget(null)} disabled={busy}>Cancel</Button>
                <Button onClick={handleSetPassword} disabled={busy || !passwordInput}>
                  {busy && <Loader2 size={14} className="animate-spin mr-1" />}
                  Set Password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add to Group Dialog */}
          <Dialog open={groupTarget !== null} onOpenChange={(open) => { if (!open) setGroupTarget(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserPlus size={18} /> Add to Group
                </DialogTitle>
                <DialogDescription>
                  Add user &ldquo;{groupTarget}&rdquo; to a system group.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <label className="text-xs text-foreground/50">Group Name</label>
                <Input
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder="sudo, docker, www-data"
                  onKeyDown={(e) => e.key === 'Enter' && groupInput.trim() && handleAddToGroup()}
                  className="shadow-none h-8 text-xs"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setGroupTarget(null)} disabled={busy}>Cancel</Button>
                <Button onClick={handleAddToGroup} disabled={busy || !groupInput.trim()}>
                  {busy && <Loader2 size={14} className="animate-spin mr-1" />}
                  Add to Group
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {systemUsers.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-foreground/60 mt-4 mb-2">
                System Accounts
                <span className={cn('ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', 'bg-foreground/5 text-foreground/50')}>{systemUsers.length}</span>
              </h3>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Username</TableHead>
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">UID</TableHead>
                    <TableHead className="text-xs font-medium text-foreground/40 h-9">Shell</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemUsers.map((u) => (
                    <TableRow key={u.uid} className="border-0 hover:bg-muted/20 group">
                      <TableCell className="text-xs">{u.username}</TableCell>
                      <TableCell className="text-xs text-foreground/60">{u.uid}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground/60">{u.shell}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          {/* Delete User Dialog */}
          <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <Trash2 size={18} /> Delete User
                </DialogTitle>
                <DialogDescription>
                  Permanently delete user &ldquo;{deleteTarget}&rdquo; and their home directory. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" onClick={() => { void handleDeleteUser(); }} disabled={busy}>
                  {busy && <Loader2 size={14} className="animate-spin mr-1" />}
                  Delete User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="ssh" className="mt-4">
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            {Object.entries(data.sshConfig).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center p-2 bg-muted/20 rounded-lg">
                <span className="text-xs text-foreground/50 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium font-mono',
                    (key === 'passwordAuthentication' && value === 'no') ||
                    (key === 'permitRootLogin' && value === 'no')
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : (key === 'passwordAuthentication' && value === 'yes') ||
                        (key === 'permitRootLogin' && value === 'yes')
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-foreground/5 text-foreground/50',
                  )}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-medium text-foreground/40 h-9">User</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Terminal</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Remote Host</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Login</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Logout</TableHead>
                <TableHead className="text-xs font-medium text-foreground/40 h-9">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.loginHistory.map((h, i) => (
                <TableRow key={i} className="border-0 hover:bg-muted/20 group">
                  <TableCell className="font-medium text-xs">{h.user}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{h.terminal}</TableCell>
                  <TableCell className="font-mono text-xs text-foreground/60">{h.remoteHost}</TableCell>
                  <TableCell className="text-xs text-foreground/60">{h.loginTime}</TableCell>
                  <TableCell className="text-xs text-foreground/60">{h.logoutTime}</TableCell>
                  <TableCell className="text-xs text-foreground/60">{h.duration || '-'}</TableCell>
                </TableRow>
              ))}
              {data.loginHistory.length === 0 && (
                <TableRow className="border-0">
                  <TableCell colSpan={6} className="text-center text-foreground/30 py-12 text-sm">No login history</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="fail2ban" className="mt-4">
          {data.fail2ban.available ? (
            <div className="space-y-4">
              {/* Header with status and reload */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span className="text-sm font-medium text-foreground/60">Fail2ban is active</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReload}
                  disabled={actionLoading === 'reload'}
                >
                  {actionLoading === 'reload' ? (
                    <Loader2 size={14} className="animate-spin mr-1" />
                  ) : (
                    <RotateCw size={14} className="mr-1" />
                  )}
                  Reload Config
                </Button>
              </div>

              {/* Jail detail view */}
              {selectedJail ? (
                <div className="space-y-4">
                  {/* Back to jail list */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedJail(null); setJailDetail(null); }}
                    >
                      ← Back to Jails
                    </Button>
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium font-mono', 'bg-foreground/5 text-foreground/60')}>{selectedJail}</span>
                  </div>

                  {jailLoading ? (
                    <div className="flex items-center justify-center py-12 text-foreground/40">
                      <Loader2 className="animate-spin mr-2" size={16} />
                      Loading jail details…
                    </div>
                  ) : jailDetail ? (
                    <>
                      {/* Jail stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-destructive">{jailDetail.currentlyBanned}</div>
                          <div className="text-xs text-foreground/40">Currently Banned</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold">{jailDetail.totalBanned}</div>
                          <div className="text-xs text-foreground/40">Total Banned</div>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold">{jailDetail.totalFailed}</div>
                          <div className="text-xs text-foreground/40">Total Failed</div>
                        </div>
                      </div>

                      {/* Filter & File info */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-muted/20 rounded-lg p-2">
                          <span className="text-foreground/40">Filter: </span>
                          <span className="font-mono">{jailDetail.filter || 'N/A'}</span>
                        </div>
                        <div className="bg-muted/20 rounded-lg p-2">
                          <span className="text-foreground/40">Log Files: </span>
                          <span className="font-mono">{jailDetail.fileList.length > 0 ? jailDetail.fileList.join(', ') : 'N/A'}</span>
                        </div>
                      </div>

                      {/* Ban IP form */}
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Enter IP to ban (e.g. 192.168.1.100)"
                          value={banIpInput}
                          onChange={(e) => setBanIpInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleBanIp(); }}
                          className="max-w-xs font-mono text-sm shadow-none h-8"
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleBanIp}
                          disabled={!banIpInput.trim() || actionLoading === 'ban'}
                        >
                          {actionLoading === 'ban' ? (
                            <Loader2 size={14} className="animate-spin mr-1" />
                          ) : (
                            <Ban size={14} className="mr-1" />
                          )}
                          Ban IP
                        </Button>
                      </div>

                      {/* Banned IPs table */}
                      {jailDetail.bannedIps.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent border-0">
                              <TableHead className="text-xs font-medium text-foreground/40 h-9">Banned IP</TableHead>
                              <TableHead className="text-xs font-medium text-foreground/40 h-9 w-24 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {jailDetail.bannedIps.map((ip) => (
                              <TableRow key={ip} className="border-0 hover:bg-muted/20 group">
                                <TableCell className="font-mono text-sm">{ip}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUnbanIp(ip)}
                                    disabled={actionLoading === `unban:${ip}`}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    {actionLoading === `unban:${ip}` ? (
                                      <Loader2 size={14} className="animate-spin mr-1" />
                                    ) : (
                                      <ShieldOff size={14} className="mr-1" />
                                    )}
                                    Unban
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-foreground/30">
                          <ShieldCheck size={20} className="opacity-40 mb-1" />
                          <p className="text-xs">No banned IPs in this jail</p>
                        </div>
                      )}

                      {/* Refresh jail detail */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadJailDetail(selectedJail)}
                          disabled={jailLoading}
                        >
                          <RefreshCw size={14} className="mr-1" />
                          Refresh
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                /* Jail list — clickable badges */
                data.fail2ban.jails && data.fail2ban.jails.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-medium text-foreground/60 mb-2">Active Jails</h3>
                    <div className="flex flex-wrap gap-2">
                      {data.fail2ban.jails.map((j) => (
                        <span
                          key={j}
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors',
                            'bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground',
                          )}
                          onClick={() => loadJailDetail(j)}
                        >
                          <ShieldCheck size={12} className="mr-1" />
                          {j}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-foreground/40 mt-2">Click a jail to view details and manage banned IPs</p>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/40">No active jails found</p>
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-foreground/30">
              <ShieldCheck size={24} className="opacity-40" />
              <p className="text-sm">{data.fail2ban.message || 'Fail2ban is not installed'}</p>
              <p className="text-xs text-foreground/40">Install with: <code className="bg-muted/30 px-1.5 py-0.5 rounded">sudo apt install fail2ban</code></p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
