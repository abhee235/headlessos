// M1.9 + M5.6b + EX1.11: Terminal View — xterm.js + FitAddon + WebSocket + Visualize Hint
// M7.1: Reads terminal preferences from preferences-store
// M5.6b: Loading state, context menu, reconnect UI, theme-aware colors
// EX1.11: Terminal buffer capture + "Visualize" button
// EX8.6: LumenOS v3 look — inset paper pane, Geist Mono, token-driven xterm theme
// @see docs/phases/phase-1.md, docs/phases/phase-ex1.md, docs/phases/phase-ex8.md

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalWsUrl } from '../../lib/api';
import { usePreferencesStore } from '../../store/preferences-store';
import { toast } from 'sonner';
import { WifiOff, RefreshCw, Copy, ClipboardPaste, Trash2, MousePointerClick, Sparkles } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import '@xterm/xterm/css/xterm.css';
import { LoadingView } from '@/components/ui/loading-view';
import { Button } from '@/components/ui/button';
import {
  TERMINAL_HOST_CLASS,
  TERMINAL_PADDING_CLASS,
  TERMINAL_PANE_CLASS,
  LUMEN_TERMINAL_LINE_HEIGHT,
  getLumenTerminalTheme,
  refitWhenFontReady,
  resolveTerminalFont,
  useLumenTerminalTheme,
} from './lumen-terminal';

/** Hide the connecting spinner after this long even if the shell prints nothing */
const READY_FALLBACK_MS = 5000;

/** EX1.11: Hint from backend about parseable terminal output */
interface VisualizeHint {
  pattern: 'table' | 'json' | 'log' | 'config' | 'list';
  confidence: number;
  suggestedTool: string;
  lineCount: number;
  rawOutput: string;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface TerminalViewProps {
  serverId: string;
  /** EX1.11: Called when user clicks "Visualize" with the raw terminal output */
  onVisualize?: (rawOutput: string, suggestedTool: string) => void;
  /** EX7: if set, the session execs into this container (docker exec -it). */
  containerId?: string;
}

export function TerminalView({ serverId, onVisualize, containerId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  // EX1.11: Visualize hint state
  const [visualizeHint, setVisualizeHint] = useState<VisualizeHint | null>(null);
  const visualizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read terminal preferences
  const fontSize = usePreferencesStore((s) => s.terminalFontSize);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const scrollback = usePreferencesStore((s) => s.terminalScrollback);
  const copyOnSelect = usePreferencesStore((s) => s.terminalCopyOnSelect);

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
    if (visualizeTimerRef.current) {
      clearTimeout(visualizeTimerRef.current);
      visualizeTimerRef.current = null;
    }
    setVisualizeHint(null);
    fitRef.current = null;
  }, []);

  // Theme-aware: re-read the Lumen tokens when the scheme or accent changes
  useLumenTerminalTheme(termRef);

