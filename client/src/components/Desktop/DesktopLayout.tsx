// M2.X + M5.6e: Desktop Layout — Windows-like shell with global keyboard shortcuts
// @see docs/phases/phase-2.md

import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore, type SnapZone } from '../../store/window-store';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { Desktop } from './Desktop';
import { Taskbar } from './Taskbar';
import { StartMenu } from './StartMenu';
import { WindowManager } from './WindowManager';
import { CommandPalette } from './CommandPalette';
import { WelcomeDialog } from './WelcomeDialog';
import { NotificationCenter } from './NotificationCenter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

// ── Snap Preview Overlay ────────────────────────────────

function SnapPreview({ zone }: { zone: SnapZone }) {
  if (!zone) return null;

  const taskbarH = 56;
  const style: React.CSSProperties = (() => {
    switch (zone) {
      case 'maximize':
        return { top: 0, left: 0, right: 0, bottom: taskbarH };
      case 'left':
        return { top: 0, left: 0, width: '50%', bottom: taskbarH };
      case 'right':
        return { top: 0, right: 0, width: '50%', bottom: taskbarH };
      case 'top-left':
        return { top: 0, left: 0, width: '50%', height: `calc(50% - ${taskbarH / 2}px)` };
      case 'top-right':
        return { top: 0, right: 0, width: '50%', height: `calc(50% - ${taskbarH / 2}px)` };
      case 'bottom-left':
        return { bottom: taskbarH, left: 0, width: '50%', height: `calc(50% - ${taskbarH / 2}px)` };
      case 'bottom-right':
        return { bottom: taskbarH, right: 0, width: '50%', height: `calc(50% - ${taskbarH / 2}px)` };
      default:
        return {};
    }
  })();

  return (
    <div
      className="fixed z-[9999] pointer-events-none rounded-2xl border-2 border-primary/40 bg-primary/10 backdrop-blur-sm transition-all duration-150 ease-out"
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

  // Global keyboard shortcuts (Alt+F4, Ctrl+Space, Ctrl+Tab, Ctrl+`, Ctrl+Shift+Esc)
  useKeyboardShortcuts();

  return (
    <TooltipProvider delayDuration={400}>
      <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none">
        {/* Desktop — wallpaper + icons */}
        <Desktop />

        {/* Windows — rendered above desktop */}
        <WindowManager />

        {/* Start Menu — pops up above taskbar */}
        <StartMenu />

        {/* Taskbar — bottom bar */}
        <Taskbar />

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
      </div>
    </TooltipProvider>
  );
}
