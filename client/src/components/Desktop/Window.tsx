// M6.5: Window — modern glassmorphic window with macOS-style controls
// @see docs/phases/phase-6.md

import { useRef, useCallback, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { useDesktopStore, type WindowState, type SnapZone } from '../../store/window-store';
import {
  Minus,
  Square,
  Copy,
  X,
  LayoutDashboard,
  FolderOpen,
  Terminal,
  Settings,
  Activity,
  Box,
  Server,
  Maximize2,
  Minimize2,
  RotateCcw,
  Move,
  Telescope,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useSessionsStore } from '../../store/sessions-store';
import { useAppStore } from '../../store/app-store';
import { moveWindowToSession } from '../../store/window-session-sync';

const APP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: FolderOpen,
  terminal: Terminal,
  settings: Settings,
  taskmanager: Activity,
  docker: Box,
  services: Server,
  observatory: Telescope,
};

const APP_ACCENT: Record<string, string> = {
  dashboard: 'bg-primary',
  files: 'bg-warning',
  terminal: 'bg-success',
  settings: 'bg-primary/70',
  taskmanager: 'bg-primary/80',
  docker: 'bg-primary/80',
  services: 'bg-warning/80',
  observatory: 'bg-pink-500',
};

interface WindowFrameProps {
  win: WindowState;
  children: ReactNode;
}

