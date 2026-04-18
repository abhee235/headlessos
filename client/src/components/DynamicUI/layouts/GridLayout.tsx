// EX1.2 + EX3-P.8 + EX3-A.3: Grid Layout — CSS grid with fixed columns or responsive auto-fit
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import type { DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { ContentRenderer } from '../ContentRenderer';

type GridLayout = DeepPartial<Layout & { layout: 'grid' }>;

const colsMap: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export function GridLayout({ layout }: { layout: GridLayout }) {
  const autoFit = (layout as Record<string, unknown>).autoFit === true;
  const minChildWidth = ((layout as Record<string, unknown>).minChildWidth as number) ?? 250;
  const children = ((layout as Record<string, unknown>).children ?? []) as unknown[];

  // EX3-A.3: Auto-fit uses CSS repeat(auto-fit, minmax(Xpx, 1fr)) for responsive reflow
  const gridStyle = autoFit
    ? { gridTemplateColumns: `repeat(auto-fit, minmax(${minChildWidth}px, 1fr))` }
    : undefined;

  const fixedCols = !autoFit
    ? colsMap[(layout.columns as number) ?? 2] ?? 'grid-cols-2'
    : undefined;

  return (
    <div className={cn('grid gap-4', fixedCols)} style={gridStyle}>
      {children.filter(Boolean).map((child, i) => (
        <ContentRenderer key={i} item={child as DeepPartial<Layout>} index={i} />
      ))}
    </div>
  );
}
