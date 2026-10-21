// EX8.9: Task Manager — Users. A card per account that has processes or a
// login session: CPU / memory / process count come from the live `ps aux`
// poll (every 2 s); accounts and sessions from `getent passwd` + `who`.
// @see docs/phases/phase-ex8.md

import { useMemo } from 'react';
import { Server, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  fetchTaskManagerUsers,
  type ProcessData,
  type TaskManagerAccount,
  type TaskManagerSession,
} from '../../lib/api';
import { Meter, SERIES } from './parts';
import { formatKb } from './ProcessDetailCard';
import { isHeadlessProbe } from './ProcessesTab';
import { EmptyRows, PageState, formatSince, usePolled } from './kit';

export interface UserSummary {
  name: string;
  account: TaskManagerAccount | null;
  sessions: TaskManagerSession[];
  cpu: number;
  rssKb: number;
  processes: number;
  isYou: boolean;
}

const KIND_LABEL: Record<TaskManagerAccount['kind'], string> = {
  admin: 'Administrator',
  standard: 'Standard user',
  service: 'Service account',
};

/** Accounts with processes or sessions, you first, then by CPU */
export function summarizeUsers(
  processes: ProcessData[],
  accounts: TaskManagerAccount[],
  sessions: TaskManagerSession[],
  currentUser: string,
): UserSummary[] {
  const byName = new Map<string, UserSummary>();
  const get = (name: string) => {
    let u = byName.get(name);
    if (!u) {
      u = {
        name,
        account: accounts.find((a) => a.name === name) ?? null,
        sessions: [],
        cpu: 0,
        rssKb: 0,
        processes: 0,
        isYou: name === currentUser,
      };
      byName.set(name, u);
    }
    return u;
  };
  for (const p of processes) {
    if (isHeadlessProbe(p, currentUser)) continue;
    const u = get(p.user);
    u.cpu += p.cpu;
    u.rssKb += p.rss;
    u.processes += 1;
  }
  for (const s of sessions) get(s.user).sessions.push(s);
  return [...byName.values()].sort((a, b) => Number(b.isYou) - Number(a.isYou) || b.cpu - a.cpu || a.name.localeCompare(b.name));
}

export function UsersTab({
  serverId, processes, totalMemMb, currentUser,
}: {
  serverId: string;
  processes: ProcessData[];
  totalMemMb: number;
  currentUser: string | undefined;
}) {
  const { data, error, loading, reload } = usePolled(() => fetchTaskManagerUsers(serverId), 15_000, [serverId]);
  const me = data?.currentUser ?? currentUser ?? '';
  const users = useMemo(
    () => (data ? summarizeUsers(processes, data.accounts, data.sessions, me) : []),
    [data, processes, me],
  );

  if (!data) return <PageState loading={loading} error={error} onRetry={reload} label="Reading accounts…" />;
  if (users.length === 0) return <EmptyRows>No users with running processes</EmptyRows>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {users.map((u) => <UserCard key={u.name} user={u} totalMemMb={totalMemMb} />)}
      </div>
    </div>
  );
}

function UserCard({ user: u, totalMemMb }: { user: UserSummary; totalMemMb: number }) {
  const kind = u.account?.kind ?? 'service';
  const human = kind !== 'service';
  const Icon = human ? User : Server;
  const active = u.sessions.length > 0;
  const badge = kind === 'service'
    ? { label: 'Service', className: 'border-viz-blue/30 bg-viz-blue/14 text-viz-blue' }
    : active
      ? { label: 'Active', variant: 'success' as const }
      : { label: 'Idle', variant: 'secondary' as const };
  const memPct = totalMemMb > 0 ? (u.rssKb / 1024 / totalMemMb) * 100 : 0;

  const first = u.sessions[0];
  const since = first ? formatSince(first.loginAt) : null;
  const where = first
    ? `${first.tty}${since ? ` since ${since}` : ''}${u.sessions.length > 1 ? ` +${u.sessions.length - 1} more` : ''}`
    : kind === 'admin' ? 'system' : kind === 'service' ? 'daemon' : 'no session';

  return (
    <div className="lumen-card flex flex-col gap-4 rounded-[22px] px-5 pb-4 pt-5">
      <div className="flex items-start gap-3.5">
        <span className="lumen-tile grid size-12 shrink-0 place-items-center rounded-[14px] text-label-2">
          <Icon className="size-[22px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[16px] font-bold text-foreground" title={u.account ? `uid ${u.account.uid} · ${u.account.shell}` : undefined}>
            {u.name}
          </div>
          <div className="truncate text-[13px] text-label-2">
            {KIND_LABEL[kind]}{u.isYou ? ' · you' : ''}
          </div>
        </div>
        <Badge variant={'variant' in badge ? badge.variant : undefined} className={cn('shrink-0', 'className' in badge && badge.className)}>
          {badge.label}
        </Badge>
      </div>

      <div className="flex flex-col gap-2.5">
        <MeterRow label="CPU" value={`${u.cpu.toFixed(1)}%`} pct={u.cpu} fill={SERIES.cpu.bg} />
        <MeterRow label="Memory" value={formatKb(u.rssKb)} pct={memPct} fill={SERIES.memory.bg} />
      </div>

      <div className="flex min-w-0 items-center gap-1 border-t border-border pt-3 text-[13px] text-label-2">
        <span className="truncate" title={u.sessions.map((s) => `${s.tty}${s.from ? ` from ${s.from}` : ''}`).join(', ') || undefined}>
          {u.processes} {u.processes === 1 ? 'process' : 'processes'} · {where}
        </span>
      </div>
    </div>
  );
}

function MeterRow({ label, value, pct, fill }: { label: string; value: string; pct: number; fill: string }) {
  return (
    <div className="grid grid-cols-[64px_1fr_72px] items-center gap-3 text-[13px]">
      <span className="text-label-2">{label}</span>
      <Meter value={pct} fillClassName={fill} />
      <span className="text-right tabular-nums text-foreground">{value}</span>
    </div>
  );
}
