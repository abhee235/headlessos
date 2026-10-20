// M6.6: Taskbar — pinned apps + system tray
// EX8.4: LumenOS v3 — a floating, centred glass dock (utility well → app
// tiles → Recycle Bin) plus a separate tray pill at the bottom-right that
// opens Quick Settings (glyphs) and the Notification Center (clock).
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  Grip,
  Monitor,
  House,
  Search,
  Activity,
  Settings,
  X,
  Pin,
  PinOff,
} from 'lucide-react';
import { useCallback } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AppIcon, RecycleBinIcon } from '@/components/ui/FileIcon';
import { cn } from '@/lib/utils';
import { eventBus } from '@/lib/event-bus';

// ─── All known dock apps (label) ─────────────────────────────────────────────

const APP_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  files: 'File Explorer',
  terminal: 'Terminal',
  docker: 'Docker',
  taskmanager: 'Task Manager',
  services: 'Services',
  settings: 'Settings',
  serveradmin: 'Server Admin',
  // EX6-C.3: Fleet moved to Control Center
  agent: 'AI Agent',
};

/** The dock's Search button toggles the CommandPalette (same as Ctrl+K). */
function openCommandPalette() {
  eventBus.emit('palette:toggle', {});
}

// ─── Dock pieces ─────────────────────────────────────────────────────────────

/** 42px round button inside the recessed utility well. */
function WellButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            'grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-foreground transition-colors duration-200',
            '[&_svg]:h-5 [&_svg]:w-5',
            active ? 'bg-accent-soft text-accent-text' : 'hover:bg-dock-hover',
          )}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={14}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** 50px app plate; an accent dot at its top-left marks a running app (glowing when focused). */
function DockTile({
  label,
  focused = false,
  running = false,
  dimmed = false,
  onClick,
  children,
}: {
  label: string;
  focused?: boolean;
  running?: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            'group relative h-[50px] w-[50px] shrink-0 rounded-[16px] transition-transform duration-[180ms] ease-out',
            'hover:-translate-y-[5px] hover:scale-[1.07]',
            // No ring on click; keyboard focus still gets one
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dimmed && 'opacity-40',
          )}
          onClick={onClick}
        >
          <span className="lumen-plate absolute inset-0 rounded-[16px]" />
          <span className="absolute inset-0 grid place-items-center drop-shadow-[0_2px_3px_rgba(0,0,0,.3)] [&>*]:block">
            {children}
          </span>
          {(focused || running) && (
            <span
              aria-hidden
              className={cn(
                'absolute left-[5px] top-[5px] size-[7px] rounded-full bg-accent-solid shadow-[0_0_0_1.5px_rgba(0,0,0,.28)] transition-[opacity,box-shadow] duration-200',
                focused
                  ? 'shadow-[0_0_0_1.5px_rgba(0,0,0,.28),0_0_8px_var(--lumen-accent-glow)]'
                  : 'opacity-55',
              )}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={16}>{label}</TooltipContent>
    </Tooltip>
  );
}

// ─── Taskbar ─────────────────────────────────────────────────────────────────

