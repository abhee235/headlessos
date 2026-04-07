// EX1.2 + EX1.14: Table Widget — renders tabular data + action buttons
// @see docs/phases/phase-ex1.md

import { useState, useCallback } from 'react';
import type { z } from 'zod';
import type { TableWidgetSchema, WidgetActionSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDynamicViewContext } from '../DynamicViewContext';
import { executeWidgetAction } from '@/lib/api';
import { toast } from 'sonner';

type TableWidget = z.infer<typeof TableWidgetSchema>;
type WidgetAction = z.infer<typeof WidgetActionSchema>;

export function TableWidget({ widget }: { widget: TableWidget }) {
  const { title, columns, rows, footer, actions } = widget;
  const hasActions = actions && actions.length > 0;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="w-auto text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {renderCellValue(row[col.key], col)}
                  </TableCell>
                ))}
                {hasActions && (
                  <TableCell className="text-right">
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {footer && (
          <p className="mt-2 text-xs text-muted-foreground">{footer}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Action Button with confirmation ──────────────────────────────

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
      // Build params from row data
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

// ── Cell rendering ───────────────────────────────────────────────

function renderCellValue(
  value: unknown,
  col: TableWidget['columns'][number],
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
