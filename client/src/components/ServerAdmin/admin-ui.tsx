// EX8.6: LumenOS v3 building blocks shared by the Server Admin sections and
// the Services app — section header, segmented sub-tabs, pill search, glass
// table card, mono chips, empty/error states and stat tiles.
// @see docs/phases/phase-ex8.md

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, MoreHorizontal, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableHead, TableRow, TableCell } from '@/components/ui/table';

// ── Section header ───────────────────────────────────────────────
// 40px icon tile · 24px bold title + status badge · 13px host line · actions on the right

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  /** Status badge (or any inline element) shown after the title */
  badge?: React.ReactNode;
  /** Host / context line under the title */
  subtitle?: React.ReactNode;
  /** Buttons on the right */
  actions?: React.ReactNode;
}

export function SectionHeader({ icon: Icon, title, badge, subtitle, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-edge bg-fill shadow-[var(--lumen-spec)]">
          <Icon className="h-[18px] w-[18px] text-label-2" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-[24px] font-bold leading-7 tracking-[-0.01em] text-foreground">{title}</h2>
            {badge}
          </div>
          {subtitle && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[13px] text-label-2">{subtitle}</div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Glass pill "Refresh" button used in every section header */
export function RefreshButton({
  onClick,
  disabled,
  spinning,
  title = 'Refresh',
}: {
  onClick: () => void;
  disabled?: boolean;
  spinning?: boolean;
  title?: string;
}) {
  return (
    <Button variant="secondary" onClick={onClick} disabled={disabled} title={title}>
      <RefreshCw strokeWidth={1.75} className={cn(spinning && 'animate-spin')} />
      Refresh
    </Button>
  );
}

// ── Section layout ───────────────────────────────────────────────

/** Scroll column for one section: inset from the sidebar, stacked 16px blocks */
export function SectionBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('@container space-y-4 px-4 pb-4', className)}>{children}</div>;
}

// ── Segmented sub-tabs (Radix Tabs) ──────────────────────────────
// Pill well; the active pill is .lumen-lit with a translucent count chip.

export interface SegmentItem<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export function CountChip({ children, lit = false, className }: { children: React.ReactNode; lit?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums',
        lit ? 'bg-current/20' : 'bg-fill text-label-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

const SEGMENT_WELL = 'h-10 border border-edge p-1';
const SEGMENT_ITEM = 'h-8 gap-2 px-4 text-[13px] font-semibold text-label-2 hover:text-foreground';

/** Render inside a controlled `<Tabs value=…>` — `value` must match it so the active pill can be lit. */
export function SegmentTabs<T extends string>({
  value,
  items,
  className,
}: {
  value: T;
  items: SegmentItem<T>[];
  className?: string;
}) {
  return (
    <TabsList className={cn(SEGMENT_WELL, className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <TabsTrigger key={item.value} value={item.value} className={cn(SEGMENT_ITEM, active && 'lumen-lit')}>
            {item.label}
            {item.count !== undefined && <CountChip lit={active}>{item.count}</CountChip>}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

/** Same look as SegmentTabs, for plain button filters (no tab semantics). */
export function SegmentButtons<T extends string>({
  value,
  items,
  onChange,
  className,
}: {
  value: T;
  items: SegmentItem<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-0.5 rounded-full bg-fill', SEGMENT_WELL, className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-full transition-[background,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              SEGMENT_ITEM,
              active && 'lumen-lit',
            )}
          >
            {item.label}
            {item.count !== undefined && <CountChip lit={active}>{item.count}</CountChip>}
          </button>
        );
      })}
    </div>
  );
}

// ── Pill search field ────────────────────────────────────────────

interface SearchFieldProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Shows a clear (×) button when the field has text */
  onClear?: () => void;
  wrapperClassName?: string;
}

