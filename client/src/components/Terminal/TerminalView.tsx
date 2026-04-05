// M1.9: Terminal View — xterm.js + FitAddon + WebSocket
// @see docs/phases/phase-1.md

import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AttachAddon } from '@xterm/addon-attach';
import { terminalWsUrl } from '../../lib/api';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  serverId: string;
}

export function TerminalView({ serverId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

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

    // Create terminal
    const term = new Terminal({
      theme: {
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
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fit after open
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // WebSocket
    const ws = new WebSocket(terminalWsUrl(serverId));
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      const attachAddon = new AttachAddon(ws);
      term.loadAddon(attachAddon);

      // Send initial resize
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', rows: dims.rows, cols: dims.cols }));
      }
    };

    ws.onerror = () => {
      term.writeln('\r\n\x1b[31m[Connection error]\x1b[0m');
    };

    ws.onclose = () => {
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
      cleanup();
    };
  }, [serverId, cleanup]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: '0 4px' }}
    />
  );
}
