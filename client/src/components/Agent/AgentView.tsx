// M11.5 + M11.6: AI Agent View — ReAct investigation with live progress
// @see docs/DECISIONS.md (ADR-013, ADR-014)

import { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Square,
  Terminal,
  Brain,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Zap,
} from 'lucide-react';
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
    ? <CheckCircle2 className="w-4 h-4 text-success" />
    : step.decision === 'error'
      ? <XCircle className="w-4 h-4 text-destructive" />
      : <Terminal className="w-4 h-4 text-primary" />;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        {statusIcon}
        <span className="text-xs text-muted-foreground font-mono shrink-0">
          Step {step.stepNumber}
        </span>
        <span className="text-sm text-foreground/80 truncate flex-1">
          {step.thought.substring(0, 80)}{step.thought.length > 80 ? '…' : ''}
        </span>
        {step.command && (
          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
            {step.command.substring(0, 40)}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/20 pt-2">
          {/* Thought */}
          <div className="flex items-start gap-2">
            <Brain className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-foreground/70 leading-relaxed">{step.thought}</p>
          </div>

          {/* Command */}
          {step.command && (
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
              <code className="text-xs font-mono bg-muted/50 px-2 py-1 rounded flex-1">
                $ {step.command}
              </code>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-1 hover:bg-muted/50 rounded transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(step.command!);
                      toast.success('Command copied');
                    }}
                  >
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy command</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Output */}
          {step.output && (
            <div className="relative">
              <pre className="text-[11px] font-mono bg-card text-foreground/80 p-2 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                {step.output}
              </pre>
            </div>
          )}

          {/* Observation */}
          {step.observation && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{step.observation}</p>
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
    error: { icon: XCircle, color: 'text-destructive', label: 'Error' },
    max_steps_reached: { icon: AlertTriangle, color: 'text-warning', label: 'Max Steps' },
  };

  const s = statusStyles[result.status] ?? statusStyles.error!;
  const StatusIcon = s.icon;

  return (
    <div className="border border-border/40 rounded-lg p-4 space-y-3 bg-card/50">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-4 h-4 ${s.color}`} />
          <span className="text-sm font-medium">{s.label}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
        <Bot className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">AI Investigation Agent</h2>
          <p className="text-[11px] text-muted-foreground">
            Ask a question about your server — the agent will run diagnostic commands to investigate
          </p>
        </div>
      </div>

      {/* Main scroll area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {/* Preset suggestions (only when no result) */}
          {!result && !running && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Quick investigations
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    className="text-left px-3 py-2 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                    onClick={() => {
                      setQuestion(preset.question);
                      handleInvestigate(preset.question);
                    }}
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Running indicator */}
          {running && !result && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Investigating…</span>
            </div>
          )}

          {/* Steps */}
          {result && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Investigation Steps
              </p>
              {result.steps.map(step => (
                <StepCard key={step.stepNumber} step={step} />
              ))}
            </div>
          )}

          {/* Final answer */}
          {result && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Diagnosis
              </p>
              <ResultSummary result={result} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border/40 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the agent to investigate something… e.g., 'Why is memory usage high?'"
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
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
              className="shrink-0 h-[44px] w-[44px]"
              onClick={() => {
                // Abort would require session tracking — for now just wait
                toast.info('Investigation will complete shortly…');
              }}
            >
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="shrink-0 h-[44px] w-[44px]"
              disabled={!question.trim()}
              onClick={() => handleInvestigate()}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
          Read-only mode — the agent can only run diagnostic commands. Max 10 steps per investigation.
        </p>
      </div>
    </div>
  );
}
