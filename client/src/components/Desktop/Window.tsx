// M6.5: Window — glassmorphic desktop window
// EX8.3: LumenOS v3 chrome — .glass frame, 24px radius, 44px title bar with the
// app icon, three 28px round controls, 12px gap above the content.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useRef, useCallback, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { useDesktopStore, TOP_RESERVE, useDockInsets, type WindowState, type SnapZone } from '../../store/window-store';
import {
  Minus,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Move,
} from 'lucide-react';
import { AppIcon } from '@/components/ui/FileIcon';
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
          moveWindow(win.id, Math.max(0, newX), TOP_RESERVE);
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

  // EX8.12: maximized windows stop at the dock, wherever it is placed
  const dock = useDockInsets();

  if (win.minimized) return null;

  const style = win.maximized
    ? { top: TOP_RESERVE, left: 0, right: dock.right, bottom: dock.bottom, zIndex: win.zIndex }
    : {
        top: win.y,
        left: win.x,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  const controlClass =
    'grid h-7 w-7 place-items-center rounded-full bg-fill text-foreground transition-colors duration-150 hover:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div
      className={`
        glass absolute flex flex-col overflow-hidden animate-windowOpen
        ${win.maximized ? 'rounded-none !border-0' : 'rounded-[24px]'}
        ${win.focused ? 'shadow-window' : 'shadow-window-unfocused'}
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
      {/* ── Title Bar: sits directly on the window glass ── */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="flex h-11 shrink-0 select-none items-center gap-2.5 pl-3.5 pr-2"
            onMouseDown={handleDragStart}
            onDoubleClick={handleDoubleClickTitle}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center transition-opacity ${win.focused ? '' : 'opacity-60'}`}>
              <AppIcon appId={win.appId} size={20} />
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-[13px] font-semibold transition-colors ${
                win.focused ? 'text-foreground' : 'text-label-3'
              }`}
            >
              {win.title}
            </span>

            {/* Window controls: Minimize, Maximize/Restore, Close */}
            <div className="flex shrink-0 items-center gap-1.5" onMouseDown={e => e.stopPropagation()}>
              <button
                className={controlClass}
                onClick={() => minimizeWindow(win.id)}
                title="Minimize"
                aria-label="Minimize"
              >
                <Minus className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button
                className={controlClass}
                onClick={() => (win.maximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
                title={win.maximized ? 'Restore' : 'Maximize'}
                aria-label={win.maximized ? 'Restore' : 'Maximize'}
              >
                {win.maximized
                  ? <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
                  : <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
                }
              </button>
              <button
                className={`${controlClass} hover:!bg-[#D2483F] hover:text-white`}
                onClick={() => closeWindow(win.id)}
                title="Close"
                aria-label="Close"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
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

      {/* ── Window Content: 12px below the title bar in every window ── */}
      <div
        className="relative flex-1 min-h-0 overflow-auto pt-3"
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
          <svg className="absolute bottom-1.5 right-1.5 w-3 h-3 text-label-3 opacity-40 group-hover:opacity-80 transition-opacity" viewBox="0 0 12 12">
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
        <span className="ml-auto text-[11px] text-label-3">none</span>
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
