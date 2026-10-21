// EX3-A.5: Sparkline Stat Card Widget — stat-card with tiny area chart under the value
// Purely decorative sparkline — no tooltip, no axes, no interactivity
// EX8.6: accent stroke + accent-soft area fill, full card width
// @see docs/phases/phase-ex3.md

import type { z } from 'zod';
import type { SparklineStatWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { StatBlock, WidgetCard } from './widget-card';

type SparklineStatWidgetData = z.infer<typeof SparklineStatWidgetSchema>;

export function SparklineStatWidget({ widget }: { widget: SparklineStatWidgetData }) {
  const { title, value, unit, description, trend, sparklineData, sparklineColor } = widget;

  const hasSparkline = sparklineData && sparklineData.length >= 2;

  // Transform array of numbers into recharts-compatible data
  const chartData = hasSparkline
    ? sparklineData.map((v, i) => ({ idx: i, val: v }))
    : [];

  const strokeColor = sparklineColor ?? 'var(--lumen-accent)';
  const fillColor = sparklineColor ?? 'var(--lumen-accent-soft)';

  return (
    <WidgetCard className="flex flex-col overflow-hidden pb-0">
      <StatBlock title={title} value={value} unit={unit} trend={trend} description={description} />
      {hasSparkline ? (
        <div className="pointer-events-none -mx-5 mt-auto h-[60px] shrink-0 pt-3" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="val"
                stroke={strokeColor}
                fill={fillColor}
                fillOpacity={sparklineColor ? 0.15 : 1}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-5" />
      )}
    </WidgetCard>
  );
}
