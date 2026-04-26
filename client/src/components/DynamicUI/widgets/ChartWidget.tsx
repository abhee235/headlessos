// EX1.5 + EX3-A.6: Chart Widget — Bar, Line, Area, Pie, Donut via recharts
// Enhanced with stacking, thresholds, unit formatting, grid/legend toggles
// @see docs/phases/phase-ex1.md docs/phases/phase-ex3.md

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
  ReferenceLine,
} from 'recharts';
import { formatUnit } from '@/lib/format-utils';

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

/** Build a tick formatter function for the Y-axis based on unit type */
function buildTickFormatter(
  unit?: string | null,
  unitCustom?: string | null,
): ((value: number) => string) | undefined {
  if (!unit) return undefined;
  return (value: number) => formatUnit(value, unit as Parameters<typeof formatUnit>[1], unitCustom);
}

export function ChartWidget({ widget }: { widget: ChartWidgetData }) {
  const {
    title,
    chartType,
    data,
    xKey,
    yKeys,
    height = 300,
    stacked = false,
    thresholds,
    unit,
    unitCustom,
    showGrid = true,
    showLegend = true,
  } = widget;

  const config = buildChartConfig(yKeys);
  const isPie = chartType === 'pie' || chartType === 'donut';
  const tickFormatter = buildTickFormatter(unit, unitCustom);
  const stackId = stacked ? 'stack' : undefined;

  /** Render threshold reference lines for cartesian charts */
  const renderThresholds = () =>
    thresholds?.map((t, i) => (
      <ReferenceLine
        key={`threshold-${i}`}
        y={t.value}
        stroke={t.color ?? 'rgb(var(--destructive))'}
        strokeDasharray="4 4"
        strokeWidth={1.5}
        label={t.label ? { value: t.label, position: 'insideTopRight', fontSize: 11 } : undefined}
      />
    ));

  /** Common cartesian chart elements: grid, axes, tooltip, legend */
  const renderCartesianBase = () => (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" vertical={false} />}
      <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
      <YAxis tickLine={false} axisLine={false} tickFormatter={tickFormatter} />
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={unit ? (value: number | string) => formatUnit(Number(value), unit as Parameters<typeof formatUnit>[1], unitCustom) : undefined}
          />
        }
      />
      {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      {renderThresholds()}
    </>
  );

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
            {showLegend && <ChartLegend content={<ChartLegendContent />} />}
          </PieChart>
        ) : chartType === 'bar' ? (
          <BarChart data={data} accessibilityLayer>
            {renderCartesianBase()}
            {yKeys.map((yk, i) => (
              <Bar
                key={yk.key}
                dataKey={yk.key}
                fill={getColor(yKeys, i)}
                radius={stackId ? undefined : [4, 4, 0, 0]}
                stackId={stackId}
              />
            ))}
          </BarChart>
        ) : chartType === 'line' ? (
          <LineChart data={data} accessibilityLayer>
            {renderCartesianBase()}
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
            {renderCartesianBase()}
            {yKeys.map((yk, i) => (
              <Area
                key={yk.key}
                type="monotone"
                dataKey={yk.key}
                fill={getColor(yKeys, i)}
                stroke={getColor(yKeys, i)}
                fillOpacity={0.3}
                stackId={stackId}
              />
            ))}
          </AreaChart>
        )}
      </ChartContainer>
      </CardContent>
    </Card>
  );
}
