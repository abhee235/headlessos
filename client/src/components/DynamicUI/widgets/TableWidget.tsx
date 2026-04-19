// EX1.2 + EX1.14 + EX3-P: Table Widget — tabular data + filters + rich cells + dropdown actions
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        {/* ── Filter bar (EX3-P.4) ── */}
        {filters && (
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
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
              <div className="relative w-56">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/30"
                />
                <Input
                  placeholder={filters.searchPlaceholder ?? 'Search...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-muted/30 border shadow-none"
                />
              </div>
            )}
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-0">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className="text-xs font-medium text-foreground/40 h-9"
                >
                  {col.label}
                </TableHead>
              ))}
              {hasActions && !isDropdown && (
                <TableHead className="w-auto text-right text-xs font-medium text-foreground/40 h-9">
                  Actions
                </TableHead>
              )}
              {hasActions && isDropdown && (
                <TableHead className="w-10 text-xs font-medium text-foreground/40 h-9" />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row, rowIdx) => (
              <TableRow key={rowIdx} className="border-0 hover:bg-muted/20 group">
                {columns.map((col) => (
                  <TableCell key={col.key} className="py-3">
                    {renderCellValue(row[col.key], col, row)}
                  </TableCell>
                ))}
                {hasActions && !isDropdown && (
                  <TableCell className="text-right py-3">
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
                  <TableCell className="py-3">
                    <ActionDropdown actions={actions} row={row} />
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filteredRows.length === 0 && (
              <TableRow className="border-0">
                <TableCell
                  colSpan={columns.length + (hasActions ? 1 : 0)}
                  className="text-center py-12"
                >
                  {searchQuery || Object.values(dropdownValues).some(Boolean)
                    ? <span className="text-foreground/30 text-sm">No rows match your filter</span>
                    : widget.emptyState
                      ? <EmptyState emptyState={widget.emptyState} />
                      : <span className="text-foreground/30 text-sm">No data</span>}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {footer && (
          <p className="mt-2 text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

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
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium border-border/50"
        >
          {!Icon && <SlidersHorizontal size={13} />}
          {Icon && <Icon size={13} />}
          {value ? options.find((o) => o.value === value)?.label ?? label : label}
          <ChevronDown size={12} className="opacity-40" />
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
          className="p-1.5 rounded-md text-foreground/20 hover:text-foreground/60 hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
          disabled={executing}
        >
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map((action) => {
          const ActionIcon = action.icon ? getLucideIcon(action.icon) : null;
          return (
            <DropdownMenuItem
              key={action.id}
              onClick={() => void handleAction(action)}
              className={action.variant === 'destructive' ? 'text-destructive' : ''}
            >
              {ActionIcon && <ActionIcon size={14} className="mr-2" />}
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

  const variant = (action.variant ?? 'default') as
    | 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className="h-7 px-2 text-xs"
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
                size={12}
                className={seg.className ?? 'text-foreground/30'}
              />
            ) : null;
          }
          case 'dot': {
            if (!row[seg.key]) return null;
            const colorMap: Record<string, string> = {
              amber: 'bg-amber-400',
              emerald: 'bg-emerald-400',
              red: 'bg-red-400',
              blue: 'bg-blue-400',
              green: 'bg-green-400',
              yellow: 'bg-yellow-400',
              orange: 'bg-orange-400',
              purple: 'bg-purple-400',
              gray: 'bg-gray-400',
            };
            const bgClass = colorMap[seg.color ?? 'amber'] ?? 'bg-amber-400';
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
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
          {str}
        </code>
      );
    case 'mono':
      return <span className="font-mono text-sm">{str}</span>;
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
      {Icon && <Icon className="h-10 w-10 text-foreground/15" strokeWidth={1.5} />}
      <p className="text-sm font-medium text-foreground/40">{emptyState.title}</p>
      {emptyState.message && (
        <p className="text-xs text-foreground/25">{emptyState.message}</p>
      )}
    </div>
  );
}