export function SearchField({ value, onValueChange, onClear, wrapperClassName, className, ...rest }: SearchFieldProps) {
  return (
    <div className={cn('relative w-[260px]', wrapperClassName)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-label-3"
        strokeWidth={1.75}
      />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn('h-10 pl-10', onClear && 'pr-9', className)}
        {...rest}
      />
      {onClear && value && (
        <button
          type="button"
          className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-label-3 transition-colors duration-150 hover:bg-fill hover:text-foreground"
          onClick={onClear}
          aria-label="Clear search"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

// ── Glass table card ─────────────────────────────────────────────
// .lumen-card radius 20 · 13px header row with a hairline · ~54px rows on hairlines

export function TableCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('lumen-card overflow-hidden rounded-[20px]', className)}>{children}</div>;
}

/** Title strip at the top of a TableCard (e.g. "Human users 2  [+ Add user]") */
export function CardHeading({
  title,
  count,
  icon: Icon,
  caption,
  actions,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  caption?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-border px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-[17px] w-[17px] shrink-0 text-label-2" strokeWidth={1.75} />}
        <h3 className="truncate text-[15px] font-bold text-foreground">{title}</h3>
        {count !== undefined && <CountChip>{count}</CountChip>}
        {caption && <span className="truncate text-[12px] text-label-3">{caption}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function HeadRow({ children }: { children: React.ReactNode }) {
  return <TableRow className="border-b border-border hover:bg-transparent">{children}</TableRow>;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableHead
      className={cn('h-11 px-3 text-[13px] font-semibold text-label-2 first:pl-5 last:pr-5', className)}
      {...props}
    />
  );
}

export const Tr = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <TableRow
      ref={ref}
      className={cn('h-[54px] border-b border-border duration-150 hover:bg-fill', className)}
      {...props}
    />
  ),
);
Tr.displayName = 'Tr';

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <TableCell className={cn('px-3 py-2 text-[14px] first:pl-5 last:pr-5', className)} {...props} />;
}

/** Full-width placeholder row inside a table */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-12 text-center text-[13px] text-label-3">
        {children}
      </TableCell>
    </TableRow>
  );
}

// ── Inline chips and buttons ─────────────────────────────────────

/** Protocol / interface / path chip: mono text on bg-fill with an edge, radius 6 */
export function MonoChip({ className, children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-[6px] border border-edge bg-fill px-2 font-mono text-[12px] font-medium text-label-2',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Round 30px ghost button with a hairline edge ("…", key, trash in table rows) */
export const RoundIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' }
>(({ className, tone = 'default', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-edge transition-colors duration-150',
      'hover:bg-fill active:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4',
      tone === 'danger' ? 'text-danger hover:bg-danger/12' : 'text-label-2 hover:text-foreground',
      className,
    )}
    {...props}
  />
));
RoundIconButton.displayName = 'RoundIconButton';

/** The "…" row-menu trigger */
export const RowMenuButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => (
    <RoundIconButton ref={ref} aria-label="Row actions" {...props}>
      <MoreHorizontal strokeWidth={1.75} />
    </RoundIconButton>
  ),
);
RowMenuButton.displayName = 'RowMenuButton';

/** Inline `code` chip for install hints */
export function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-flex items-center rounded-[8px] border border-edge bg-fill px-3 py-1.5 font-mono text-[12.5px] text-foreground">
      {children}
    </code>
  );
}

// ── Cards, stats, states ─────────────────────────────────────────

/** Form / detail panel: a glass card with 20px padding */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('lumen-card space-y-3 rounded-[20px] p-5', className)}>{children}</div>;
}

export function PanelTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-[15px] font-bold text-foreground', className)}>{children}</h3>;
}

/** Small caption / form label text */
export const FIELD_LABEL = 'text-[12px] font-medium text-label-2';

export function StatCard({
  label,
  value,
  caption,
  valueClassName,
  className,
}: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn('lumen-card rounded-[20px] px-4 py-3.5', className)}>
      <p className="text-[13px] font-medium text-label-2">{label}</p>
      <div className={cn('mt-0.5 flex items-center gap-2 text-[28px] font-bold leading-9 tracking-[-0.02em] text-foreground', valueClassName)}>
        {value}
      </div>
      {caption && <p className="text-[12px] text-label-3">{caption}</p>}
    </div>
  );
}

/** Centered empty state: 56px icon tile, 17px title, 14px description, optional code + action */
export function EmptyState({
  icon: Icon,
  title,
  description,
  code,
  action,
  bare = false,
  className,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  code?: string;
  action?: React.ReactNode;
  /** Render without the surrounding glass card */
  bare?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        !bare && 'lumen-card rounded-[20px]',
        className,
      )}
    >
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-[16px] border border-edge bg-fill shadow-[var(--lumen-spec)]">
        <Icon className="h-6 w-6 text-label-2" strokeWidth={1.75} />
      </div>
      <p className="text-[17px] font-bold text-foreground">{title}</p>
      {description && <p className="max-w-md text-[14px] text-label-2">{description}</p>}
      {code && (
        <div className="mt-1">
          <CodeChip>{code}</CodeChip>
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Load-failure state with a Retry pill */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="px-4 pb-4">
      <EmptyState
        icon={AlertCircle}
        title={message}
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    </div>
  );
}
