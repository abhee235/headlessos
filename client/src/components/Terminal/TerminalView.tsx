// M1.9 + M5.6b: Terminal View — xterm.js + FitAddon + WebSocket
// M7.1: Reads terminal preferences from preferences-store
// M5.6b: Loading state, context menu, reconnect UI, theme-aware colors
// @see docs/phases/phase-1.md

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { terminalWsUrl } from '../../lib/api';
import { usePreferencesStore } from '../../store/preferences-store';
import { useThemeStore } from '../../store/theme-store';
import { toast } from 'sonner';
import { Loader2, WifiOff, RefreshCw, Copy, ClipboardPaste, Trash2, MousePointerClick } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import '@xterm/xterm/css/xterm.css';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const DARK_THEME = {
  background: '#09090b', // zinc-950
  foreground: '#d4d4d8', // zinc-300
  cursor: '#60a5fa',     // blue-400
  selectionBackground: '#3f3f4680',
  black: '#27272a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
};

const LIGHT_THEME = {
  background: '#fafafa',  // zinc-50
  foreground: '#18181b',  // zinc-900
  cursor: '#2563eb',      // blue-600
  selectionBackground: '#93c5fd80',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f4f4f5',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

interface TerminalViewProps {
  serverId: string;
}

export function TerminalView({ serverId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  // Read terminal preferences
  const fontSize = usePreferencesStore((s) => s.terminalFontSize);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const scrollback = usePreferencesStore((s) => s.terminalScrollback);
  const copyOnSelect = usePreferencesStore((s) => s.terminalCopyOnSelect);
  const theme = useThemeStore((s) => s.resolvedTheme);

  const copyOnSelectRef = useRef(copyOnSelect);
  useEffect(() => {
    copyOnSelectRef.current = copyOnSelect;
  }, [copyOnSelect]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    fitRef.current = null;
  }, []);

  // Theme-aware: update terminal colors when theme changes
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
  }, [theme]);

  // Live-update terminal options when preferences change (without reconnecting)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = fontFamily;
    term.options.cursorStyle = cursorStyle;
    term.options.scrollback = scrollback === -1 ? 999999 : scrollback;
    // Refit after font change
    requestAnimationFrame(() => {
      fitRef.current?.fit();
    });
  }, [fontSize, fontFamily, cursorStyle, scrollback]);

  const connect = useCallback(() => {
    if (!containerRef.current) return;

    cleanup();
    setStatus('connecting');

    const termTheme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;

    // Create terminal
    const term = new Terminal({
      theme: termTheme,
      fontFamily,
      fontSize,
      cursorStyle,
      cursorBlink: true,
      scrollback: scrollback === -1 ? 999999 : scrollback,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fit after open
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Copy-on-select: auto-copy selected text to clipboard
    term.onSelectionChange(() => {
      if (!copyOnSelectRef.current) return;
      const selection = term.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {
          // Clipboard write may fail if page is not focused
        });
      }
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // WebSocket
    const ws = new WebSocket(terminalWsUrl(serverId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      const attachAddon = new AttachAddon(ws);
      term.loadAddon(attachAddon);

      // Send initial resize
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }));
      }
    };

    ws.onerror = () => {
      setStatus('error');
      term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      term.writeln('\r\n\x1b[33m[Disconnected]\x1b[0m');
    };

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitRef.current && termRef.current) {
          fitRef.current.fit();
          const dims = fitRef.current.proposeDimensions();
          if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }),
            );
          }
        }
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [serverId, cleanup, theme, fontFamily, fontSize, cursorStyle, scrollback]);

  useEffect(() => {
    const cleanupResize = connect();
    return () => {
      cleanupResize?.();
      cleanup();
    };
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps -- connect/cleanup are stable, only reconnect on serverId change

  // Context menu actions
  const handleCopy = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).then(
        () => toast.success('Copied to clipboard'),
        () => toast.error('Failed to copy'),
      );
    } else {
      toast('No text selected');
    }
  }, []);

  const handlePaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const text = await navigator.clipboard.readText();
      // Write pasted text to the terminal (sends to pty via ws)
      term.paste(text);
    } catch {
      toast.error('Failed to paste — check clipboard permissions');
    }
  }, []);

  const handleClear = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.clear();
  }, []);

  const handleSelectAll = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
  }, []);

  const handleReconnect = useCallback(() => {
    connect();
  }, [connect]);

  const isDisconnected = status === 'disconnected' || status === 'error';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="relative w-full h-full">
          {/* Terminal container */}
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ padding: '0 4px' }}
          />

          {/* Loading overlay */}
          {status === 'connecting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Connecting…</span>
              </div>
            </div>
          )}

          {/* Disconnected banner */}
          {isDisconnected && (
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-2 px-4 bg-destructive/10 border-t border-destructive/20 z-10">
              <WifiOff className="w-4 h-4 text-destructive" />
              <span className="text-xs text-destructive">
                {status === 'error' ? 'Connection error' : 'Disconnected'}
              </span>
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-secondary hover:bg-accent text-secondary-foreground"
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </button>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="w-4 h-4 mr-2 opacity-60" />
          Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handlePaste}>
          <ClipboardPaste className="w-4 h-4 mr-2 opacity-60" />
          Paste
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleSelectAll}>
          <MousePointerClick className="w-4 h-4 mr-2 opacity-60" />
          Select All
          <ContextMenuShortcut>⌘A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleClear}>
          <Trash2 className="w-4 h-4 mr-2 opacity-60" />
          Clear
        </ContextMenuItem>
        {isDisconnected && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleReconnect}>
              <RefreshCw className="w-4 h-4 mr-2 opacity-60" />
              Reconnect
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
