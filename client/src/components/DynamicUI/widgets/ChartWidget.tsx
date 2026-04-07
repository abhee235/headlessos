// EX1.5: Chart Widget — Bar, Line, Area, Pie, Donut via recharts
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { ChartWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

/** Default palette uses the theme's --chart-1..5 CSS variables, then cycles */
const DEFAULT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
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
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
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
      </CardContent>
    </Card>
  );
}
