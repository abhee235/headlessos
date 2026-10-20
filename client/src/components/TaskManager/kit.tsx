// EX8.9: Task Manager — pieces shared by App history, Startup apps, Users and
// Services: stat tile, table card, process glyph, polling hook, formatters.
// @see docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle, Boxes, Clock, Code2, Cog, Database, Globe, KeyRound, ScrollText,
  SquareTerminal, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingView } from '@/components/ui/loading-view';

// ─── Formatting ──────────────────────────────────────────────────────────────

/** CPU time: 4:33:04 (h:mm:ss), or 0:41 under an hour */
export function formatCpuTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** 1250 → "1.3 s", 340 → "340 ms" */
export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** "Oct 13" */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "17:29" today, "Oct 13 17:29" otherwise */
export function formatSince(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${formatDay(iso)} ${time}`;
}

/** "3 days", "5 h", "12 min" since an ISO time */
export function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

// ─── Polling hook ────────────────────────────────────────────────────────────

type Envelope<T> = { success: boolean; data?: T; error?: string };

/**
 * Fetch on mount and every `intervalMs` (0 = once). Keeps the last good data
 * through a failed refresh; `reload()` refetches now.
 */
export function usePolled<T>(fetcher: () => Promise<Envelope<T>>, intervalMs: number, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      const res = await fetcherRef.current();
      if (res.success && res.data) { setData(res.data); setError(null); }
      else setError(res.error ?? 'Request failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    if (!intervalMs) return;
    let inFlight = false;
    const id = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void load().finally(() => { inFlight = false; });
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-provided deps
  }, deps);

  return { data, error, loading, reload: load };
}

// ─── Page states ─────────────────────────────────────────────────────────────

export function PageState({ loading, error, onRetry, label }: { loading: boolean; error: string | null; onRetry: () => void; label: string }) {
  if (loading) return <LoadingView label={label} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="size-8 text-danger" strokeWidth={1.75} />
      <p className="max-w-sm text-[13px] text-label-2">{error}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

// ─── Stat tile: label, big value, caption ────────────────────────────────────

export function StatTile({ label, value, caption, title }: { label: string; value: ReactNode; caption?: ReactNode; title?: string }) {
  return (
    <div className="lumen-card flex min-w-0 flex-col rounded-[20px] px-4 pb-3.5 pt-3.5" title={title}>
      <span className="text-[13px] text-label-2">{label}</span>
      <span className="mt-0.5 truncate text-[26px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground">
        {value}
      </span>
      {caption && <span className="mt-0.5 truncate text-[13px] text-label-2">{caption}</span>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid shrink-0 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">{children}</div>;
}

// ─── Table card ──────────────────────────────────────────────────────────────

/**
 * The process-table look: a .lumen-card with a sticky uppercase header row and
 * a scrolling body. `cols` is a grid-template class shared by header and rows.
 */
export function TableCard({
  label, cols, minWidth = 'min-w-[720px]', header, title, actions, footer, children,
}: {
  label: string;
  cols: string;
  minWidth?: string;
  header: ReactNode;
  title?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div role="table" aria-label={label} className="lumen-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]">
      {(title || actions) && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {actions}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
        <div className={cn('flex min-h-0 flex-1 flex-col', minWidth)}>
          <div role="rowgroup" className="shrink-0 border-b border-border [scrollbar-gutter:stable]">
            <div role="row" className={cn(cols, 'h-10 text-[11px] font-semibold uppercase tracking-[.06em] text-label-3')}>
              {header}
            </div>
          </div>
          <div role="rowgroup" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            {children}
          </div>
        </div>
      </div>
      {footer && <div className="shrink-0 border-t border-border px-5 py-2.5 text-[12px] text-label-3">{footer}</div>}
    </div>
  );
}

export const ROW = 'border-b border-border text-[13px] transition-colors duration-150 last:border-b-0 hover:bg-fill';

export function EmptyRows({ children }: { children: ReactNode }) {
  return <div className="flex h-28 items-center justify-center px-6 text-center text-[13px] text-label-3">{children}</div>;
}

// ─── Process glyph: a raised tile with a hint of what the program is ─────────

const GLYPHS: Array<[RegExp, LucideIcon]> = [
  [/^(nginx|apache2?|httpd|caddy|haproxy|traefik)/, Globe],
  [/^(postgres|mysqld?|mariadb|redis|mongod|memcached|clickhouse)/, Database],
  [/^(docker|containerd|dockerd|podman|runc|kubelet|k3s)/, Boxes],
  [/^(sshd?|ssh-agent|openssh)/, KeyRound],
  [/^(node|python\d*|java|ruby|php|perl|deno|bun|go)/, Code2],
  [/^(bash|sh|zsh|dash|fish|tmux|screen|login|agetty)/, SquareTerminal],
  [/^(cron|crond|atd|anacron)/, Clock],
  [/^(rsyslog|syslog|journald|systemd-journald|logrotate)/, ScrollText],
];

export function glyphFor(name: string): LucideIcon {
  const n = name.toLowerCase();
  return GLYPHS.find(([re]) => re.test(n))?.[1] ?? Cog;
}

export function ProcessGlyph({ name, className }: { name: string; className?: string }) {
  const Icon = glyphFor(name);
  return (
    <span className={cn('lumen-tile grid size-9 shrink-0 place-items-center rounded-[11px] text-label-2', className)}>
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </span>
  );
}
