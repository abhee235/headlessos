// EX8.6: LumenOS v3 building blocks shared by the AI Agent and UI Agent views
//   AgentHeader   — plate icon tile + 15px bold title + 12px caption, sits on the window glass
//   SectionLabel  — 11px uppercase group label
//   PRESET_TILE   — glass tile for quick prompts / history rows (radius 18px)
//   BUBBLE        — message / step bubble (bg-mat-thin, border-edge, radius 18px)
//   Composer      — pill field (bg-field, border-edge) holding the textarea + round send button
// @see Custom OS UI Design/handoff/HANDOFF.md §2

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const BUBBLE_CLASS = 'rounded-[18px] border border-edge bg-mat-thin';

export const PRESET_TILE_CLASS =
  'rounded-[18px] border border-edge bg-mat-thin px-3.5 py-3 text-left shadow-[var(--lumen-spec)] ' +
  'transition-colors duration-150 hover:bg-mat focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Textarea inside the Composer: transparent, no own border/ring */
export const COMPOSER_TEXTAREA_CLASS =
  'min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent px-0 py-2 text-sm shadow-none ' +
  'placeholder:text-label-3 focus-visible:ring-0 md:text-sm';

/** Round 36px send / stop button inside the Composer */
export const COMPOSER_BUTTON_CLASS = 'h-9 w-9 shrink-0 rounded-full';

interface AgentHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
}

export function AgentHeader({ icon: Icon, title, subtitle, trailing }: AgentHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
      <div className="lumen-plate grid h-9 w-9 shrink-0 place-items-center rounded-[11px]">
        <Icon className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-bold leading-tight">{title}</h2>
        <p className="mt-0.5 truncate text-xs text-label-2">{subtitle}</p>
      </div>
      {trailing}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[.06em] text-label-3">{children}</p>
  );
}

interface ComposerProps {
  children: React.ReactNode;
  className?: string;
}

/** Pill field: wraps a transparent Textarea and the round action button */
export function Composer({ children, className }: ComposerProps) {
  return (
    <div
      className={cn(
        'flex items-end gap-2 rounded-[22px] border border-edge bg-field py-1.5 pl-4 pr-1.5 transition-[box-shadow,border-color] duration-150',
        'focus-within:border-accent-solid/60 focus-within:ring-[3px] focus-within:ring-accent-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}
