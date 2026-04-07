// EX1.5: Log Viewer Widget — scrollable log with level coloring
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { LogViewerWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type LogViewerWidgetData = z.infer<typeof LogViewerWidgetSchema>;

const LEVEL_STYLES: Record<string, string> = {
  error: 'text-destructive',
  warn: 'text-[oklch(0.75_0.15_75)]',     // amber/yellow
  info: 'text-[oklch(0.65_0.15_245)]',     // blue
  debug: 'text-muted-foreground',
};

const LEVEL_BADGE_STYLES: Record<string, string> = {
  error: 'bg-destructive/15 text-destructive',
  warn: 'bg-[oklch(0.75_0.15_75/0.15)] text-[oklch(0.75_0.15_75)]',
  info: 'bg-[oklch(0.65_0.15_245/0.15)] text-[oklch(0.65_0.15_245)]',
  debug: 'bg-muted text-muted-foreground',
};

export function LogViewerWidget({ widget }: { widget: LogViewerWidgetData }) {
  const { title, lines, maxHeight = '400px' } = widget;

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      )}
      <div className="rounded-md border border-border bg-card overflow-hidden">
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
    </div>
  );
}
