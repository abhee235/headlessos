// EX1.2: Table Widget — renders tabular data using shadcn Table
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { TableWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type TableWidget = z.infer<typeof TableWidgetSchema>;

export function TableWidget({ widget }: { widget: TableWidget }) {
  const { title, columns, rows, footer } = widget;

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
