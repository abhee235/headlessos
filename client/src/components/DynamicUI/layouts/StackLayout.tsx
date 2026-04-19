// EX1.2 + EX3-P.8: Stack Layout — vertical list of children (widgets or sub-layouts)
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import type { DeepPartial, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { ContentRenderer } from '../ContentRenderer';

type StackLayout = DeepPartial<Layout & { layout: 'stack' }>;

const gapMap: Record<string, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

export function StackLayout({ layout }: { layout: StackLayout }) {
  const gap = gapMap[(layout.gap as string) ?? 'md'] ?? 'gap-4';
  const children = ((layout as Record<string, unknown>).children ?? []) as unknown[];

  return (
    <div className={cn('flex flex-col', gap)}>
      {children.filter(Boolean).map((child, i) => (
        <ContentRenderer key={i} item={child as DeepPartial<Layout>} index={i} />
      ))}
    </div>
  );
}
