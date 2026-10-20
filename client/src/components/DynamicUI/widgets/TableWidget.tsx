// EX1.2 + EX1.14 + EX3-P: Table Widget — tabular data + filters + rich cells + dropdown actions
// EX8.6: Lumen list-view spec — 34px rows, 11px uppercase sticky header, hairlines, bg-fill hover
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import { useState, useCallback, useMemo } from 'react';
import type { z } from 'zod';
import type {
  TableWidgetSchema, WidgetActionSchema, RichCellSegmentSchema,
} from 'headlessos-shared/schemas/dynamic-view';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDynamicViewContext } from '../DynamicViewContext';
import { executeWidgetAction } from '@/lib/api';
import { toast } from 'sonner';
import {
  Search, SlidersHorizontal, ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './icon-helper';
import { GROUP_LABEL_CLASS, WidgetCard } from './widget-card';

type TableWidget = z.infer<typeof TableWidgetSchema>;
type WidgetAction = z.infer<typeof WidgetActionSchema>;
type RichCellSegment = z.infer<typeof RichCellSegmentSchema>;

export function TableWidget({ widget }: { widget: TableWidget }) {
  const { title, columns, rows, footer, actions, actionStyle, filters } = widget;
  const hasActions = actions && actions.length > 0;
  const isDropdown = actionStyle === 'dropdown';

  // ── Filter state ─────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownValues, setDropdownValues] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    let result = rows;

    // Apply dropdown filters
    for (const [key, value] of Object.entries(dropdownValues)) {
      if (value) {
        result = result.filter((row) => {
          const cellVal = row[key];
          return cellVal != null && String(cellVal).toLowerCase() === value.toLowerCase();
        });
      }
    }

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(q);
        }),
      );
    }

    return result;
  }, [rows, columns, searchQuery, dropdownValues]);

  return (
    <WidgetCard title={title} flush className={cn(!title && 'pt-1.5', !title && filters && 'pt-4')}>
      {/* ── Filter bar (EX3-P.4) ── */}
      {filters && (
        <div className="mb-2 flex items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {(filters.dropdowns ?? []).map((dd, di) => (
              <FilterDropdown
                key={di}
                label={dd.label}
                iconName={dd.icon}
                options={dd.options ?? []}
                value={dropdownValues[dd.key] ?? ''}
                onChange={(val) =>
                  setDropdownValues((prev) => ({ ...prev, [dd.key]: val }))
                }
              />
            ))}
          </div>
          {filters.search && (
            <div className="relative w-56 shrink-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-label-3"
                strokeWidth={1.75}
              />
              <Input
                placeholder={filters.searchPlaceholder ?? 'Search...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[30px] pl-9 text-xs"
              />
            </div>
          )}
        </div>
      )}

      <Table className="text-[13px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(HEAD_CLASS, GROUP_LABEL_CLASS)}
              >
                {col.label}
              </TableHead>
            ))}
            {hasActions && !isDropdown && (
              <TableHead className={cn(HEAD_CLASS, GROUP_LABEL_CLASS, 'w-auto text-right')}>
                Actions
              </TableHead>
            )}
            {hasActions && isDropdown && (
              <TableHead className={cn(HEAD_CLASS, 'w-12')} />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.map((row, rowIdx) => (
            <TableRow key={rowIdx} className="group transition-colors duration-150 hover:bg-fill">
              {columns.map((col) => (
                <TableCell key={col.key} className={CELL_CLASS}>
                  {renderCellValue(row[col.key], col, row)}
                </TableCell>
              ))}
              {hasActions && !isDropdown && (
                <TableCell className={cn(CELL_CLASS, 'text-right')}>
                  <div className="flex items-center justify-end gap-1">
                    {actions.map((action) => (
                      <ActionButton
                        key={action.id}
                        action={action}
                        row={row}
                      />
                    ))}
                  </div>
                </TableCell>
              )}
              {hasActions && isDropdown && (
                <TableCell className={cn(CELL_CLASS, 'text-right')}>
                  <ActionDropdown actions={actions} row={row} />
                </TableCell>
              )}
            </TableRow>
          ))}
          {filteredRows.length === 0 && (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell
                colSpan={columns.length + (hasActions ? 1 : 0)}
                className="py-12 text-center"
              >
                {searchQuery || Object.values(dropdownValues).some(Boolean)
                  ? <span className="text-sm text-label-3">No rows match your filter</span>
                  : widget.emptyState
                    ? <EmptyState emptyState={widget.emptyState} />
                    : <span className="text-sm text-label-3">No data</span>}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {footer && (
        <p className="border-t border-border px-5 pt-2.5 pb-1 text-xs text-label-2">{footer}</p>
      )}
    </WidgetCard>
  );
}

/** Header + body cell recipes: 34px rows, 20px inset on the outer columns */
const HEAD_CLASS = 'sticky top-0 h-[34px] px-3 first:pl-5 last:pr-5';
const CELL_CLASS = 'h-[34px] px-3 py-1.5 first:pl-5 last:pr-5';

// ── Filter Dropdown ──────────────────────────────────────

function FilterDropdown({
  label,
  iconName,
  options,
  value,
  onChange,
}: {
  label: string;
  iconName?: string | null;
  options: { label: string; value: string }[];
  value: string;
  onChange: (val: string) => void;
}) {
  const Icon = iconName ? getLucideIcon(iconName) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn('gap-1.5 text-xs', value && 'bg-accent-soft text-accent-text')}
        >
          {!Icon && <SlidersHorizontal strokeWidth={1.75} />}
          {Icon && <Icon strokeWidth={1.75} />}
          {value ? options.find((o) => o.value === value)?.label ?? label : label}
          <ChevronDown className="text-label-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        <DropdownMenuItem onClick={() => onChange('')}>
          {label}
        </DropdownMenuItem>
        {options.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Dropdown Action Menu (EX3-P.5) ──────────────────────

function ActionDropdown({
  actions,
  row,
}: {
  actions: WidgetAction[];
  row: Record<string, unknown>;
}) {
  const { serverId } = useDynamicViewContext();
  const [executing, setExecuting] = useState(false);

  const handleAction = useCallback(
    async (action: WidgetAction) => {
      if (!serverId) {
        toast.error('No server connected');
        return;
      }
      setExecuting(true);
      try {
        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          params[key] = value == null ? '' : String(value);
        }
        const result = await executeWidgetAction(serverId, action.command, params);
        if (result.success) {
          toast.success(`${action.label}: completed`, {
            description: result.output?.substring(0, 100),
          });
        } else {
          toast.error(`${action.label}: failed`, { description: result.error });
        }
      } catch (err) {
        toast.error(`${action.label}: failed`, {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setExecuting(false);
      }
    },
    [serverId, row],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-grid h-7 w-7 place-items-center rounded-full bg-fill text-label-2 opacity-70 transition-[background,opacity,color] duration-150 hover:bg-fill-2 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={executing}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((action) => {
          const ActionIcon = action.icon ? getLucideIcon(action.icon) : null;
          return (
            <DropdownMenuItem
              key={action.id}
              onClick={() => void handleAction(action)}
              className={action.variant === 'destructive' ? 'text-danger' : ''}
            >
              {ActionIcon && <ActionIcon strokeWidth={1.75} />}
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Action Button with confirmation ──────────────────────

function ActionButton({
  action,
  row,
}: {
  action: WidgetAction;
  row: Record<string, unknown>;
}) {
  const { serverId } = useDynamicViewContext();
  const [confirming, setConfirming] = useState(false);
  const [executing, setExecuting] = useState(false);

  const executeAction = useCallback(async () => {
    if (!serverId) {
      toast.error('No server connected');
      return;
    }

    setExecuting(true);
    try {
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        params[key] = value == null ? '' : String(value);
      }

      const result = await executeWidgetAction(serverId, action.command, params);

      if (result.success) {
        toast.success(`${action.label}: completed`, {
          description: result.output
            ? result.output.substring(0, 100)
            : undefined,
        });
      } else {
        toast.error(`${action.label}: failed`, {
          description: result.error,
        });
      }
    } catch (err) {
      toast.error(`${action.label}: failed`, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setExecuting(false);
    }
  }, [serverId, action, row]);

  const handleClick = useCallback(() => {
    if (action.confirm) {
      setConfirming(true);
    } else {
      executeAction();
    }
  }, [action.confirm, executeAction]);

  // Row actions read as glass pills; destructive keeps its danger-text look
  const variant = (action.variant && action.variant !== 'default' ? action.variant : 'secondary') as
    | 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="h-[26px] px-3 text-xs"
        disabled={executing || !serverId}
        onClick={handleClick}
      >
        {executing ? 'Running...' : action.label}
      </Button>
      {action.confirm && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={action.label}
          description={action.confirmMessage ?? `Are you sure you want to run "${action.label}"?`}
          variant={action.variant === 'destructive' ? 'destructive' : 'default'}
          onConfirm={() => {
            setConfirming(false);
            executeAction();
          }}
        />
      )}
    </>
  );
}

// ── Rich cell component (EX3-P.3) ───────────────────────

function RichCell({
  segments,
  row,
}: {
  segments: RichCellSegment[];
  row: Record<string, unknown>;
}) {
  return (
    <div className="flex items-center gap-2">
      {segments.map((seg, i) => {
        switch (seg.segment) {
          case 'text': {
            const val = row[seg.key];
            return val != null ? (
              <span key={i} className={seg.className ?? ''}>
                {String(val)}
              </span>
            ) : null;
          }
          case 'badge': {
            const val = row[seg.key];
            if (val == null || String(val) === '') return null;
            const str = String(val);
            const variant = seg.badgeVariant?.[str] ?? seg.variant ?? 'default';
            return (
              <Badge key={i} variant={variant}>
                {str}
              </Badge>
            );
          }
          case 'icon': {
            if (seg.key && !row[seg.key]) return null;
            const IconComp = getLucideIcon(seg.icon);
            return IconComp ? (
              <IconComp
                key={i}
                size={13}
                strokeWidth={1.75}
                className={seg.className ?? 'text-label-3'}
              />
            ) : null;
          }
          case 'dot': {
            if (!row[seg.key]) return null;
            // Named dot colours map onto theme tokens
            const colorMap: Record<string, string> = {
              amber: 'bg-warning',
              emerald: 'bg-success',
              red: 'bg-danger',
              blue: 'bg-chart-3',
              green: 'bg-success',
              yellow: 'bg-warning',
              orange: 'bg-warning',
              purple: 'bg-accent-solid',
              gray: 'bg-label-3',
            };
            const bgClass = colorMap[seg.color ?? 'amber'] ?? 'bg-warning';
            return (
              <span
                key={i}
                className={cn('inline-block w-2 h-2 rounded-full', bgClass)}
              />
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Cell rendering ───────────────────────────────────────

type ColumnDef = TableWidget['columns'][number];

function renderCellValue(
  value: unknown,
  col: ColumnDef,
  row: Record<string, unknown>,
): React.ReactNode {
  const str = value == null ? '' : String(value);

  switch (col.type) {
    case 'badge': {
      const variant = col.badgeVariant?.[str] ?? 'default';
      return <Badge variant={variant}>{str}</Badge>;
    }
    case 'code':
      return (
        <code className="rounded-[6px] bg-chip px-1.5 py-0.5 font-mono text-xs">
          {str}
        </code>
      );
    case 'mono':
      return <span className="font-mono text-[13px]">{str}</span>;
    case 'rich':
      return col.segments ? (
        <RichCell segments={col.segments} row={row} />
      ) : (
        <span>{str}</span>
      );
    case 'percent':
      return <span>{str}%</span>;
    case 'number':
    case 'bytes':
    case 'date':
    case 'text':
    default:
      return <span>{str}</span>;
  }
}
// ── Empty State (EX3-P.8) ────────────────────────────────

function EmptyState({ emptyState }: { emptyState: { icon?: string | null; title: string; message?: string | null } }) {
  const Icon = emptyState.icon ? getLucideIcon(emptyState.icon) : null;
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      {Icon && <Icon className="h-10 w-10 text-label-3 opacity-60" strokeWidth={1.5} />}
      <p className="text-sm font-semibold text-label-2">{emptyState.title}</p>
      {emptyState.message && (
        <p className="text-xs text-label-3">{emptyState.message}</p>
      )}
    </div>
  );
}