export function Taskbar() {
  const {
    windows,
    focusWindow,
    minimizeWindow,
    restoreWindow,
    closeWindow,
    openWindow,
    toggleStartMenu,
    toggleHomeHub,
    homeHubOpen,
    startMenuOpen,
  } = useDesktopStore();
  const { activeServerId } = useAppStore();
  const isConnected = useAppStore(
    (s) => s.servers.find((srv) => srv.id === s.activeServerId)?.state?.status === 'connected',
  );
  const pinnedAppIds = usePreferencesStore(s => s.pinnedAppIds);
  const pinApp = usePreferencesStore(s => s.pinApp);
  const unpinApp = usePreferencesStore(s => s.unpinApp);

  // Pinned apps from preferences (unknown ids are skipped)
  const pinnedApps = pinnedAppIds.filter((id) => id in APP_LABELS);

  // Click handler for pinned/running app icons
  const handleAppClick = useCallback(
    (appId: string, existingWindow?: { id: string; focused: boolean; minimized: boolean }) => {
      if (existingWindow) {
        if (existingWindow.focused && !existingWindow.minimized) {
          minimizeWindow(existingWindow.id);
        } else if (existingWindow.minimized) {
          restoreWindow(existingWindow.id);
        } else {
          focusWindow(existingWindow.id);
        }
      } else if (activeServerId && isConnected) {
        openWindow(appId, activeServerId, APP_LABELS[appId] ?? appId, appId);
      }
    },
    [activeServerId, isConnected, focusWindow, minimizeWindow, restoreWindow, openWindow],
  );

  const handleShowDesktop = useCallback(() => {
    useDesktopStore.getState().toggleShowDesktop();
  }, []);

  const handleOpenBin = useCallback(() => {
    if (!activeServerId || !isConnected) return;
    // Same target as the desktop Recycle Bin icon: Files on the trash virtual folder
    openWindow('files', activeServerId, 'Recycle Bin', 'files', { initialPath: '__trash__' });
  }, [activeServerId, isConnected, openWindow]);

  const pinnedIdSet = new Set(pinnedAppIds);
  // EX6-D: Citrix-style session isolation — only show running windows
  // that belong to the active session in the taskbar.
  const sessionWindows = activeServerId
    ? windows.filter((w) => w.serverId === activeServerId)
    : [];
  const unpinnedWindows = sessionWindows.filter((w) => !pinnedIdSet.has(w.appId));

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="glass-heavy shadow-dock absolute bottom-[14px] left-1/2 z-[9999] flex h-[72px] max-w-[calc(100vw-28px)] -translate-x-1/2 items-center gap-2.5 rounded-[30px] pl-2.5 pr-3"
            role="toolbar"
            aria-label="Dock"
          >
            {/* ── Utility well: Launcher · Home hub · Search (prototype order) ── */}
            <div className="lumen-well flex h-[52px] shrink-0 items-center gap-0.5 rounded-[26px] px-[5px]">
              <WellButton
                label="Launcher"
                active={startMenuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStartMenu();
                }}
              >
                <Grip strokeWidth={1.75} />
              </WellButton>
              <WellButton
                label="Home hub"
                active={homeHubOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHomeHub();
                }}
              >
                <House strokeWidth={1.75} />
              </WellButton>
              <WellButton label="Search (Ctrl+K)" onClick={openCommandPalette}>
                <Search strokeWidth={1.75} />
              </WellButton>
            </div>

            {/* ── Pinned apps + running extras ── */}
            <div className="flex h-[72px] min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden px-0.5 [scrollbar-width:none]">
              {pinnedApps.map((appId) => {
                const label = APP_LABELS[appId] ?? appId;
                const win = windows.find((w) => w.appId === appId && w.serverId === activeServerId);
                const isOpen = !!win;
                const isFocused = !!win && win.focused && !win.minimized;

                return (
                  <ContextMenu key={appId}>
                    <ContextMenuTrigger asChild>
                      {/* flex: a block wrapper adds baseline space under the tile */}
                      <div className="flex">
                        <DockTile
                          label={label}
                          focused={isFocused}
                          running={isOpen}
                          dimmed={!isConnected && !isOpen}
                          onClick={() => handleAppClick(appId, win ?? undefined)}
                        >
                          <AppIcon appId={appId} size={32} />
                        </DockTile>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem className="pointer-events-none font-semibold">
                        <AppIcon appId={appId} size={17} />
                        {label}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => unpinApp(appId)}>
                        <PinOff />
                        Unpin from Dock
                      </ContextMenuItem>
                      {isOpen && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem danger onClick={() => win && closeWindow(win.id)}>
                            <X />
                            Close Window
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}

              {unpinnedWindows.length > 0 && pinnedApps.length > 0 && (
                <span className="mx-0.5 mb-2.5 h-7 w-px shrink-0 self-end bg-border" />
              )}

              {unpinnedWindows.map((win) => {
                const isFocused = win.focused && !win.minimized;
                return (
                  <ContextMenu key={win.id}>
                    <ContextMenuTrigger asChild>
                      {/* flex: a block wrapper adds baseline space under the tile */}
                      <div className="flex">
                        <DockTile
                          label={win.title}
                          focused={isFocused}
                          running={!win.minimized}
                          onClick={() =>
                            handleAppClick(win.appId, {
                              id: win.id,
                              focused: win.focused,
                              minimized: win.minimized,
                            })
                          }
                        >
                          <AppIcon appId={win.appId} size={32} />
                        </DockTile>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem className="pointer-events-none font-semibold">
                        <AppIcon appId={win.appId} size={17} />
                        {win.title}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => pinApp(win.appId)}>
                        <Pin />
                        Pin to Dock
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem danger onClick={() => closeWindow(win.id)}>
                        <X />
                        Close Window
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>

            {/* ── Divider, then Recycle Bin ── */}
            <span className="mx-0.5 h-9 w-px shrink-0 bg-border" />
            <DockTile label="Recycle Bin" dimmed={!isConnected} onClick={handleOpenBin}>
              <RecycleBinIcon size={32} />
            </DockTile>
          </div>
        </ContextMenuTrigger>

        {/* Dock context menu */}
        <ContextMenuContent>
          <ContextMenuItem onClick={handleShowDesktop}>
            <Monitor />
            Show Desktop
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!isConnected}
            onClick={() => {
              if (activeServerId) {
                openWindow('taskmanager', activeServerId, 'Task Manager', 'taskmanager');
              }
            }}
          >
            <Activity />
            Task Manager
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled>
            <Settings />
            Dock Settings
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* EX8.11: the tray moved to the top menu bar (MenuBar.tsx) */}
    </>
  );
}
