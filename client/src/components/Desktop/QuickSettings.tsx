// EX8.4: Quick Settings — the LumenOS "Control Center" panel, opened from the
// tray pill. Named QuickSettings because ControlCenter/ is the server picker.
// Tiles are HeadlessOS's real controls: server connection, notifications,
// dark mode, transparency, glass strength and accent, Settings and Lock.
// @see docs/phases/phase-ex8.md

import { useEffect, useRef } from 'react';
import {
  Server,
  ServerOff,
  Bell,
  BellOff,
  Moon,
  Droplet,
  Monitor,
  Palette,
  Settings,
  Lock,
  Check,
  Plus,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { useThemeStore } from '../../store/theme-store';
import { useNotificationStore } from '../../store/notification-store';
import { useEffectivePref } from '../../store/effective-preferences';
import { GLASS_STRENGTHS, LUMEN_ACCENTS } from '../../lib/lumen-theme';
import { cn } from '@/lib/utils';

// ── Building blocks ─────────────────────────────────────

/** 44px round orb: lit accent when on, recessed well when off. */
function Orb({ icon: Icon, on, spinning = false }: { icon: LucideIcon; on: boolean; spinning?: boolean }) {
  return (
    <span
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-all duration-200',
        on ? 'lumen-lit border border-white/20' : 'lumen-well text-foreground',
      )}
    >
      <Icon className={cn('h-[21px] w-[21px]', spinning && 'animate-spin')} strokeWidth={1.75} />
    </span>
  );
}

function StatusCard({
  icon,
  title,
  sub,
  on,
  busy = false,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  on: boolean;
  busy?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="lumen-card flex min-w-0 flex-col gap-4 rounded-[22px] px-4 pt-3.5 pb-4 text-left transition-colors hover:brightness-105 disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
    >
      <span className="flex w-full items-center justify-between">
        <Orb icon={busy ? Loader2 : icon} on={on} spinning={busy} />
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            on ? 'bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--success)_18%,transparent),0_0_10px_var(--success)]' : 'bg-fill-2',
          )}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="truncate text-[13px] text-label-2">{sub}</span>
      </span>
    </button>
  );
}

function ModeButton({ icon, label, on, onClick }: { icon: LucideIcon; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className="flex flex-col items-center gap-2" onClick={onClick} title={label} aria-pressed={on}>
      <Orb icon={icon} on={on} />
      <span className={cn('text-xs font-medium', on ? 'text-foreground' : 'text-label-2')}>{label}</span>
    </button>
  );
}

function RoundButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      className="lumen-well grid h-10 w-10 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-chip-2"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}

// ── Panel ───────────────────────────────────────────────

