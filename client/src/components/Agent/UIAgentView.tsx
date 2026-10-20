// EX2.12+: UI Agent View — conversational UI generation agent
// @see docs/phases/phase-ex2.md — EX2.12
// @see docs/PROGRESSIVE_RENDERING.md — progressive incremental rendering
//
// Frontend view for the UI Agent. Users enter a prompt describing what
// they want to see, and the agent generates a Dynamic UI view in real-time.
// Shows the agent's thinking process via AgentPanel as events stream in.
// EX3-C.3: Opens a desktop DynamicUI window immediately on generation start
// with skeleton loading, progressively filling as partial_view events arrive.
// EX8.6: Lumen glass — preset tiles, accent tints, pill composer.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wand2, Send, Square, Sparkles, RotateCcw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUIAgent } from '../../hooks/useUIAgent';
import { useAgentStore, type AgentSession } from '../../store/agent-store';
import { useSessionsStore } from '../../store/sessions-store';
import { AgentPanel } from './AgentPanel';
import { useDynamicUIStore } from '@/store/dynamic-ui-store';
import { useDesktopStore } from '@/store/window-store';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import type { DynamicView, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { checkDockerAvailable } from '../../lib/api';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import {
  AgentHeader, Composer, COMPOSER_BUTTON_CLASS, COMPOSER_TEXTAREA_CLASS,
  PRESET_TILE_CLASS, SectionLabel,
} from './agent-ui';

// ── Preset prompts ──────────────────────────────────────

const PRESETS = [
  { label: 'System Overview', prompt: 'Show me a comprehensive system overview with CPU, memory, disk, and network stats' },
  { label: 'Docker Status', prompt: 'Show all Docker containers with their status, CPU and memory usage' },
  { label: 'Disk Usage', prompt: 'Show a detailed disk usage breakdown for all mounted filesystems' },
  { label: 'Nginx Config', prompt: 'Show the nginx configuration and active virtual hosts' },
  { label: 'Cron Jobs', prompt: 'List all cron jobs for all users on this system' },
  { label: 'Network Ports', prompt: 'Show all open network ports and the services listening on them' },
];

// ── Helper: open a loading desktop window immediately ───

function openLoadingWindow(serverId: string, title: string): string {
  const dynStore = useDynamicUIStore.getState();

  // 1. Pin an empty loading view
  const viewId = dynStore.pinLoadingView(serverId, title, 'Sparkles');

  // 2. Open a desktop window
  useDesktopStore.getState().openWindow('dynamic-ui', serverId, title || 'Generating…', 'Sparkles');

  // 3. Link newest window to the pinned view — read FRESH state after openWindow
  const windows = useDesktopStore.getState().windows;
  const newestWindow = windows[windows.length - 1];
  if (newestWindow) {
    dynStore.linkWindow(newestWindow.id, viewId);
  }

  return viewId;
}

// ── Main View ───────────────────────────────────────────

interface UIAgentViewProps {
  serverId: string;
}

export function UIAgentView({ serverId }: UIAgentViewProps) {
  const [prompt, setPrompt] = useState('');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // EX5-B.4: Sandbox mode state
  const [sandboxEnabled, setSandboxEnabled] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);

  const { generate, abort, connected } = useUIAgent(serverId);
  const sessions = useAgentStore(s => s.sessions);

  // Get the active session
  const activeSession: AgentSession | undefined = activeRequestId
    ? sessions.get(activeRequestId)
    : undefined;

  const isRunning = activeSession?.status === 'running';

  // EX5-B.4: Check Docker availability on the server
  useEffect(() => {
    if (!serverId || !connected) {
      setDockerAvailable(null);
      return;
    }
    let cancelled = false;
    void checkDockerAvailable(serverId).then((available) => {
      if (!cancelled) setDockerAvailable(available);
    });
    return () => { cancelled = true; };
  }, [serverId, connected]);

  // Auto-scroll on new events
  useEffect(() => {
    if (activeSession && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.events.length]);

  // Track the pinned view ID for the current generation session
  const pinnedViewIdRef = useRef<Map<string, string>>(new Map());

  const handleGenerate = useCallback((p?: string) => {
    const finalPrompt = p ?? prompt;
    if (!finalPrompt.trim()) return;

    try {
      const requestId = generate(finalPrompt, {
        sandboxMode: sandboxEnabled && dockerAvailable === true ? true : undefined,
      });
      setActiveRequestId(requestId);

      // EX3-C.3: Open a desktop window immediately with loading skeleton
      const viewId = openLoadingWindow(serverId, finalPrompt.substring(0, 60));
      pinnedViewIdRef.current.set(requestId, viewId);
    } catch {
      // Error handled by the hook (sets error state in store)
    }
  }, [prompt, generate, sandboxEnabled, dockerAvailable, serverId]);

  const handleAbort = useCallback(() => {
    if (activeRequestId) {
      abort(activeRequestId);
      // Mark the loading window as no longer loading
      const viewId = pinnedViewIdRef.current.get(activeRequestId);
      if (viewId) {
        useDynamicUIStore.getState().setViewLoading(viewId, false);
      }
    }
  }, [activeRequestId, abort]);

  const handleReset = useCallback(() => {
    setActiveRequestId(null);
    setPrompt('');
  }, []);

  // EX3-C.3: Progressively update the desktop window as partial_view events arrive
  useEffect(() => {
    if (!activeRequestId) return;
    const viewId = pinnedViewIdRef.current.get(activeRequestId);
    if (!viewId) return;

    const dynStore = useDynamicUIStore.getState();

    // Update with partial view
    const partialView = activeSession?.partialView as DeepPartial<DynamicView> | null;
    if (partialView) {
      dynStore.updatePinnedView(viewId, partialView);
    }
  }, [activeRequestId, activeSession?.partialView]);

  // Finalize the desktop window when generation completes
  const completedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      activeSession?.status === 'complete' &&
      activeSession.view &&
      activeRequestId &&
      !completedRef.current.has(activeRequestId)
    ) {
      completedRef.current.add(activeRequestId);
      const viewId = pinnedViewIdRef.current.get(activeRequestId);
      if (viewId) {
        const parsed = DynamicViewSchema.safeParse(activeSession.view);
        if (parsed.success) {
          useDynamicUIStore.getState().completePinnedView(viewId, parsed.data);
        }
      }
    }
  }, [activeSession?.status, activeSession?.view, activeRequestId]);

  // Mark loading window as done on error/abort
  useEffect(() => {
    if (
      activeRequestId &&
      (activeSession?.status === 'error' || activeSession?.status === 'aborted')
    ) {
      const viewId = pinnedViewIdRef.current.get(activeRequestId);
      if (viewId) {
        useDynamicUIStore.getState().setViewLoading(viewId, false);
      }
    }
  }, [activeRequestId, activeSession?.status]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <AgentHeader
        icon={Wand2}
        title="UI Agent"
        subtitle="Describe what you want to see — the agent builds a live UI from your server data"
        trailing={
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={connected ? 'success' : 'secondary'}>
              {connected ? 'Connected' : 'Disconnected'}
            </Badge>
            {activeSession && !isRunning && (
              <Button variant="secondary" size="sm" onClick={handleReset} className="gap-1.5">
                <RotateCcw strokeWidth={1.75} />
                New
              </Button>
            )}
          </div>
        }
      />

      {/* Main scroll area */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="space-y-5 px-4 pb-4">
          {/* Preset suggestions (only when no active session) */}
          {!activeSession && (
            <div className="space-y-2.5">
              <SectionLabel>Quick prompts</SectionLabel>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                {PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    className={cn(PRESET_TILE_CLASS, 'group')}
                    onClick={() => {
                      setPrompt(preset.prompt);
                      handleGenerate(preset.prompt);
                    }}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-accent-solid opacity-70 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.75} />
                      <span className="text-[13px] font-semibold">{preset.label}</span>
                    </div>
                    <p className="line-clamp-2 text-[11px] leading-snug text-label-2">
                      {preset.prompt}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* EX6-D.6: Conversation history (persistent across sessions) */}
          {!activeSession && (
            <AgentHistoryList serverId={serverId} onReRun={handleGenerate} />
          )}

          {/* Running indicator (before events start arriving) */}
          {isRunning && activeSession.events.length === 0 && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Spinner className="h-5 w-5 text-accent-solid" />
              <span className="text-sm text-label-2">Starting agent…</span>
            </div>
          )}

          {/* Agent event timeline */}
          {activeSession && activeSession.events.length > 0 && (
            <AgentPanel
              events={activeSession.events}
              isRunning={isRunning}
              onAbort={isRunning ? handleAbort : undefined}
              className="border-none bg-transparent"
            />
          )}

          {/* Completion summary */}
          {activeSession?.status === 'complete' && activeSession.meta && (
            <div className="space-y-4">
              <div className="space-y-1.5 rounded-[18px] border border-success/30 bg-success/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-success" strokeWidth={1.75} />
                  <span className="text-sm font-semibold text-success">
                    View Generated
                  </span>
                </div>
                <p className="text-xs text-label-2">
                  Completed in {((activeSession.meta.latencyMs ?? 0) / 1000).toFixed(1)}s
                  {' · '}
                  {activeSession.meta.stepsCompleted} step{activeSession.meta.stepsCompleted !== 1 ? 's' : ''}
                  {activeSession.meta.reflectionLoops > 0 && (
                    <> · {activeSession.meta.reflectionLoops} reflection{activeSession.meta.reflectionLoops !== 1 ? 's' : ''}</>
                  )}
                  {' · '}View is open in a desktop window
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {activeSession?.status === 'error' && (
            <div className="rounded-[18px] border border-danger/30 bg-danger/10 px-4 py-3">
              <p className="text-sm font-semibold text-danger">Generation Failed</p>
              <p className="mt-1 text-xs text-label-2">
                {activeSession.errorMessage ?? 'An unknown error occurred'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="shrink-0 space-y-2 px-4 pb-4">
        {/* EX5-B.4: Sandbox toggle */}
        <div className="flex items-center justify-between px-1" data-testid="sandbox-toggle-row">
          <Tooltip>
            <TooltipTrigger asChild>
              <label
                className={cn(
                  'flex items-center gap-2 cursor-pointer select-none',
                  dockerAvailable === false && 'opacity-50 cursor-not-allowed',
                )}
                htmlFor="sandbox-toggle"
              >
                <Shield className={cn(
                  'h-4 w-4',
                  sandboxEnabled && dockerAvailable !== false
                    ? 'text-accent-solid'
                    : 'text-label-3',
                )} strokeWidth={1.75} />
                <span className="text-xs font-semibold text-label-2">
                  Sandbox Mode
                </span>
              </label>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px]">
              {dockerAvailable === false
                ? 'Requires Docker on the server'
                : 'Discovery commands run in an isolated Docker container on the server'
              }
            </TooltipContent>
          </Tooltip>
          <Switch
            id="sandbox-toggle"
            checked={sandboxEnabled && dockerAvailable !== false}
            onCheckedChange={setSandboxEnabled}
            disabled={isRunning || dockerAvailable === false}
            data-testid="sandbox-switch"
            className="scale-75"
          />
        </div>

        <Composer>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the UI you want… e.g., 'Show me disk usage with a bar chart'"
            className={COMPOSER_TEXTAREA_CLASS}
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
              className={COMPOSER_BUTTON_CLASS}
              onClick={handleAbort}
            >
              <Square strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              size="icon"
              className={COMPOSER_BUTTON_CLASS}
              disabled={!prompt.trim() || !connected}
              onClick={() => handleGenerate()}
            >
              <Send strokeWidth={1.75} />
            </Button>
          )}
        </Composer>
        <p className="px-4 text-[11px] text-label-3">
          The agent runs commands on your server, parses the output, and generates a UI view. Requires LLM API key.
        </p>
      </div>
    </div>
  );
}

// ── EX6-D.6: Persisted conversation history list ────────────────

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

interface AgentHistoryListProps {
  serverId: string;
  onReRun: (prompt: string) => void;
}

function AgentHistoryList({ serverId, onReRun }: AgentHistoryListProps) {
  const session = useSessionsStore((s) => s.sessions[serverId]);
  const history = session?.agentHistory ?? [];
  if (history.length === 0) return null;

  // Newest first
  const ordered = [...history].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return (
    <div className="space-y-2.5" data-testid="agent-history-list">
      <SectionLabel>Recent runs</SectionLabel>
      <div className="space-y-2">
        {ordered.map((h) => (
          <button
            key={h.requestId}
            className={cn(PRESET_TILE_CLASS, 'group w-full')}
            onClick={() => onReRun(h.prompt)}
            data-testid={`agent-history-item-${h.requestId}`}
            title={`Re-run: ${h.prompt}`}
          >
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  h.status === 'complete'
                    ? 'success'
                    : h.status === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-[10px] uppercase"
              >
                {h.status}
              </Badge>
              <span className="text-[11px] text-label-3">
                {formatRelativeTime(h.startedAt)}
              </span>
              {h.viewTitle && (
                <span className="truncate text-[11px] font-medium text-accent-text">
                  {h.viewTitle}
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug">{h.prompt}</p>
            {h.errorMessage && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-danger">
                {h.errorMessage}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