  // Live-update terminal options when preferences change (without reconnecting)
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const font = resolveTerminalFont(fontFamily, fontSize);
    term.options.fontSize = font.fontSize;
    term.options.fontFamily = font.fontFamily;
    term.options.cursorStyle = cursorStyle;
    term.options.scrollback = scrollback === -1 ? 999999 : scrollback;
    // Refit after font change
    requestAnimationFrame(() => {
      fitRef.current?.fit();
    });
    refitWhenFontReady(term, () => fitRef.current?.fit());
  }, [fontSize, fontFamily, cursorStyle, scrollback]);

  const connect = useCallback(() => {
    if (!containerRef.current) return;

    cleanup();
    setStatus('connecting');

    const font = resolveTerminalFont(fontFamily, fontSize);

    // Create terminal
    const term = new Terminal({
      theme: getLumenTerminalTheme(),
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      lineHeight: LUMEN_TERMINAL_LINE_HEIGHT,
      allowTransparency: true,
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
    refitWhenFontReady(term, () => fitAddon.fit());

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
    const ws = new WebSocket(terminalWsUrl(serverId, containerId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // The spinner stays up until the shell prints its first byte (a container
    // shell takes a moment after the socket opens), with a fallback for a
    // shell that prints nothing.
    let ready = false;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    const markReady = () => {
      if (ready) return;
      ready = true;
      clearTimeout(readyTimer);
      setStatus('connected');
    };

    ws.onopen = () => {
      readyTimer = setTimeout(markReady, READY_FALLBACK_MS);

      // Instead of AttachAddon, handle messages manually to intercept JSON control messages
      ws.onmessage = (event) => {
        const data = event.data;
        // Check if it's a JSON control message from the server
        if (typeof data === 'string') {
          try {
            const msg = JSON.parse(data);
            if (msg.type === 'visualize-hint' && msg.hint) {
              // EX1.11: Show "Visualize" button
              setVisualizeHint({
                ...msg.hint,
                rawOutput: msg.rawOutput ?? '',
              });
              // Auto-dismiss after 10 seconds
              if (visualizeTimerRef.current) clearTimeout(visualizeTimerRef.current);
              visualizeTimerRef.current = setTimeout(() => setVisualizeHint(null), 10000);
              return; // Don't write control message to terminal
            }
            if (msg.type === 'buffer-snapshot' || msg.type === 'error') {
              return; // Don't write control messages to terminal
            }
          } catch {
            // Not JSON — write to terminal as normal text
          }
          markReady();
          term.write(data);
        } else if (data instanceof ArrayBuffer) {
          markReady();
          term.write(new Uint8Array(data));
        }
      };

      // Terminal input → WebSocket
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Send initial resize
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }));
      }
    };

    ws.onerror = () => {
      clearTimeout(readyTimer);
      setStatus('error');
      term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m');
    };

    ws.onclose = () => {
      clearTimeout(readyTimer);
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
      clearTimeout(readyTimer);
      resizeObserver.disconnect();
    };
  }, [serverId, cleanup, fontFamily, fontSize, cursorStyle, scrollback]);

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
    <div className="h-full w-full px-2 pb-2">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={`${TERMINAL_PANE_CLASS} h-full w-full`}>
            {/* Terminal container */}
            <div className={TERMINAL_PADDING_CLASS}>
              <div ref={containerRef} className={TERMINAL_HOST_CLASS} />
            </div>

            {/* Loading overlay */}
            {status === 'connecting' && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <LoadingView
                  label={containerId ? 'Opening container shell…' : 'Connecting…'}
                  className="text-term-fg/80"
                />
              </div>
            )}

            {/* Disconnected banner */}
            {isDisconnected && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
                <div className="glass-heavy pointer-events-auto flex h-10 items-center gap-2.5 rounded-full pl-3.5 pr-1.5">
                  <WifiOff className="size-4 shrink-0 text-danger" strokeWidth={1.75} />
                  <span className="text-[12px] font-medium text-label-2">
                    {status === 'error' ? 'Connection error' : 'Disconnected'}
                  </span>
                  <Button variant="secondary" size="sm" onClick={handleReconnect}>
                    <RefreshCw strokeWidth={1.75} />
                    Reconnect
                  </Button>
                </div>
              </div>
            )}

            {/* EX1.11: Visualize button — appears when parseable output detected */}
            {visualizeHint && onVisualize && (
              <div className="absolute bottom-3 right-3 z-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onVisualize(visualizeHint.rawOutput, visualizeHint.suggestedTool);
                    setVisualizeHint(null);
                    if (visualizeTimerRef.current) clearTimeout(visualizeTimerRef.current);
                  }}
                  className="shadow-glass backdrop-blur-xl"
                  title={`Detected ${visualizeHint.pattern} output (${visualizeHint.lineCount} lines)`}
                >
                  <Sparkles className="text-accent-solid" strokeWidth={1.75} />
                  Visualize
                </Button>
              </div>
            )}
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem onClick={handleCopy}>
            <Copy strokeWidth={1.75} />
            Copy
            <ContextMenuShortcut>⌘C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handlePaste}>
            <ClipboardPaste strokeWidth={1.75} />
            Paste
            <ContextMenuShortcut>⌘V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleSelectAll}>
            <MousePointerClick strokeWidth={1.75} />
            Select All
            <ContextMenuShortcut>⌘A</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleClear}>
            <Trash2 strokeWidth={1.75} />
            Clear
          </ContextMenuItem>
          {isDisconnected && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleReconnect}>
                <RefreshCw strokeWidth={1.75} />
                Reconnect
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
