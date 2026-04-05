// M2.X: Window — draggable, resizable window with title bar controls
// @see docs/phases/phase-2.md

import { useRef, useCallback, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { useDesktopStore, type WindowState } from '../../store/window-store';
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
  Maximize2,
  Minimize2,
  RotateCcw,
  Move,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

const APP_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  files: FolderOpen,
  terminal: Terminal,
  settings: Settings,
  taskmanager: Activity,
};

const APP_ACCENT: Record<string, string> = {
  dashboard: 'bg-blue-500',
  files: 'bg-yellow-500',
  terminal: 'bg-green-500',
  settings: 'bg-purple-500',
  taskmanager: 'bg-emerald-500',
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
  } = useDesktopStore();

  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null);

  // ── Drag handler (title bar) ──
  const handleDragStart = useCallback(
    (e: ReactMouseEvent) => {
      if (win.maximized) return;
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
      };

      const handleUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [win.id, win.x, win.y, win.maximized, focusWindow, moveWindow],
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
  const accent = APP_ACCENT[win.appId] ?? 'bg-zinc-500';

  const style = win.maximized
    ? { top: 0, left: 0, right: 0, bottom: 48, zIndex: win.zIndex }
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
        ${win.maximized ? 'rounded-none' : 'rounded-xl'}
        ${win.focused
          ? 'shadow-2xl shadow-black/20 dark:shadow-black/60 ring-1 ring-black/[0.08] dark:ring-white/15'
          : 'shadow-lg shadow-black/10 dark:shadow-black/40 ring-1 ring-black/[0.05] dark:ring-white/5'
        }
        overflow-hidden
        transition-shadow duration-200
      `}
      style={style}
      onMouseDown={() => {
        if (!win.focused) focusWindow(win.id);
      }}
    >
      {/* ── Title Bar ── */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`
              flex items-center h-9 px-3 shrink-0 select-none
              ${win.focused
                ? 'bg-white/70 dark:bg-zinc-800/80 backdrop-blur-2xl backdrop-saturate-150'
                : 'bg-white/50 dark:bg-zinc-800/60 backdrop-blur-xl'
              }
              border-b border-black/[0.06] dark:border-white/[0.06]
            `}
            onMouseDown={handleDragStart}
            onDoubleClick={handleDoubleClickTitle}
          >
            {/* Icon + accent dot */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-1 h-4 rounded-full ${accent} ${win.focused ? 'opacity-100' : 'opacity-40'}`} />
              <Icon className={`w-3.5 h-3.5 shrink-0 ${win.focused ? 'text-zinc-700 dark:text-white/70' : 'text-zinc-400 dark:text-white/40'}`} />
              <span className={`text-xs truncate ${win.focused ? 'text-zinc-800 dark:text-white/80' : 'text-zinc-400 dark:text-white/40'} font-medium`}>
                {win.title}
              </span>
            </div>

            {/* Window controls */}
            <div className="flex items-center -mr-1" onMouseDown={e => e.stopPropagation()}>
              <button
                className="p-1.5 rounded-md hover:bg-black/[0.06] dark:hover:bg-white/10 text-zinc-400 dark:text-white/50 hover:text-zinc-600 dark:hover:text-white/80 transition-colors"
                onClick={() => minimizeWindow(win.id)}
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1.5 rounded-md hover:bg-black/[0.06] dark:hover:bg-white/10 text-zinc-400 dark:text-white/50 hover:text-zinc-600 dark:hover:text-white/80 transition-colors"
                onClick={() => (win.maximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
                title={win.maximized ? 'Restore' : 'Maximize'}
              >
                {win.maximized ? (
                  <Copy className="w-3 h-3" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
              </button>
              <button
                className="p-1.5 rounded-md hover:bg-red-500/90 text-zinc-400 dark:text-white/50 hover:text-white transition-colors"
                onClick={() => closeWindow(win.id)}
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
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
        className="flex-1 min-h-0 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl overflow-auto"
        onContextMenu={(e) => {
          // Prevent native browser context menu on blank areas inside windows.
          // Radix ContextMenus (file list, process rows, etc.) intercept the
          // event before it reaches here, so they still work normally.
          e.preventDefault();
        }}
      >
        {children}
      </div>

      {/* ── Resize Handle (bottom-right) ── */}
      {!win.maximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
          onMouseDown={handleResizeStart}
        >
          {/* Visual grip dots */}
          <svg className="absolute bottom-0.5 right-0.5 w-3 h-3 text-zinc-300 dark:text-white/20" viewBox="0 0 12 12">
            <circle cx="10" cy="10" r="1" fill="currentColor" />
            <circle cx="6" cy="10" r="1" fill="currentColor" />
            <circle cx="10" cy="6" r="1" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}
