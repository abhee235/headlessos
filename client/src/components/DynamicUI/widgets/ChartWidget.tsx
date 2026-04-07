// EX1.5: Chart Widget — Bar, Line, Area, Pie, Donut via recharts
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { ChartWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

type ChartWidgetData = z.infer<typeof ChartWidgetSchema>;

/** Default palette for chart series when no color is specified */
const DEFAULT_COLORS = [
  'oklch(0.65 0.19 145)',   // green
  'oklch(0.60 0.19 260)',   // blue
  'oklch(0.70 0.18 50)',    // orange
  'oklch(0.65 0.20 330)',   // pink
  'oklch(0.72 0.15 85)',    // yellow
  'oklch(0.55 0.22 290)',   // purple
  'oklch(0.68 0.16 175)',   // teal
  'oklch(0.60 0.17 15)',    // red
];

function buildChartConfig(yKeys: ChartWidgetData['yKeys']): ChartConfig {
  const config: ChartConfig = {};
  yKeys.forEach((yk, i) => {
    config[yk.key] = {
      label: yk.label ?? yk.key,
      color: yk.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    };
  });
  return config;
}

function getColor(yKeys: ChartWidgetData['yKeys'], index: number): string {
  return yKeys[index]?.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function ChartWidget({ widget }: { widget: ChartWidgetData }) {
  const { title, chartType, data, xKey, yKeys, height = 300 } = widget;
  const config = buildChartConfig(yKeys);
  const isPie = chartType === 'pie' || chartType === 'donut';

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      )}
      <ChartContainer config={config} className="w-full" style={{ height }}>
        {isPie ? (
          <PieChart>
            <Pie
              data={data}
              dataKey={yKeys[0]?.key ?? 'value'}
              nameKey={xKey}
              innerRadius={chartType === 'donut' ? '50%' : 0}
              outerRadius="80%"
              paddingAngle={2}
            >
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getColor(yKeys, index)}
                />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
          </PieChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((yk, i) => (
              <Bar
                key={yk.key}
                dataKey={yk.key}
                fill={getColor(yKeys, i)}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        ) : chartType === 'line' ? (
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((yk, i) => (
              <Line
                key={yk.key}
                type="monotone"
                dataKey={yk.key}
                stroke={getColor(yKeys, i)}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          /* area chart */
          <AreaChart data={data} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {yKeys.map((yk, i) => (
              <Area
                key={yk.key}
                type="monotone"
                dataKey={yk.key}
                fill={getColor(yKeys, i)}
                stroke={getColor(yKeys, i)}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        )}
      </ChartContainer>
    </div>
  );
}
