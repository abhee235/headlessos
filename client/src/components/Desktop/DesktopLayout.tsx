// M2.X + M5.6e: Desktop Layout — Windows-like shell with global keyboard shortcuts
// @see docs/phases/phase-2.md

import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore, TOP_RESERVE, useDockInsets, type SnapZone } from '../../store/window-store';
import { initWindowSessionSync } from '../../store/window-session-sync';
import { initAppSessionBridge } from '../../store/app-session-bridge';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSessionShortcuts } from '../../hooks/useSessionShortcuts';
import { useAutoHibernate } from '../../hooks/useAutoHibernate';
import { Desktop } from './Desktop';
import { Taskbar } from './Taskbar';
import { MenuBar } from './MenuBar';
import { HomeHub } from '../HomeHub/HomeHub';
import { StartMenu } from './StartMenu';
import { WindowManager } from './WindowManager';
import { CommandPalette } from './CommandPalette';
import { WelcomeDialog } from './WelcomeDialog';
import { NotificationCenter } from './NotificationCenter';
import { SessionSwitcher } from './SessionSwitcher';
import { WakeConfirmDialog } from './WakeConfirmDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// ── Snap Preview Overlay ────────────────────────────────

function SnapPreview({ zone }: { zone: SnapZone }) {
  const { bottom: taskbarH, right } = useDockInsets();
  if (!zone) return null;

  const top = TOP_RESERVE;
  const half = `calc(50% - ${(taskbarH + top) / 2}px)`;
  const halfW = `calc(50% - ${right / 2}px)`;
  const style: React.CSSProperties = (() => {
    switch (zone) {
      case 'maximize':
        return { top, left: 0, right, bottom: taskbarH };
      case 'left':
        return { top, left: 0, width: halfW, bottom: taskbarH };
      case 'right':
        return { top, right, width: halfW, bottom: taskbarH };
      case 'top-left':
        return { top, left: 0, width: halfW, height: half };
      case 'top-right':
        return { top, right, width: halfW, height: half };
      case 'bottom-left':
        return { bottom: taskbarH, left: 0, width: halfW, height: half };
      case 'bottom-right':
        return { bottom: taskbarH, right, width: halfW, height: half };
      default:
        return {};
    }
  })();

  return (
    <div
      className="fixed z-[9999] pointer-events-none m-2 rounded-[24px] border-2 border-accent-solid/45 bg-accent-soft backdrop-blur-sm transition-all duration-150 ease-out"
      style={style}
    />
  );
}

export function DesktopLayout() {
  const fetchServers = useAppStore(s => s.fetchServers);
  const snapPreview = useDesktopStore(s => s.snapPreview);

  // Load servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // EX6-A.7: Wire window↔session sync once
  useEffect(() => {
    initWindowSessionSync();
  }, []);

  // EX6-B (bridge): Sync legacy app-store ↔ sessions-store
  useEffect(() => {
    initAppSessionBridge();
  }, []);

  // Global keyboard shortcuts (Alt+F4, Ctrl+Space, Ctrl+Tab, Ctrl+`, Ctrl+Shift+Esc)
  useKeyboardShortcuts();

  // EX6-B.4: Session-switching shortcuts (Cmd+1..9, Cmd+Tab, Cmd+Shift+H)
  useSessionShortcuts();

  // EX6-D.5: Auto-hibernate inactive background sessions when configured
  useAutoHibernate();

  return (
    <TooltipProvider delayDuration={400}>
      <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none">
        {/* EX6-B.1: Session Switcher hover bar (renders only when desktop is active) */}
        <SessionSwitcher />

        {/* Desktop — wallpaper + icons */}
        <Desktop />

        {/* Windows — rendered above desktop */}
        <WindowManager />

        {/* Start Menu — pops up above taskbar */}
        <StartMenu />

        {/* EX8.11: top menu bar — tray glyphs, date and time */}
        <MenuBar />

        {/* Taskbar — bottom bar */}
        <Taskbar />

        {/* EX8.10: HomeHub smart-home overlay (dock Home button) — above the dock */}
        <HomeHub />

        {/* Snap zone preview */}
        <SnapPreview zone={snapPreview} />

        {/* Notification Center — system tray panel */}
        <NotificationCenter />

        {/* Command Palette — Ctrl+K */}
        <CommandPalette />

        {/* First-run onboarding */}
        <WelcomeDialog />

        {/* Toast notifications */}
        <Toaster />

        {/* EX6-D.1: Wake confirmation prompt for locked sessions */}
        <WakeConfirmDialog />
      </div>
    </TooltipProvider>
  );
}
