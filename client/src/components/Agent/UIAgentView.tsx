// EX2.12+: UI Agent View — conversational UI generation agent
// @see docs/phases/phase-ex2.md — EX2.12
//
// Frontend view for the UI Agent. Users enter a prompt describing what
// they want to see, and the agent generates a Dynamic UI view in real-time.
// Shows the agent's thinking process via AgentPanel as events stream in.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wand2,
  Send,
  Square,
  Loader2,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useUIAgent } from '../../hooks/useUIAgent';
import { useAgentStore, type AgentSession } from '../../store/agent-store';
import { AgentPanel, type AgentPanelProps } from './AgentPanel';
import { openDynamicUIWindow } from '../DynamicUI';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { ExternalLink } from 'lucide-react';

// ── Preset prompts ──────────────────────────────────────

const PRESETS = [
  { label: 'System Overview', prompt: 'Show me a comprehensive system overview with CPU, memory, disk, and network stats' },
  { label: 'Docker Status', prompt: 'Show all Docker containers with their status, CPU and memory usage' },
  { label: 'Disk Usage', prompt: 'Show a detailed disk usage breakdown for all mounted filesystems' },
  { label: 'Nginx Config', prompt: 'Show the nginx configuration and active virtual hosts' },
  { label: 'Cron Jobs', prompt: 'List all cron jobs for all users on this system' },
  { label: 'Network Ports', prompt: 'Show all open network ports and the services listening on them' },
];

// ── Main View ───────────────────────────────────────────

interface UIAgentViewProps {
  serverId: string;
}

export function UIAgentView({ serverId }: UIAgentViewProps) {
  const [prompt, setPrompt] = useState('');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { generate, abort, connected } = useUIAgent(serverId);
  const sessions = useAgentStore(s => s.sessions);

  // Get the active session
  const activeSession: AgentSession | undefined = activeRequestId
    ? sessions.get(activeRequestId)
    : undefined;

  const isRunning = activeSession?.status === 'running';

  // Auto-scroll on new events
  useEffect(() => {
    if (activeSession && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.events.length]);

  const handleGenerate = useCallback((p?: string) => {
    const finalPrompt = p ?? prompt;
    if (!finalPrompt.trim()) return;

    try {
      const requestId = generate(finalPrompt);
      setActiveRequestId(requestId);
    } catch {
      // Error handled by the hook (sets error state in store)
    }
  }, [prompt, generate]);

  const handleAbort = useCallback(() => {
    if (activeRequestId) {
      abort(activeRequestId);
    }
  }, [activeRequestId, abort]);

  const handleReset = useCallback(() => {
    setActiveRequestId(null);
    setPrompt('');
  }, []);

  // Auto-open generated view as a desktop window when generation completes
  const openedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      activeSession?.status === 'complete' &&
      activeSession.view &&
      activeRequestId &&
      !openedRef.current.has(activeRequestId)
    ) {
      openedRef.current.add(activeRequestId);
      const parsed = DynamicViewSchema.safeParse(activeSession.view);
      if (parsed.success) {
        openDynamicUIWindow(serverId, parsed.data, parsed.data.icon ?? undefined);
      }
    }
  }, [activeSession?.status, activeSession?.view, activeRequestId, serverId]);

  const handleOpenInWindow = useCallback(() => {
    if (!activeSession?.view) return;
    const parsed = DynamicViewSchema.safeParse(activeSession.view);
    if (parsed.success) {
      openDynamicUIWindow(serverId, parsed.data, parsed.data.icon ?? undefined);
    }
  }, [activeSession?.view, serverId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <Wand2 className="w-5 h-5 text-emerald-500" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold">UI Agent</h2>
          <p className="text-[11px] text-muted-foreground">
            Describe what you want to see — the agent builds a live UI from your server data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={connected ? 'success' : 'outline'}
            className="text-[10px]"
          >
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          {activeSession && !isRunning && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 px-2 gap-1">
              <RotateCcw className="w-3 h-3" />
              New
            </Button>
          )}
        </div>
      </div>

      {/* Main scroll area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {/* Preset suggestions (only when no active session) */}
          {!activeSession && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Quick prompts
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    className="text-left px-3 py-2.5 rounded-lg border border-border/40 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-colors group"
                    onClick={() => {
                      setPrompt(preset.prompt);
                      handleGenerate(preset.prompt);
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Sparkles className="w-3 h-3 text-emerald-500/60 group-hover:text-emerald-500" />
                      <span className="text-xs font-medium">{preset.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                      {preset.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Running indicator (before events start arriving) */}
          {isRunning && activeSession.events.length === 0 && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-sm text-muted-foreground">Starting agent…</span>
            </div>
          )}

          {/* Agent event timeline */}
          {activeSession && activeSession.events.length > 0 && (
            <AgentPanel
              events={activeSession.events}
              isRunning={isRunning}
              onAbort={isRunning ? handleAbort : undefined}
              className="border-none p-0"
            />
          )}

          {/* Completion summary + rendered view */}
          {activeSession?.status === 'complete' && activeSession.meta && (
            <div className="space-y-4">
              <div className="border border-emerald-500/20 rounded-lg p-3 bg-emerald-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      View Generated
                    </span>
                  </div>
                  {activeSession.view != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenInWindow}
                      className="h-7 px-2.5 gap-1.5 text-xs"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open in Window
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Completed in {((activeSession.meta.latencyMs ?? 0) / 1000).toFixed(1)}s
                  {' · '}
                  {activeSession.meta.stepsCompleted} step{activeSession.meta.stepsCompleted !== 1 ? 's' : ''}
                  {activeSession.meta.reflectionLoops > 0 && (
                    <> · {activeSession.meta.reflectionLoops} reflection{activeSession.meta.reflectionLoops !== 1 ? 's' : ''}</>
                  )}
                </p>
              </div>

            </div>
          )}

          {/* Error state */}
          {activeSession?.status === 'error' && (
            <div className="border border-destructive/20 rounded-lg p-3 bg-destructive/5">
              <p className="text-sm text-destructive font-medium">Generation Failed</p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeSession.errorMessage ?? 'An unknown error occurred'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border/40 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the UI you want… e.g., 'Show me disk usage with a bar chart'"
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            disabled={isRunning}
          />
          {isRunning ? (
            <Button
              variant="destructive"
              size="icon"
              className="shrink-0 h-[44px] w-[44px]"
              onClick={handleAbort}
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="shrink-0 h-[44px] w-[44px]"
              disabled={!prompt.trim() || !connected}
              onClick={() => handleGenerate()}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
          The agent runs commands on your server, parses the output, and generates a UI view. Requires LLM API key.
        </p>
      </div>
    </div>
  );
}
