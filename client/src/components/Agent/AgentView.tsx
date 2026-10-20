// M11.5 + M11.6: AI Agent View — ReAct investigation with live progress
// EX8.6: Lumen glass — step bubbles, result card, pill composer
// @see docs/DECISIONS.md (ADR-013, ADR-014)

import { useState, useRef, useEffect } from 'react';
import {
  Bot, Send, Square, Terminal, Brain, CheckCircle2, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight, Copy, Zap } from 'lucide-react';
import { startAgentInvestigation, type AgentResult, type AgentStep } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import {
  AgentHeader, BUBBLE_CLASS, Composer, COMPOSER_BUTTON_CLASS, COMPOSER_TEXTAREA_CLASS,
  PRESET_TILE_CLASS, SectionLabel,
} from './agent-ui';

// ── Preset questions ────────────────────────────────────

const PRESETS = [
  { label: 'Why is disk full?', question: 'Why is the disk full? What is using the most space?' },
  { label: 'High memory usage', question: 'Why is memory usage high? What processes are consuming the most memory?' },
  { label: 'Slow server', question: 'Why is the server slow? Check CPU, memory, disk I/O, and network.' },
  { label: 'Docker issues', question: 'Are there any Docker containers that have stopped unexpectedly or are using too many resources?' },
  { label: 'Service down?', question: 'Check if nginx and other critical services are running. If not, what errors are in the logs?' },
  { label: 'Security check', question: 'Run a basic security audit: check for unauthorized SSH logins, open ports, and suspicious processes.' },
];

// ── Step Component ──────────────────────────────────────

function StepCard({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(step.decision === 'answer');

  const statusIcon = step.decision === 'answer'
    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
    : step.decision === 'error'
      ? <XCircle className="h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
      : <Terminal className="h-4 w-4 shrink-0 text-accent-solid" strokeWidth={1.75} />;

  return (
    <div className={cn(BUBBLE_CLASS, 'overflow-hidden')}>
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-fill"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-label-3" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-3" />
        )}
        {statusIcon}
        <span className="shrink-0 font-mono text-xs text-label-3">
          Step {step.stepNumber}
        </span>
        <span className="flex-1 truncate text-[13px] text-foreground">
          {step.thought.substring(0, 80)}{step.thought.length > 80 ? '…' : ''}
        </span>
        {step.command && (
          <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
            {step.command.substring(0, 40)}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-2.5 border-t border-border px-3.5 pb-3.5 pt-3">
          {/* Thought */}
          <div className="flex items-start gap-2">
            <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-solid" strokeWidth={1.75} />
            <p className="text-xs leading-relaxed text-label-2">{step.thought}</p>
          </div>

          {/* Command */}
          {step.command && (
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-accent-solid" strokeWidth={1.75} />
              <code className="flex-1 rounded-[8px] bg-paper px-2.5 py-1 font-mono text-xs">
                $ {step.command}
              </code>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="grid h-6 w-6 place-items-center rounded-full text-label-3 transition-colors duration-150 hover:bg-fill hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(step.command!);
                      toast.success('Command copied');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy command</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Output */}
          {step.output && (
            <div className="relative">
              <pre className="max-h-48 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-[14px] border border-edge bg-paper px-3 py-2.5 font-mono text-[11px] text-label-2">
                {step.output}
              </pre>
            </div>
          )}

          {/* Observation */}
          {step.observation && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" strokeWidth={1.75} />
              <p className="text-xs text-label-2">{step.observation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Result Summary ──────────────────────────────────────

function ResultSummary({ result }: { result: AgentResult }) {
  const statusStyles: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    completed: { icon: CheckCircle2, color: 'text-success', label: 'Completed' },
    aborted: { icon: XCircle, color: 'text-warning', label: 'Aborted' },
    error: { icon: XCircle, color: 'text-danger', label: 'Error' },
    max_steps_reached: { icon: AlertTriangle, color: 'text-warning', label: 'Max Steps' },
  };

  const s = statusStyles[result.status] ?? statusStyles.error!;
  const StatusIcon = s.icon;

  return (
    <div className="lumen-card space-y-3 rounded-[22px] p-5">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-[18px] w-[18px]', s.color)} strokeWidth={1.75} />
          <span className="text-[15px] font-bold">{s.label}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-label-2">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {result.totalSteps} steps
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {(result.totalLatencyMs / 1000).toFixed(1)}s
          </span>
          {result.totalTokens > 0 && (
            <span>{result.totalTokens.toLocaleString()} tokens</span>
          )}
        </div>
      </div>

      {/* Answer */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {result.answer}
        </div>
      </div>
    </div>
  );
}

// ── Main View ───────────────────────────────────────────

interface AgentViewProps {
  serverId: string;
}

export function AgentView({ serverId }: AgentViewProps) {
  const [question, setQuestion] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps appear
  useEffect(() => {
    if (result && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [result?.steps.length]);

  const handleInvestigate = async (q?: string) => {
    const finalQuestion = q ?? question;
    if (!finalQuestion.trim()) return;

    setRunning(true);
    setResult(null);

    try {
      const res = await startAgentInvestigation(serverId, finalQuestion, {
        maxSteps: 10,
        readOnly: true,
      });

      if (res.success && res.data) {
        setResult(res.data);
      } else {
        toast.error(res.error ?? 'Investigation failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Investigation failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <AgentHeader
        icon={Bot}
        title="AI Investigation Agent"
        subtitle="Ask a question about your server — the agent will run diagnostic commands to investigate"
      />

      {/* Main scroll area */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="space-y-5 px-4 pb-4">
          {/* Preset suggestions (only when no result) */}
          {!result && !running && (
            <div className="space-y-2.5">
              <SectionLabel>Quick investigations</SectionLabel>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
                {PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    className={PRESET_TILE_CLASS}
                    onClick={() => {
                      setQuestion(preset.question);
                      handleInvestigate(preset.question);
                    }}
                  >
                    <span className="text-[13px] font-semibold">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Running indicator */}
          {running && !result && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Spinner className="h-5 w-5 text-accent-solid" />
              <span className="text-sm text-label-2">Investigating…</span>
            </div>
          )}

          {/* Steps */}
          {result && (
            <div className="space-y-2">
              <SectionLabel>Investigation Steps</SectionLabel>
              {result.steps.map(step => (
                <StepCard key={step.stepNumber} step={step} />
              ))}
            </div>
          )}

          {/* Final answer */}
          {result && (
            <div className="space-y-2">
              <SectionLabel>Diagnosis</SectionLabel>
              <ResultSummary result={result} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4">
        <Composer>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the agent to investigate something… e.g., 'Why is memory usage high?'"
            className={COMPOSER_TEXTAREA_CLASS}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleInvestigate();
              }
            }}
            disabled={running}
          />
          {running ? (
            <Button
              variant="destructive"
              size="icon"
              className={COMPOSER_BUTTON_CLASS}
              onClick={() => {
                // Abort would require session tracking — for now just wait
                toast.info('Investigation will complete shortly…');
              }}
            >
              <Square strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              size="icon"
              className={COMPOSER_BUTTON_CLASS}
              disabled={!question.trim()}
              onClick={() => handleInvestigate()}
            >
              <Send strokeWidth={1.75} />
            </Button>
          )}
        </Composer>
        <p className="mt-2 px-4 text-[11px] text-label-3">
          Read-only mode — the agent can only run diagnostic commands. Max 10 steps per investigation.
        </p>
      </div>
    </div>
  );
}
