// EX4-D.3: Stats Panel — Phoenix-style compact inline metrics bar
// EX8.6: Lumen chips on the window glass
// @see docs/phases/phase-ex4.md

import { useObservatoryStore } from '../../store/observatory-store';
import { formatTokens, formatCost, formatLatency } from './constants';
import { SpanKindIcon } from './SpanKindIcon';

function StatItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[.06em] text-label-3">{label}</span>
      <span className={`text-[13px] font-semibold text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-3.5 w-px bg-border" />;
}

export function StatsPanel() {
  const stats = useObservatoryStore((s) => s.stats);

  if (!stats) {
    return null;
  }

  const spansByKind = stats.spansByKind as Record<string, number>;

  return (
    <div className="shrink-0 px-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-edge bg-mat-thin px-4 py-2 shadow-[var(--lumen-spec)]">
        <StatItem label="Traces" value={String(stats.totalTraces)} />
        <Divider />
        <StatItem label="Spans" value={String(stats.totalSpans)} />

        {/* Span kind breakdown — inline with Phoenix icons */}
        {Object.entries(spansByKind)
          .filter(([, v]) => v > 0)
          .map(([kind, count]) => (
            <div key={kind} className="flex items-center gap-1">
              <SpanKindIcon kind={kind} variant="outline" size={12} />
              <span className="text-[11px] font-medium text-label-2">{count}</span>
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
              <span className="text-[10px] font-bold uppercase tracking-[.06em] text-label-3">Models</span>
              {Object.entries(stats.tokensByModel as Record<string, number>)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([model, tokens]) => (
                  <span key={model} className="rounded-[6px] bg-chip px-1.5 py-0.5 font-mono text-[10px] text-label-2">
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
