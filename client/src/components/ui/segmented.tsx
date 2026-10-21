// EX8.14: Segmented control — the one tab / filter / option pill look for all of
// HeadlessOS, taken from Settings: a bg-fill well with 3px padding, 32px
// rounded-full options in 14px text, and the selected option raised on bg-mat-thick
// (the theme surface, never the accent). Tabs (`ui/tabs.tsx`), Server Admin's
// SegmentTabs/SegmentButtons and every hand-rolled filter use these classes.
// @see docs/phases/phase-ex8.md

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The recessed well around the options (38px tall with 32px options) */
export const SEGMENT_WELL = 'inline-flex shrink-0 items-center rounded-full bg-fill p-[3px]';

/** One option; add SEGMENT_ON or SEGMENT_OFF (or use segmentItemClass) */
export const SEGMENT_ITEM =
  'flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] ' +
  'transition-[background,color,box-shadow] duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';

/** Selected: the raised theme surface */
export const SEGMENT_ON = 'bg-mat-thick text-foreground shadow-[0_1px_3px_rgba(0,0,0,.18),var(--lumen-spec)]';

/** Not selected */
export const SEGMENT_OFF = 'text-label-2 hover:text-foreground';

export function segmentItemClass(selected: boolean, className?: string): string {
  return cn(SEGMENT_ITEM, selected ? SEGMENT_ON : SEGMENT_OFF, className);
}

/** Count bubble inside an option (Server Admin tabs, filters) */
export function SegmentCount({ children, selected = false, className }: { children: React.ReactNode; selected?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums',
        selected ? 'bg-fill-2 text-foreground' : 'bg-fill text-label-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: LucideIcon | React.ReactElement;
  count?: number;
  testId?: string;
  disabled?: boolean;
}

/** Button-group form (aria-pressed). For tab panels use `ui/tabs`, which shares the look. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  itemClassName,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  className?: string;
  itemClassName?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={cn(SEGMENT_WELL, className)} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        let iconNode: React.ReactNode = null;
        if (React.isValidElement(opt.icon)) {
          iconNode = opt.icon;
        } else if (opt.icon) {
          const Icon = opt.icon as LucideIcon;
          iconNode = <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />;
        }
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            disabled={opt.disabled}
            data-testid={opt.testId}
            className={segmentItemClass(selected, itemClassName)}
          >
            {iconNode}
            {opt.label}
            {opt.count !== undefined && <SegmentCount selected={selected}>{opt.count}</SegmentCount>}
          </button>
        );
      })}
    </div>
  );
}
