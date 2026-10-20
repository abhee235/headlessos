// EX1.2: CodeBlock Widget — pre-formatted code with syntax highlighting
// EX8.6: Lumen card + recessed bg-paper mono pane
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { CodeBlockWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { cn } from '@/lib/utils';
import { PANE_CLASS, WidgetCard } from './widget-card';

type CodeBlockWidget = z.infer<typeof CodeBlockWidgetSchema>;

export function CodeBlockWidget({ widget }: { widget: CodeBlockWidget }) {
  const { title, code, language, maxHeight } = widget;

  return (
    <WidgetCard
      title={title}
      meta={title && language && language !== 'text' ? <span className="font-mono">{language}</span> : undefined}
    >
      <pre
        className={cn(PANE_CLASS, 'overflow-auto px-4 py-3 text-xs leading-relaxed')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </WidgetCard>
  );
}
