// M2.X + M5.6e: Desktop Layout — Windows-like shell with global keyboard shortcuts
// @see docs/phases/phase-2.md

import { useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { Desktop } from './Desktop';
import { Taskbar } from './Taskbar';
import { StartMenu } from './StartMenu';
import { WindowManager } from './WindowManager';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export function DesktopLayout() {
  const fetchServers = useAppStore(s => s.fetchServers);
  const activeServerId = useAppStore(s => s.activeServerId);
  const servers = useAppStore(s => s.servers);
  const openWindow = useDesktopStore(s => s.openWindow);

  // Load servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // F5 — Refresh
    if (e.key === 'F5') {
      e.preventDefault();
      toast.success('Refreshed');
      return;
    }

    // Ctrl+Shift+Esc (Win) or Cmd+Shift+Esc (Mac) — Open Task Manager
    if (e.key === 'Escape' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const server = servers.find(s => s.id === activeServerId);
      if (server?.state?.status === 'connected' && activeServerId) {
        openWindow('taskmanager', activeServerId, 'Task Manager', 'taskmanager');
      }
      return;
    }
  }, [activeServerId, servers, openWindow]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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

        {/* Toast notifications */}
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
