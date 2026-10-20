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
import { createContext, useCallback, useContext } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { usePreferencesStore, type DockPosition } from '../../store/preferences-store';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AppIcon, RecycleBinIcon } from '@/components/ui/FileIcon';
import { colourTile } from './dock-tiles';
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

/** EX8.12: which edge the dock sits on — tooltips and hover lift point away from it */
const DockSideContext = createContext<DockPosition>('bottom');

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
  const side = useContext(DockSideContext);
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
      <TooltipContent side={side === 'right' ? 'left' : 'top'} sideOffset={14}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** 50px app plate; an accent dot at its top-left marks a running app (glowing when focused). */
function DockTile({
  label,
  appId,
  bare = false,
  focused = false,
  running = false,
  dimmed = false,
  onClick,
  children,
}: {
  label: string;
  /** EX8.16: picks the app's colour tile (when the dock style is Colour) */
  appId?: string;
  /** No plate at all (Recycle Bin in the Colour style) */
  bare?: boolean;
  focused?: boolean;
  running?: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const side = useContext(DockSideContext);
  const style = usePreferencesStore((s) => s.dockIconStyle);
  const tile = style === 'color' && appId ? colourTile(appId) : null;
  const noPlate = style === 'color' && bare;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            'group relative h-[50px] w-[50px] shrink-0 rounded-[16px] transition-transform duration-[180ms] ease-out',
            side === 'right' ? 'hover:-translate-x-[5px] hover:scale-[1.07]' : 'hover:-translate-y-[5px] hover:scale-[1.07]',
            // No ring on click; keyboard focus still gets one
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dimmed && 'opacity-40',
          )}
          onClick={onClick}
        >
          {tile ? tile.plate : !noPlate && <span className="lumen-plate absolute inset-0 rounded-[16px]" />}
          <span
            className={cn(
              'absolute inset-0 grid place-items-center [&>*]:block',
              // Colour tiles carry their own contrast; keep only a hint of lift on the glyph
              tile ? 'drop-shadow-[0_1px_1px_rgba(0,0,0,.18)]' : 'drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]',
            )}
          >
            {tile ? tile.glyph : children}
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
      <TooltipContent side={side === 'right' ? 'left' : 'top'} sideOffset={16}>{label}</TooltipContent>
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
  // EX8.12: bottom-centre (default) or right-middle; only the dock moves
  const dockPosition = usePreferencesStore((s) => s.dockPosition);
  const dockIconStyle = usePreferencesStore((s) => s.dockIconStyle);
  const vertical = dockPosition === 'right';
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
    <DockSideContext.Provider value={dockPosition}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              'glass-heavy shadow-dock absolute z-[9999] flex items-center gap-2.5 rounded-[30px]',
              vertical
                ? 'right-[14px] top-[calc(50%+14px)] max-h-[calc(100vh-57px)] w-[72px] -translate-y-1/2 flex-col pb-3 pt-2.5'
                : 'bottom-[14px] left-1/2 h-[72px] max-w-[calc(100vw-28px)] -translate-x-1/2 pl-2.5 pr-3',
            )}
            aria-orientation={vertical ? 'vertical' : 'horizontal'}
            role="toolbar"
            aria-label="Dock"
          >
            {/* ── Utility well: Launcher · Home hub · Search (prototype order) ── */}
            <div
              className={cn(
                'lumen-well flex shrink-0 items-center gap-0.5 rounded-[26px]',
                vertical ? 'w-[52px] flex-col py-[5px]' : 'h-[52px] px-[5px]',
              )}
            >
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
            <div
              className={cn(
                'flex items-center gap-2 [scrollbar-width:none]',
                vertical
                  ? 'min-h-0 w-[72px] flex-col overflow-y-auto overflow-x-hidden py-0.5'
                  : 'h-[72px] min-w-0 overflow-x-auto overflow-y-hidden px-0.5',
              )}
            >
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
                          appId={appId}
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
                <span className={cn('shrink-0 bg-border', vertical ? 'my-0.5 h-px w-7' : 'mx-0.5 h-7 w-px')} />
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
                          appId={win.appId}
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
            <span className={cn('shrink-0 bg-border', vertical ? 'my-0.5 h-px w-9' : 'mx-0.5 h-9 w-px')} />
            <DockTile label="Recycle Bin" bare dimmed={!isConnected} onClick={handleOpenBin}>
              <RecycleBinIcon size={dockIconStyle === 'color' ? 44 : 32} />
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
    </DockSideContext.Provider>
  );
}
