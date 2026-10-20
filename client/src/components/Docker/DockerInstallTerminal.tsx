// Docker Install Terminal — xterm.js terminal for Docker installation via SSH
// Uses the same xterm.js pattern as TerminalView but connects to /ws/docker-install/:serverId
// EX8.6: LumenOS v3 look — same inset paper pane + token theme as TerminalView

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { dockerInstallWsUrl } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { X, RotateCcw, Play } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import {
  LUMEN_TERMINAL_FONT,
  LUMEN_TERMINAL_FONT_SIZE,
  LUMEN_TERMINAL_LINE_HEIGHT,
  TERMINAL_HOST_CLASS,
  TERMINAL_PADDING_CLASS,
  TERMINAL_PANE_CLASS,
  getLumenTerminalTheme,
  refitWhenFontReady,
  useLumenTerminalTheme,
} from '../Terminal/lumen-terminal';

interface DockerInstallTerminalProps {
  serverId: string;
  onClose: () => void;
  onInstallComplete: () => void;
}

export function DockerInstallTerminal({
  serverId,
  onClose,
  onInstallComplete,
}: DockerInstallTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [installing, setInstalling] = useState(false);
  const [finished, setFinished] = useState(false);

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

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: getLumenTerminalTheme(),
      fontFamily: LUMEN_TERMINAL_FONT,
      fontSize: LUMEN_TERMINAL_FONT_SIZE,
      lineHeight: LUMEN_TERMINAL_LINE_HEIGHT,
      allowTransparency: true,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    requestAnimationFrame(() => {
      fitAddon.fit();
    });
    refitWhenFontReady(term, () => fitAddon.fit());

    termRef.current = term;
    fitRef.current = fitAddon;

    // Connect WebSocket
    const ws = new WebSocket(dockerInstallWsUrl(serverId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      const attachAddon = new AttachAddon(ws);
      term.loadAddon(attachAddon);

      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }));
      }
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[Connection error — could not reach server]\x1b[0m');
    };

    ws.onclose = () => {
      // Only update state if THIS WebSocket is still the active one.
      // Guards against React strict mode cleanup: the first mount's WS fires
      // onclose asynchronously AFTER the second mount has already created a new WS.
      if (wsRef.current === ws) {
        setFinished(true);
      }
    };

    // Resize handling
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
      cleanup();
    };
  }, [serverId, cleanup]);

  // Follow the colour scheme / accent like TerminalView
  useLumenTerminalTheme(termRef);

  const startInstall = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setInstalling(true);
      wsRef.current.send(JSON.stringify({ type: 'start-install' }));
    }
  }, []);

  const handleClose = useCallback(() => {
    cleanup();
    onClose();
  }, [cleanup, onClose]);

  const handleDoneAndRefresh = useCallback(() => {
    cleanup();
    onInstallComplete();
  }, [cleanup, onInstallComplete]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-4 px-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[17px] font-bold leading-6 text-foreground">
              Docker Installation
            </span>
            {installing && !finished && (
              <Badge variant="warning" className="animate-pulse">
                Installing...
              </Badge>
            )}
            {finished && (
              <Badge variant="success">
                Process finished
              </Badge>
            )}
          </div>
          {/* Info line */}
          {!installing && !finished && (
            <p className="mt-0.5 text-[12px] leading-[18px] text-label-2">
              This will run the official Docker install script from{' '}
              <span className="font-mono text-foreground">get.docker.com</span>
              . The server user must have <span className="font-mono text-foreground">sudo</span> privileges.
              You may be prompted for a password.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!installing && !finished && (
            <Button
              size="sm"
              variant="default"
              onClick={startInstall}
            >
              <Play strokeWidth={1.75} />
              Start Installation
            </Button>
          )}
          {finished && (
            <Button
              size="sm"
              variant="default"
              onClick={handleDoneAndRefresh}
            >
              <RotateCcw strokeWidth={1.75} />
              Done — Reload Docker
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleClose}
            className="size-[30px]"
            title="Close"
            aria-label="Close installer"
          >
            <X strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="mx-2 mb-2 flex min-h-0 flex-1">
        <div className={`${TERMINAL_PANE_CLASS} flex-1`}>
          <div className={TERMINAL_PADDING_CLASS}>
            <div ref={containerRef} className={TERMINAL_HOST_CLASS} />
          </div>
        </div>
      </div>
    </div>
  );
}
