// Docker Install Terminal — xterm.js terminal for Docker installation via SSH
// Uses the same xterm.js pattern as TerminalView but connects to /ws/docker-install/:serverId

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { dockerInstallWsUrl } from '../../lib/api';
import { Button } from '../ui/button';
import { X, RotateCcw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

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
      theme: {
        background: '#09090b',
        foreground: '#d4d4d8',
        cursor: '#60a5fa',
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
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
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
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-chrome">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Docker Installation
          </span>
          {installing && !finished && (
            <span className="text-xs text-warning animate-pulse">
              Installing...
            </span>
          )}
          {finished && (
            <span className="text-xs text-success">
              Process finished
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!installing && !finished && (
            <Button
              size="sm"
              variant="default"
              onClick={startInstall}
              className="h-7 text-xs"
            >
              Start Installation
            </Button>
          )}
          {finished && (
            <Button
              size="sm"
              variant="default"
              onClick={handleDoneAndRefresh}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Done — Reload Docker
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClose}
            className="h-7 w-7 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ padding: '4px' }}
        />
      </div>

      {/* Info bar */}
      {!installing && !finished && (
        <div className="px-3 py-2 border-t border-border bg-chrome">
          <p className="text-xs text-muted-foreground">
            This will run the official Docker install script from{' '}
            <span className="font-mono text-foreground">get.docker.com</span>
            . The server user must have <span className="font-mono text-foreground">sudo</span> privileges.
            You may be prompted for a password.
          </p>
        </div>
      )}
    </div>
  );
}
