// M7.2 + M8.1 + M8.6: Security Section — users, sessions, login history, SSH config, fail2ban, user/session management
// EX8.6: LumenOS v3 — section header, lit segmented tabs, glass table cards, round row actions.
// @see docs/phases/phase-7.md, docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import { RotateCw, Lock, ShieldCheck, Ban, ShieldOff, Plus, Trash2, KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, SegmentTabs, TableCard, CardHeading, HeadRow, Th, Tr, Td,
  EmptyRow, MonoChip, RoundIconButton, Panel, PanelTitle, StatCard, FIELD_LABEL, EmptyState, ErrorState,
} from './admin-ui';

export function SecuritySection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active sub-tab (controlled so the active pill can be lit)
  const [tab, setTab] = useState('sessions');

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
    return <LoadingView label="Loading security info…" fullHeight={false} />;
  }

  if (error || !data) {
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  // Filter to human users (uid >= 1000) and system accounts separately
  const humanUsers = data.users.filter((u) => u.uid >= 1000);
  const systemUsers = data.users.filter((u) => u.uid < 1000);

  return (
    <SectionBody>
      <SectionHeader
        icon={Lock}
        title="Security"
        subtitle="Users, sessions and SSH"
        actions={<RefreshButton onClick={load} />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <SegmentTabs
          value={tab}
          items={[
            { value: 'sessions', label: 'Active sessions', count: data.sessions.length },
            { value: 'users', label: 'Users', count: humanUsers.length },
            { value: 'ssh', label: 'SSH config' },
            { value: 'history', label: 'Login history' },
            { value: 'fail2ban', label: 'Fail2ban' },
          ]}
        />

        <TabsContent value="sessions" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th>User</Th>
                  <Th>Terminal</Th>
                  <Th>Login time</Th>
                  <Th>Remote host</Th>
                  <Th className="w-24 text-right">Actions</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.sessions.map((s, i) => (
                  <Tr key={i}>
                    <Td className="font-semibold text-foreground">{s.user}</Td>
                    <Td><MonoChip>{s.terminal}</MonoChip></Td>
                    <Td className="text-label-2">{s.loginTime}</Td>
                    <Td className="font-mono text-label-2">{s.remoteHost || '-'}</Td>
                    <Td className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleKillSession(s.terminal)}
                        disabled={busy}
                        title="Kill session"
                      >
                        <Trash2 strokeWidth={1.75} /> Kill
                      </Button>
                    </Td>
                  </Tr>
                ))}
                {data.sessions.length === 0 && (
                  <EmptyRow colSpan={5}>No active sessions</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          <TableCard>
            {/* Add User button + form */}
            <CardHeading
              title="Human users"
              count={humanUsers.length}
              caption="UID ≥ 1000"
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddUser(!showAddUser)}
                  disabled={busy}
                >
                  <Plus strokeWidth={1.75} /> Add user
                </Button>
              }
            />

            {showAddUser && (
              <div className="space-y-3 border-b border-border bg-fill px-5 py-4">
                <h4 className="text-[14px] font-semibold text-foreground">Create New User</h4>
                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>Username</label>
                  <Input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                    placeholder="newuser"
                    className="max-w-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>Shell</label>
                  <Input
                    value={newUserShell}
                    onChange={(e) => setNewUserShell(e.target.value)}
                    placeholder="/bin/bash"
                    className="max-w-xs font-mono"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleCreateUser} disabled={busy || !newUsername.trim()}>
                    {busy && <Spinner size={14} />}
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
                <HeadRow>
                  <Th>Username</Th>
                  <Th>UID</Th>
                  <Th>Home</Th>
                  <Th>Shell</Th>
                  <Th className="w-32 text-right">Actions</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {humanUsers.map((u) => (
                  <Tr key={u.uid}>
                    <Td className="font-semibold text-foreground">{u.username}</Td>
                    <Td className="font-mono tabular-nums text-label-2">{u.uid}</Td>
                    <Td className="font-mono text-foreground">{u.home}</Td>
                    <Td className="font-mono text-label-2">{u.shell}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <RoundIconButton
                              onClick={() => { setPasswordTarget(u.username); setPasswordInput(''); }}
                            >
                              <KeyRound strokeWidth={1.75} />
                            </RoundIconButton>
                          </TooltipTrigger>
                          <TooltipContent>Set Password</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <RoundIconButton
                              onClick={() => { setGroupTarget(u.username); setGroupInput(''); }}
                            >
                              <UserPlus strokeWidth={1.75} />
                            </RoundIconButton>
                          </TooltipTrigger>
                          <TooltipContent>Add to Group</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <RoundIconButton
                              tone="danger"
                              onClick={() => setDeleteTarget(u.username)}
                              disabled={u.username === 'root'}
                            >
                              <Trash2 strokeWidth={1.75} />
                            </RoundIconButton>
                          </TooltipTrigger>
                          <TooltipContent>Delete User</TooltipContent>
                        </Tooltip>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          {/* Set Password Dialog */}
          <Dialog open={passwordTarget !== null} onOpenChange={(open) => { if (!open) setPasswordTarget(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound size={18} strokeWidth={1.75} /> Set Password
                </DialogTitle>
                <DialogDescription>
                  Set a new password for user &ldquo;{passwordTarget}&rdquo;.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <label className={FIELD_LABEL}>New Password</label>
                <Input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  onKeyDown={(e) => e.key === 'Enter' && passwordInput && handleSetPassword()}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPasswordTarget(null)} disabled={busy}>Cancel</Button>
                <Button onClick={handleSetPassword} disabled={busy || !passwordInput}>
                  {busy && <Spinner size={14} />}
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
                  <UserPlus size={18} strokeWidth={1.75} /> Add to Group
                </DialogTitle>
                <DialogDescription>
                  Add user &ldquo;{groupTarget}&rdquo; to a system group.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <label className={FIELD_LABEL}>Group Name</label>
                <Input
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  placeholder="sudo, docker, www-data"
                  onKeyDown={(e) => e.key === 'Enter' && groupInput.trim() && handleAddToGroup()}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setGroupTarget(null)} disabled={busy}>Cancel</Button>
                <Button onClick={handleAddToGroup} disabled={busy || !groupInput.trim()}>
                  {busy && <Spinner size={14} />}
                  Add to Group
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {systemUsers.length > 0 && (
            <TableCard>
              <CardHeading title="System accounts" count={systemUsers.length} />
              <Table>
                <TableHeader>
                  <HeadRow>
                    <Th>Username</Th>
                    <Th>UID</Th>
                    <Th>Shell</Th>
                  </HeadRow>
                </TableHeader>
                <TableBody>
                  {systemUsers.map((u) => (
                    <Tr key={u.uid}>
                      <Td className="text-foreground">{u.username}</Td>
                      <Td className="font-mono tabular-nums text-label-2">{u.uid}</Td>
                      <Td className="font-mono text-label-2">{u.shell}</Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}

          {/* Delete User Dialog */}
          <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-danger">
                  <Trash2 size={18} strokeWidth={1.75} /> Delete User
                </DialogTitle>
                <DialogDescription>
                  Permanently delete user &ldquo;{deleteTarget}&rdquo; and their home directory. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
                <Button variant="danger" onClick={() => { void handleDeleteUser(); }} disabled={busy}>
                  {busy && <Spinner size={14} />}
                  Delete User
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="ssh" className="mt-4">
          <TableCard className="max-w-xl divide-y divide-border">
            {Object.entries(data.sshConfig).map(([key, value]) => (
              <div key={key} className="flex h-[50px] items-center justify-between px-5">
                <span className="text-[14px] capitalize text-foreground">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <Badge
                  className="font-mono"
                  variant={
                    (key === 'passwordAuthentication' && value === 'no') ||
                    (key === 'permitRootLogin' && value === 'no')
                      ? 'success'
                      : (key === 'passwordAuthentication' && value === 'yes') ||
                        (key === 'permitRootLogin' && value === 'yes')
                        ? 'warning'
                        : 'secondary'
                  }
                >
                  {value}
                </Badge>
              </div>
            ))}
          </TableCard>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <TableCard>
            <Table>
              <TableHeader>
                <HeadRow>
                  <Th>User</Th>
                  <Th>Terminal</Th>
                  <Th>Remote host</Th>
                  <Th>Login</Th>
                  <Th>Logout</Th>
                  <Th>Duration</Th>
                </HeadRow>
              </TableHeader>
              <TableBody>
                {data.loginHistory.map((h, i) => (
                  <Tr key={i}>
                    <Td className="font-semibold text-foreground">{h.user}</Td>
                    <Td><MonoChip>{h.terminal}</MonoChip></Td>
                    <Td className="font-mono text-label-2">{h.remoteHost}</Td>
                    <Td className="text-label-2">{h.loginTime}</Td>
                    <Td className="text-label-2">{h.logoutTime}</Td>
                    <Td className="tabular-nums text-label-2">{h.duration || '-'}</Td>
                  </Tr>
                ))}
                {data.loginHistory.length === 0 && (
                  <EmptyRow colSpan={6}>No login history</EmptyRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        </TabsContent>

        <TabsContent value="fail2ban" className="mt-4">
          {data.fail2ban.available ? (
            <div className="space-y-4">
              {/* Header with status and reload */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} strokeWidth={1.75} className="text-success" />
                  <span className="text-[14px] font-semibold text-foreground">Fail2ban is active</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReload}
                  disabled={actionLoading === 'reload'}
                >
                  {actionLoading === 'reload' ? (
                    <Spinner size={14} />
                  ) : (
                    <RotateCw strokeWidth={1.75} />
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
                    <MonoChip className="h-7 px-2.5 text-[13px] text-foreground">{selectedJail}</MonoChip>
                  </div>

                  {jailLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-label-3">
                      <Spinner size={16} />
                      Loading jail details…
                    </div>
                  ) : jailDetail ? (
                    <>
                      {/* Jail stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <StatCard label="Currently Banned" value={jailDetail.currentlyBanned} valueClassName="text-danger" />
                        <StatCard label="Total Banned" value={jailDetail.totalBanned} />
                        <StatCard label="Total Failed" value={jailDetail.totalFailed} />
                      </div>

                      {/* Filter & File info */}
                      <div className="grid grid-cols-2 gap-3 text-[13px]">
                        <div className="lumen-card rounded-[16px] px-4 py-3">
                          <span className="text-label-2">Filter: </span>
                          <span className="font-mono text-foreground">{jailDetail.filter || 'N/A'}</span>
                        </div>
                        <div className="lumen-card rounded-[16px] px-4 py-3">
                          <span className="text-label-2">Log Files: </span>
                          <span className="font-mono text-foreground">{jailDetail.fileList.length > 0 ? jailDetail.fileList.join(', ') : 'N/A'}</span>
                        </div>
                      </div>

                      {/* Ban IP form */}
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Enter IP to ban (e.g. 192.168.1.100)"
                          value={banIpInput}
                          onChange={(e) => setBanIpInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleBanIp(); }}
                          className="max-w-xs font-mono"
                        />
                        <Button
                          variant="destructive"
                          onClick={handleBanIp}
                          disabled={!banIpInput.trim() || actionLoading === 'ban'}
                        >
                          {actionLoading === 'ban' ? (
                            <Spinner size={14} />
                          ) : (
                            <Ban strokeWidth={1.75} />
                          )}
                          Ban IP
                        </Button>
                      </div>

                      {/* Banned IPs table */}
                      {jailDetail.bannedIps.length > 0 ? (
                        <TableCard>
                          <Table>
                            <TableHeader>
                              <HeadRow>
                                <Th>Banned IP</Th>
                                <Th className="w-32 text-right">Actions</Th>
                              </HeadRow>
                            </TableHeader>
                            <TableBody>
                              {jailDetail.bannedIps.map((ip) => (
                                <Tr key={ip}>
                                  <Td className="font-mono text-foreground">{ip}</Td>
                                  <Td className="text-right">
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleUnbanIp(ip)}
                                      disabled={actionLoading === `unban:${ip}`}
                                    >
                                      {actionLoading === `unban:${ip}` ? (
                                        <Spinner size={14} />
                                      ) : (
                                        <ShieldOff strokeWidth={1.75} />
                                      )}
                                      Unban
                                    </Button>
                                  </Td>
                                </Tr>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCard>
                      ) : (
                        <EmptyState icon={ShieldCheck} title="No banned IPs in this jail" className="py-8" />
                      )}

                      {/* Refresh jail detail */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadJailDetail(selectedJail)}
                          disabled={jailLoading}
                        >
                          <RotateCw strokeWidth={1.75} />
                          Refresh
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                /* Jail list — clickable badges */
                data.fail2ban.jails && data.fail2ban.jails.length > 0 ? (
                  <Panel>
                    <PanelTitle>Active Jails</PanelTitle>
                    <div className="flex flex-wrap gap-2">
                      {data.fail2ban.jails.map((j) => (
                        <span
                          key={j}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-edge bg-mat px-3 font-mono text-[13px] text-foreground shadow-[var(--lumen-spec)] transition-colors duration-150 hover:bg-mat-thick"
                          onClick={() => loadJailDetail(j)}
                        >
                          <ShieldCheck size={14} strokeWidth={1.75} className="text-success" />
                          {j}
                        </span>
                      ))}
                    </div>
                    <p className="text-[12px] text-label-3">Click a jail to view details and manage banned IPs</p>
                  </Panel>
                ) : (
                  <EmptyState icon={ShieldCheck} title="No active jails found" />
                )
              )}
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title={data.fail2ban.message || 'Fail2ban is not installed'}
              description="Install with:"
              code="sudo apt install fail2ban"
            />
          )}
        </TabsContent>
      </Tabs>
    </SectionBody>
  );
}
