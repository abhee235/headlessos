// M2.X: Desktop Layout — Windows-like shell replacing sidebar+tab layout
// @see docs/phases/phase-2.md

import { useEffect } from 'react';
import { useAppStore } from '../../store/app-store';
import { Desktop } from './Desktop';
import { Taskbar } from './Taskbar';
import { StartMenu } from './StartMenu';
import { WindowManager } from './WindowManager';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

export function DesktopLayout() {
  const fetchServers = useAppStore(s => s.fetchServers);

  // Load servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

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