export function WindowFrame({ win, children }: WindowFrameProps) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    moveWindow,
    resizeWindow,
    snapWindow,
    setSnapPreview,
  } = useDesktopStore();

  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null);

  // ── Detect snap zone from cursor position ──
  const detectSnapZone = useCallback((clientX: number, clientY: number): SnapZone => {
    const EDGE = 8; // px from edge to trigger snap
    const screenW = window.innerWidth;
    const atLeft = clientX <= EDGE;
    const atRight = clientX >= screenW - EDGE;
    const atTop = clientY <= EDGE;
    const screenH = window.innerHeight;
    const atBottom = clientY >= screenH - EDGE;

    if (atTop && atLeft) return 'top-left';
    if (atTop && atRight) return 'top-right';
    if (atBottom && atLeft) return 'bottom-left';
    if (atBottom && atRight) return 'bottom-right';
    if (atTop) return 'maximize';
    if (atLeft) return 'left';
    if (atRight) return 'right';
    return null;
  }, []);

  // ── Drag handler (title bar) ──
  const handleDragStart = useCallback(
    (e: ReactMouseEvent) => {
      // If maximized, un-maximize and re-position proportionally
      if (win.maximized) {
        const ratio = e.clientX / window.innerWidth;
        const newW = win.preSnap?.width ?? 800;
        const newX = e.clientX - newW * ratio;
        restoreWindow(win.id);
        // Small delay so restore takes effect
        requestAnimationFrame(() => {
          moveWindow(win.id, Math.max(0, newX), 0);
        });
      }
      e.preventDefault();
      focusWindow(win.id);

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        winX: win.x,
        winY: win.y,
      };

      const handleMove = (ev: globalThis.MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        moveWindow(win.id, dragRef.current.winX + dx, dragRef.current.winY + dy);
        // Detect snap zone while dragging
        setSnapPreview(detectSnapZone(ev.clientX, ev.clientY));
      };

      const handleUp = (ev: globalThis.MouseEvent) => {
        dragRef.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        // Apply snap if cursor ended on an edge
        const zone = detectSnapZone(ev.clientX, ev.clientY);
        setSnapPreview(null);
        if (zone) {
          snapWindow(win.id, zone);
        }
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [win.id, win.x, win.y, win.maximized, win.preSnap, focusWindow, moveWindow, restoreWindow, snapWindow, setSnapPreview, detectSnapZone],
  );

  // ── Resize handler (bottom-right corner) ──
  const handleResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      if (win.maximized) return;
      e.preventDefault();
      e.stopPropagation();

      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        winW: win.width,
        winH: win.height,
      };

      const handleMove = (ev: globalThis.MouseEvent) => {
        if (!resizeRef.current) return;
        const dw = ev.clientX - resizeRef.current.startX;
        const dh = ev.clientY - resizeRef.current.startY;
        resizeWindow(win.id, resizeRef.current.winW + dw, resizeRef.current.winH + dh);
      };

      const handleUp = () => {
        resizeRef.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [win.id, win.width, win.height, win.maximized, resizeWindow],
  );

  const handleDoubleClickTitle = () => {
    if (win.maximized) restoreWindow(win.id);
    else maximizeWindow(win.id);
  };

  if (win.minimized) return null;

  const Icon = APP_ICONS[win.appId] ?? LayoutDashboard;
  const accent = APP_ACCENT[win.appId] ?? 'bg-muted-foreground';

  // Split-sidebar title bar experiment — for apps that have a left sidebar pane
  const isSidebarApp = win.appId === 'files';

  const style = win.maximized
    ? { top: 0, left: 0, right: 0, bottom: 56, zIndex: win.zIndex }
    : {
        top: win.y,
        left: win.x,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      className={`
        absolute flex flex-col
        ${win.maximized ? 'rounded-none' : 'rounded-2xl'}
        ${win.focused ? 'shadow-window' : 'shadow-window-unfocused'}
        overflow-hidden
        transition-shadow duration-300 ease-out
        bg-background
        border
        ${win.focused
          ? 'border-black/8 dark:border-white/12'
          : 'border-black/4 dark:border-white/6'
        }
        animate-windowOpen
      `}
      style={{
        ...style,
        transition: win.maximized || win.preSnap
          ? 'top 150ms ease-out, left 150ms ease-out, right 150ms ease-out, bottom 150ms ease-out, width 150ms ease-out, height 150ms ease-out, box-shadow 300ms ease-out'
          : 'box-shadow 300ms ease-out',
      }}
      onMouseDown={() => {
        if (!win.focused) focusWindow(win.id);
      }}
    >
      {/* ── Title Bar ── */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="flex h-10 shrink-0 select-none"
            onMouseDown={handleDragStart}
            onDoubleClick={handleDoubleClickTitle}
          >
            {/* ── Sidebar header section (only for sidebar apps) ── */}
            {isSidebarApp && (
              <div
                className={`
                  w-56 shrink-0 flex items-center gap-2.5 px-5
                  bg-sidebar border-r border-black/6 dark:border-white/6
                  ${win.focused ? '' : 'opacity-80'}
                `}
              >
                <div className={`w-1 h-4 rounded-full ${accent} ${win.focused ? 'opacity-80' : 'opacity-30'} transition-opacity shrink-0`} />
                <Icon className={`w-3.5 h-3.5 shrink-0 transition-colors ${win.focused ? 'text-foreground/60' : 'text-foreground/25'}`} />
                <span className={`text-[13px] font-semibold truncate transition-colors ${win.focused ? 'text-foreground/70' : 'text-foreground/30'}`}>
                  {win.title}
                </span>
              </div>
            )}

            {/* ── Main header section (glass, drag, controls) ── */}
            <div
              className={`
                flex-1 flex items-center min-w-0 px-4
                ${isSidebarApp ? 'bg-background' : ''}
              `}
            >
              {/* Icon + Title (only for non-sidebar apps) */}
              {!isSidebarApp && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`w-1 h-4 rounded-full ${accent} ${win.focused ? 'opacity-80' : 'opacity-30'} transition-opacity shrink-0`} />
                  <Icon className={`w-3.5 h-3.5 shrink-0 transition-colors ${win.focused ? 'text-foreground/60' : 'text-foreground/30'}`} />
                  <span className={`text-[13px] truncate transition-colors font-medium ${win.focused ? 'text-foreground/80' : 'text-foreground/35'}`}>
                    {win.title}
                  </span>
                </div>
              )}
              {/* Spacer for sidebar apps so controls push to the right */}
              {isSidebarApp && <div className="flex-1" />}

              {/* Window controls (right side) — Windows 11 style */}
              <div className="flex items-center gap-1 shrink-0" onMouseDown={e => e.stopPropagation()}>
                {/* Minimize */}
                <button
                  className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors duration-100
                    ${win.focused
                      ? 'text-foreground/50 hover:text-foreground hover:bg-separator'
                      : 'text-foreground/20 hover:text-foreground/40 hover:bg-black/4 dark:hover:bg-white/5'
                    }`}
                  onClick={() => minimizeWindow(win.id)}
                  title="Minimize"
                >
                  <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
                {/* Maximize / Restore */}
                <button
                  className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors duration-100
                    ${win.focused
                      ? 'text-foreground/50 hover:text-foreground hover:bg-separator'
                      : 'text-foreground/20 hover:text-foreground/40 hover:bg-black/4 dark:hover:bg-white/5'
                    }`}
                  onClick={() => (win.maximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
                  title={win.maximized ? 'Restore' : 'Maximize'}
                >
                  {win.maximized
                    ? <Copy className="w-3 h-3" strokeWidth={2} />
                    : <Square className="w-3 h-3" strokeWidth={2} />
                  }
                </button>
                {/* Close */}
                <button
                  className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors duration-100
                    ${win.focused
                      ? 'text-foreground/50 hover:text-white hover:bg-destructive'
                      : 'text-foreground/20 hover:text-white/90 hover:bg-destructive/80'
                    }`}
                  onClick={() => closeWindow(win.id)}
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => restoreWindow(win.id)}
            disabled={!win.maximized}
          >
            <RotateCcw className="w-4 h-4 mr-2 opacity-60" />
            Restore
          </ContextMenuItem>
          <ContextMenuItem disabled>
            <Move className="w-4 h-4 mr-2 opacity-60" />
            Move
          </ContextMenuItem>
          <MoveToSessionSubmenu windowId={win.id} sourceServerId={win.serverId} />
          <ContextMenuItem
            onClick={() => minimizeWindow(win.id)}
          >
            <Minimize2 className="w-4 h-4 mr-2 opacity-60" />
            Minimize
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => maximizeWindow(win.id)}
            disabled={win.maximized}
          >
            <Maximize2 className="w-4 h-4 mr-2 opacity-60" />
            Maximize
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            danger
            onClick={() => closeWindow(win.id)}
          >
            <X className="w-4 h-4 mr-2" />
            Close
            <ContextMenuShortcut>Alt+F4</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* ── Window Content ── */}
      <div
        className="flex-1 min-h-0 overflow-auto"
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      >
        {children}
      </div>

      {/* ── Resize Handle (bottom-right) ── */}
      {!win.maximized && (
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-10 group"
          onMouseDown={handleResizeStart}
        >
          <svg className="absolute bottom-1 right-1 w-3 h-3 text-foreground/15 group-hover:text-foreground/30 transition-colors" viewBox="0 0 12 12">
            <circle cx="10" cy="10" r="1.2" fill="currentColor" />
            <circle cx="6" cy="10" r="1.2" fill="currentColor" />
            <circle cx="10" cy="6" r="1.2" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ── EX6-D.2: "Move to session" context-menu submenu ────────────

function MoveToSessionSubmenu({
  windowId,
  sourceServerId,
}: {
  windowId: string;
  sourceServerId: string;
}) {
  const sessions = useSessionsStore((s) => s.sessions);
  const servers = useAppStore((s) => s.servers);

  // Only LIVE sessions other than the source can be drop targets in v1.
  const targets = Object.values(sessions).filter((s) => s.serverId !== sourceServerId);

  if (targets.length === 0) {
    return (
      <ContextMenuItem disabled>
        <Move className="w-4 h-4 mr-2 opacity-60" />
        Move to session…
        <span className="ml-auto text-[10px] text-muted-foreground">none</span>
      </ContextMenuItem>
    );
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Move className="w-4 h-4 mr-2 opacity-60" />
        Move to session
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {targets.map((t) => {
          const name = servers.find((s) => s.id === t.serverId)?.name ?? t.serverId;
          return (
            <ContextMenuItem
              key={t.serverId}
              onClick={() => {
                moveWindowToSession(windowId, t.serverId);
              }}
            >
              {name}
            </ContextMenuItem>
          );
        })}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
