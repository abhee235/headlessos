// EX1.2: CodeBlock Widget — pre-formatted code with syntax highlighting
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { CodeBlockWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type CodeBlockWidget = z.infer<typeof CodeBlockWidgetSchema>;

export function CodeBlockWidget({ widget }: { widget: CodeBlockWidget }) {
  const { title, code, language, maxHeight } = widget;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {title}
            {language && language !== 'text' && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {language}
              </span>
            )}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <pre
          className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <code>{code}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
