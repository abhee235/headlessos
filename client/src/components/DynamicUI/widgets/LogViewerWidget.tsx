// EX1.5: Log Viewer Widget — scrollable log with level coloring
// EX8.6: recessed bg-paper mono pane, muted 6px level chips in semantic tints
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { LogViewerWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PANE_CLASS, WidgetCard } from './widget-card';

type LogViewerWidgetData = z.infer<typeof LogViewerWidgetSchema>;

const LEVEL_STYLES: Record<string, string> = {
  error: 'text-danger',
  warn: 'text-warning',
  info: 'text-foreground',
  debug: 'text-label-3',
};

const LEVEL_BADGE_STYLES: Record<string, string> = {
  error: 'border-danger/30 bg-danger/14 text-danger',
  warn: 'border-warning/30 bg-warning/14 text-warning',
  info: 'border-accent-solid/30 bg-accent-solid/14 text-accent-text',
  debug: 'border-edge bg-fill text-label-3',
};

export function LogViewerWidget({ widget }: { widget: LogViewerWidgetData }) {
  const { title, lines, maxHeight = '400px' } = widget;

  return (
    <WidgetCard title={title}>
      <div className={cn(PANE_CLASS, 'overflow-hidden')}>
        <ScrollArea style={{ maxHeight }}>
          <div className="space-y-0 p-1.5 text-xs leading-relaxed">
            {lines.length === 0 ? (
              <p className="px-1.5 py-1 italic text-label-3">No log entries</p>
            ) : (
              lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex gap-2.5 rounded-[8px] px-1.5 py-1 transition-colors duration-150 hover:bg-fill',
                    line.level && LEVEL_STYLES[line.level],
                  )}
                >
                  {/* Timestamp */}
                  {line.timestamp && (
                    <span className="shrink-0 text-label-3 tabular-nums">
                      {line.timestamp}
                    </span>
                  )}

                  {/* Level badge */}
                  {line.level && (
                    <span
                      className={cn(
                        'inline-flex h-[18px] w-12 shrink-0 items-center justify-center rounded-[6px] border text-[10px] font-semibold uppercase',
                        LEVEL_BADGE_STYLES[line.level] ?? 'border-edge bg-fill text-label-3',
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
    </WidgetCard>
  );
}
