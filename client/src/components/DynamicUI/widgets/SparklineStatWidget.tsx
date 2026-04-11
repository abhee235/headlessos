// EX3-A.5: Sparkline Stat Card Widget — stat-card with tiny area chart behind value
// Purely decorative sparkline — no tooltip, no axes, no interactivity
// @see docs/phases/phase-ex3.md

import type { z } from 'zod';
import type { SparklineStatWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent } from '@/components/ui/card';
import { AreaChart, Area } from 'recharts';
import { cn } from '@/lib/utils';

type SparklineStatWidgetData = z.infer<typeof SparklineStatWidgetSchema>;

export function SparklineStatWidget({ widget }: { widget: SparklineStatWidgetData }) {
  const { title, value, unit, description, trend, sparklineData, sparklineColor } = widget;

  const hasSparkline = sparklineData && sparklineData.length >= 2;

  // Transform array of numbers into recharts-compatible data
  const chartData = hasSparkline
    ? sparklineData.map((v, i) => ({ idx: i, val: v }))
    : [];

  const strokeColor = sparklineColor ?? 'rgb(var(--primary))';

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-4 relative z-10">
        <div className="space-y-1">
          {title && <p className="text-xs text-muted-foreground">{title}</p>}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            {trend && trend !== 'neutral' && (
              <span className={cn(
                'ml-1 text-xs font-medium',
                trend === 'up' && 'text-success',
                trend === 'down' && 'text-destructive',
              )}>
                {trend === 'up' ? '↑' : '↓'}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </CardContent>
      {/* Sparkline overlay — positioned absolutely behind the content */}
      {hasSparkline && (
        <div className="absolute bottom-0 left-0 right-0 opacity-20 pointer-events-none">
          <AreaChart
            width={200}
            height={40}
            data={chartData}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <Area
              type="monotone"
              dataKey="val"
              stroke={strokeColor}
              fill={strokeColor}
              fillOpacity={0.08}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </div>
      )}
    </Card>
  );
}
