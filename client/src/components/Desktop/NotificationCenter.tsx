// M10.1: Notification Center — slide-out panel with notification history
// @see docs/PROGRESS.md

import { useEffect, useRef } from 'react';
import { Bell, BellOff, X, Check, CheckCheck, Trash2, Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useNotificationStore, type NotificationType } from '../../store/notification-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ── Type icon map ────────────────────────────────────────

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  info: <Info className="w-4 h-4 text-primary" />,
  success: <CheckCircle className="w-4 h-4 text-success" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  error: <AlertCircle className="w-4 h-4 text-destructive" />,
};

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
          className={`relative flex items-center justify-center w-9 h-9 rounded-md transition-colors ${
            panelOpen ? 'bg-foreground/10' : 'hover:bg-foreground/5'
          }`}
          onClick={togglePanel}
        >
          {unreadCount > 0 ? (
            <Bell className="w-4 h-4 text-foreground/80" />
          ) : (
            <BellOff className="w-4 h-4 text-foreground/40" />
          )}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
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

  return (
    <div
      ref={panelRef}
      className="fixed right-2 bottom-[60px] w-[380px] max-h-[500px] z-[10001] rounded-xl border border-border bg-background/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden animate-windowOpen"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
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
                  className="w-7 h-7"
                  onClick={markAllRead}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
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
                  className="w-7 h-7"
                  onClick={clearAll}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Clear all</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7"
            onClick={closePanel}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1 max-h-[420px]">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BellOff className="w-8 h-8 mb-3 opacity-30" />
            <p className="text-sm">No notifications</p>
            <p className="text-xs opacity-60 mt-1">You're all caught up</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30 cursor-default group ${
                  !n.read ? 'bg-primary/3' : ''
                }`}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                }}
              >
                {/* Type icon */}
                <div className="mt-0.5 shrink-0">
                  {TYPE_ICON[n.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-medium truncate ${!n.read ? 'text-foreground' : 'text-foreground/70'}`}>
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {n.message}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground/60">
                      {timeAgo(n.timestamp)}
                    </span>
                    {n.source && (
                      <span className="text-[10px] text-muted-foreground/40">
                        · {n.source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!n.read && (
                    <button
                      className="p-1 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                      title="Mark read"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    className="p-1 rounded hover:bg-accent text-muted-foreground/50 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(n.id);
                    }}
                    title="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
