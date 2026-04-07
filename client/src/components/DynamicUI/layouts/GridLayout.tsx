// EX1.2 + EX3-P.8: Grid Layout — CSS grid with configurable columns, nestable children
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
};

export function GridLayout({ layout }: { layout: GridLayout }) {
  const cols = colsMap[(layout.columns as number) ?? 2] ?? 'grid-cols-2';
  const children = ((layout as Record<string, unknown>).children ?? []) as unknown[];

  return (
    <div className={cn('grid gap-4', cols)}>
      {children.filter(Boolean).map((child, i) => (
        <ContentRenderer key={i} item={child as DeepPartial<Layout>} />
      ))}
    </div>
  );
}