export function QuickSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  const servers = useAppStore((s) => s.servers);
  const activeServerId = useAppStore((s) => s.activeServerId);
  const setActiveServer = useAppStore((s) => s.setActiveServer);
  const connectServer = useAppStore((s) => s.connectServer);
  const disconnectServer = useAppStore((s) => s.disconnectServer);
  const lockScreen = useAppStore((s) => s.lockScreen);
  const openWindow = useDesktopStore((s) => s.openWindow);
  const toggleShowDesktop = useDesktopStore((s) => s.toggleShowDesktop);

  const showToasts = usePreferencesStore((s) => s.showToasts);
  const setShowToasts = usePreferencesStore((s) => s.setShowToasts);
  const transparency = usePreferencesStore((s) => s.transparency);
  const setTransparency = usePreferencesStore((s) => s.setTransparency);
  const glassStrength = usePreferencesStore((s) => s.glassStrength);
  const setGlassStrength = usePreferencesStore((s) => s.setGlassStrength);
  const setAccentColorIndex = usePreferencesStore((s) => s.setAccentColorIndex);
  const accentColorIndex = useEffectivePref('accentColorIndex');
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const unread = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);

  const activeServer = servers.find((s) => s.id === activeServerId);
  const status = activeServer?.state?.status ?? 'disconnected';
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  // Close on outside click (the tray pill toggles it itself) and on Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (panelRef.current?.contains(target)) return;
      if (target.closest?.('[data-quick-settings-anchor]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const openSettings = () => {
    if (activeServerId) openWindow('settings', activeServerId, 'Settings', 'settings');
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="glass-heavy absolute bottom-[92px] right-[14px] z-[10000] flex w-[360px] max-w-[calc(100vw-28px)] flex-col gap-3 rounded-[30px] p-3.5 animate-panelIn"
      role="dialog"
      aria-label="Quick settings"
    >
      {/* ── Status cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard
          icon={isConnected ? Server : ServerOff}
          title="Server"
          sub={
            !activeServer
              ? 'No server'
              : isConnecting
                ? 'Connecting…'
                : isConnected
                  ? activeServer.name
                  : 'Disconnected'
          }
          on={isConnected}
          busy={isConnecting}
          disabled={!activeServer || isConnecting}
          onClick={() => {
            if (!activeServer) return;
            if (isConnected) disconnectServer(activeServer.id);
            else connectServer(activeServer.id);
          }}
        />
        <StatusCard
          icon={showToasts ? Bell : BellOff}
          title="Notifications"
          sub={!showToasts ? 'Muted' : unread > 0 ? `${unread} unread` : 'All caught up'}
          on={showToasts}
          onClick={() => setShowToasts(!showToasts)}
        />
      </div>

      {/* ── Modes ── */}
      <div className="lumen-card grid grid-cols-4 rounded-[22px] px-2 pt-3.5 pb-3">
        <ModeButton
          icon={Moon}
          label="Dark"
          on={resolvedTheme === 'dark'}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        />
        <ModeButton icon={Droplet} label="Glass" on={transparency} onClick={() => setTransparency(!transparency)} />
        <ModeButton
          icon={Monitor}
          label="Desktop"
          on={false}
          onClick={() => {
            toggleShowDesktop();
            onClose();
          }}
        />
        <ModeButton
          icon={Palette}
          label="Personalize"
          on={false}
          onClick={() => {
            if (activeServerId) {
              openWindow('settings', activeServerId, 'Settings', 'settings', { initialPage: 'wallpaper' });
            }
            onClose();
          }}
        />
      </div>

      {/* ── Appearance: glass strength + accent ── */}
      <div className="lumen-card flex flex-col gap-3 rounded-[22px] px-[18px] py-3.5">
        <div className="flex items-center gap-3">
          <span className="w-14 text-[13px] text-label-2">Glass</span>
          <div className="flex flex-1 rounded-full bg-fill p-[3px]" role="radiogroup" aria-label="Glass strength">
            {GLASS_STRENGTHS.map((g) => (
              <button
                key={g.id}
                role="radio"
                aria-checked={glassStrength === g.id}
                disabled={!transparency}
                className={cn(
                  'h-7 flex-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-40',
                  glassStrength === g.id
                    ? 'bg-mat-thick text-foreground shadow-[0_1px_3px_rgba(0,0,0,.18),var(--lumen-spec)]'
                    : 'text-label-2 hover:text-foreground',
                )}
                onClick={() => setGlassStrength(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-14 text-[13px] text-label-2">Accent</span>
          <div className="flex flex-1 items-center justify-between" role="radiogroup" aria-label="Accent colour">
            {LUMEN_ACCENTS.map((a, idx) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={accentColorIndex === idx}
                aria-label={a.name}
                title={a.name}
                className={cn(
                  'h-6 w-6 rounded-full transition-transform hover:scale-110',
                  accentColorIndex === idx && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-transparent',
                )}
                style={{ background: a.swatch }}
                onClick={() => setAccentColorIndex(idx)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Server list (switch the active session) ── */}
      {servers.length > 1 && (
        <div className="lumen-card flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-[22px] p-1.5">
          {servers.map((srv) => {
            const isActive = srv.id === activeServerId;
            const st = srv.state?.status;
            return (
              <button
                key={srv.id}
                className={cn(
                  'flex h-11 shrink-0 items-center gap-2.5 rounded-[14px] px-2.5 text-left transition-colors',
                  isActive ? 'bg-accent-soft' : 'hover:bg-fill',
                )}
                onClick={() => {
                  setActiveServer(srv.id);
                  if (st !== 'connected' && st !== 'connecting') connectServer(srv.id);
                }}
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    st === 'connected' ? 'bg-success' : st === 'connecting' ? 'bg-warning animate-pulse' : 'bg-fill-2',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[13px] font-semibold', isActive && 'text-accent-text')}>
                    {srv.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-label-3">
                    {srv.host}:{srv.port}
                  </span>
                </span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-accent-text" strokeWidth={2} />}
              </button>
            );
          })}
          <button
            className="flex h-9 shrink-0 items-center gap-2 rounded-[14px] px-2.5 text-[13px] text-label-2 transition-colors hover:bg-fill hover:text-foreground"
            onClick={openSettings}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Server
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center gap-2.5 pl-2 pr-0.5 pt-0.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-label-2">
          {activeServer ? `${activeServer.username}@${activeServer.host}` : 'Not connected'}
        </span>
        <RoundButton icon={Settings} label="All settings" onClick={openSettings} />
        <RoundButton
          icon={Lock}
          label="Lock"
          onClick={() => {
            onClose();
            lockScreen();
          }}
        />
      </div>
    </div>
  );
}
