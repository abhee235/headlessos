// M10.1: Notification Center — slide-out panel with notification history
// EX8.4: LumenOS v3 — two glass-heavy cards above the tray: notifications
// (lumen-card rows) and a month calendar. Opened from the tray clock.
// @see docs/PROGRESS.md, docs/phases/phase-ex8.md

import { useEffect, useRef } from 'react';
import { Bell, BellOff, X, Check, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useNotificationStore, type NotificationType } from '../../store/notification-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Type icon map ────────────────────────────────────────

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  info: <Info className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />,
  success: <CheckCircle className="h-[18px] w-[18px] text-success" strokeWidth={1.75} />,
  warning: <AlertTriangle className="h-[18px] w-[18px] text-warning" strokeWidth={1.75} />,
  error: <AlertCircle className="h-[18px] w-[18px] text-danger" strokeWidth={1.75} />,
};

/** 36px round tile behind the type icon, tinted with the same hue. */
const TYPE_TILE: Record<NotificationType, string> = {
  info: 'bg-accent-solid/14 border-accent-solid/30',
  success: 'bg-success/14 border-success/30',
  warning: 'bg-warning/14 border-warning/30',
  error: 'bg-danger/14 border-danger/30',
};

// ── Month calendar (EX8.4) ───────────────────────────────

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function MonthCalendar() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first
  const days = new Date(y, m + 1, 0).getDate();
  const cells: Array<number | null> = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const month = now.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const today = now.toLocaleDateString([], { day: 'numeric', weekday: 'long' });

  return (
    <div className="glass-heavy shrink-0 rounded-[28px] px-[18px] py-4 animate-panelIn">
      <div className="flex items-baseline justify-between pb-3.5">
        <span className="text-xl leading-[26px] font-semibold tracking-[-0.015em]">{month}</span>
        <span className="text-sm text-label-2">{today}</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DOW.map((d) => (
          <div key={d} className="text-xs leading-7 font-semibold text-label-2">{d}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className="grid h-[34px] place-items-center">
            {d !== null && (
              <span
                className={cn(
                  'grid h-[30px] w-[30px] place-items-center rounded-full text-sm tabular-nums',
                  d === now.getDate() && 'lumen-lit font-bold',
                )}
              >
                {d}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Bell button for system tray ──────────────────────────

export function NotificationBell() {
  const { notifications, togglePanel, panelOpen } = useNotificationStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
            panelOpen ? 'bg-fill-2' : 'hover:bg-fill'
          }`}
          onClick={togglePanel}
        >
          {unreadCount > 0 ? (
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
          ) : (
            <BellOff className="w-[18px] h-[18px] text-label-3" strokeWidth={1.75} />
          )}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-solid" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={10}>
        {unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
          : 'No notifications'}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Notification Center Panel ────────────────────────────

export function NotificationCenter() {
  const {
    notifications,
    panelOpen,
    closePanel,
    dismiss,
    markRead,
    markAllRead,
    clearAll,
  } = useNotificationStore();

  const panelRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.read).length;

  // Close on click outside
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    // Delay to avoid capturing the click that opened the panel
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [panelOpen, closePanel]);

  // Close on Escape
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [panelOpen, closePanel]);

  if (!panelOpen) return null;

  // The glass cards animate, not this wrapper: an animated ancestor becomes a
  // backdrop root and the cards' backdrop-filter would stop blurring.
  return (
    <div
      ref={panelRef}
      className="fixed bottom-[92px] right-[14px] top-3 z-[10001] flex w-[360px] max-w-[calc(100vw-28px)] flex-col justify-end gap-3 pointer-events-none"
    >
      <div className="glass-heavy pointer-events-auto flex min-h-[150px] flex-col gap-3 overflow-hidden rounded-[28px] p-4 animate-panelIn">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Notifications</h2>
          {unreadCount > 0 && (
            <Badge variant="default">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={markAllRead}
                  aria-label="Mark all read"
                >
                  <CheckCheck className="!h-4 !w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Mark all read</TooltipContent>
            </Tooltip>
          )}
          {notifications.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={clearAll}
                  aria-label="Clear all"
                >
                  <Trash2 className="!h-4 !w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Clear all</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={closePanel}
            aria-label="Close notifications"
          >
            <X className="!h-4 !w-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <ScrollArea className="max-h-[420px] min-h-0">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-1 py-5 text-label-2">
            <BellOff className="mb-2 h-7 w-7 text-label-3" strokeWidth={1.75} />
            <p className="text-sm">No new notifications</p>
            <p className="mt-0.5 text-xs text-label-3">You're all caught up</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map(n => (
              <div
                key={n.id}
                className={cn(
                  'lumen-card group flex cursor-default items-start gap-3.5 rounded-[22px] py-3 pl-3.5 pr-3 transition-colors',
                  !n.read && 'ring-1 ring-accent-glow',
                )}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                }}
              >
                {/* Type icon */}
                <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border', TYPE_TILE[n.type])}>
                  {TYPE_ICON[n.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-[14px] font-semibold ${!n.read ? 'text-foreground' : 'text-label-2'}`}>
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-solid" />
                    )}
                  </div>
                  {n.message && (
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-label-2">
                      {n.message}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-label-3">
                      {timeAgo(n.timestamp)}
                    </span>
                    {n.source && (
                      <span className="text-[11px] text-label-3">
                        · {n.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!n.read && (
                    <button
                      className="grid h-7 w-7 place-items-center rounded-full text-label-2 hover:bg-fill hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                      title="Mark read"
                    >
                      <Check className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  )}
                  <button
                    className="grid h-7 w-7 place-items-center rounded-full text-label-2 hover:bg-fill hover:text-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(n.id);
                    }}
                    title="Dismiss"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      </div>

      <div className="pointer-events-auto">
        <MonthCalendar />
      </div>
    </div>
  );
}
