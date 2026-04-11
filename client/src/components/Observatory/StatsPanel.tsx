// EX4-D.3: Stats Panel — Phoenix-style compact inline metrics bar
// @see docs/phases/phase-ex4.md

import { useObservatoryStore } from '../../store/observatory-store';
import { formatTokens, formatCost, formatLatency } from './constants';
import { SpanKindIcon } from './SpanKindIcon';

function StatItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">{label}</span>
      <span className={`text-xs font-medium text-[rgb(var(--foreground))] ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-3.5 bg-[rgb(var(--border))]/50" />;
}

export function StatsPanel() {
  const stats = useObservatoryStore((s) => s.stats);

  if (!stats) {
    return null;
  }

  const spansByKind = stats.spansByKind as Record<string, number>;

  return (
    <div className="border-b border-[rgb(var(--border))] px-4 py-2">
      <div className="flex items-center gap-4 flex-wrap">
        <StatItem label="Traces" value={String(stats.totalTraces)} />
        <Divider />
        <StatItem label="Spans" value={String(stats.totalSpans)} />

        {/* Span kind breakdown — inline with Phoenix icons */}
        {Object.entries(spansByKind)
          .filter(([, v]) => v > 0)
          .map(([kind, count]) => (
            <div key={kind} className="flex items-center gap-1">
              <SpanKindIcon kind={kind} variant="outline" size={12} />
              <span className="text-[10px] text-[rgb(var(--muted-foreground))]">{count}</span>
            </div>
          ))}

        <Divider />
        <StatItem label="Tokens" value={formatTokens(stats.totalTokens)} mono />
        <Divider />
        <StatItem label="Cost" value={formatCost(stats.totalCostUsd)} mono />
        <Divider />
        <StatItem label="Avg Latency" value={formatLatency(stats.averageLatencyMs)} mono />

        {/* Model breakdown — compact */}
        {Object.keys(stats.tokensByModel).length > 0 && (
          <>
            <Divider />
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[rgb(var(--muted-foreground))]">Models</span>
              {Object.entries(stats.tokensByModel as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([model, tokens]) => (
                  <span key={model} className="text-[10px] text-[rgb(var(--muted-foreground))] font-mono">
                    {model}: {formatTokens(tokens)}
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
