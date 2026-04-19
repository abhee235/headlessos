// EX1.5: Log Viewer Widget — scrollable log with level coloring
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { LogViewerWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type LogViewerWidgetData = z.infer<typeof LogViewerWidgetSchema>;

const LEVEL_STYLES: Record<string, string> = {
  error: 'text-destructive',
  warn: 'text-warning',
  info: 'text-primary',
  debug: 'text-muted-foreground',
};

const LEVEL_BADGE_STYLES: Record<string, string> = {
  error: 'bg-destructive/15 text-destructive',
  warn: 'bg-warning/15 text-warning',
  info: 'bg-primary/15 text-primary',
  debug: 'bg-muted text-muted-foreground',
};

export function LogViewerWidget({ widget }: { widget: LogViewerWidgetData }) {
  const { title, lines, maxHeight = '400px' } = widget;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
      <div className="rounded-md border border-border/60 bg-muted/30 overflow-hidden">
        <ScrollArea style={{ maxHeight }}>
          <div className="font-mono text-xs leading-relaxed p-2 space-y-0">
            {lines.length === 0 ? (
              <p className="text-muted-foreground italic px-1">No log entries</p>
            ) : (
              lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2 px-1 py-0.5 rounded-sm hover:bg-accent/30',
                    line.level && LEVEL_STYLES[line.level],
                  )}
                >
                  {/* Timestamp */}
                  {line.timestamp && (
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {line.timestamp}
                    </span>
                  )}

                  {/* Level badge */}
                  {line.level && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1 py-0 text-[10px] font-semibold uppercase w-12 text-center inline-flex items-center justify-center',
                        LEVEL_BADGE_STYLES[line.level] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {line.level}
                    </span>
                  )}

                  {/* Message */}
                  <span className="flex-1 whitespace-pre-wrap break-all">
                    {line.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      </CardContent>
    </Card>
  );
}
