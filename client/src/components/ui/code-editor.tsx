// EX8.8: CodeEditor — Monaco with syntax colouring, Lumen light/dark themes,
// language from the file name, Ctrl/⌘+S to save. Monaco (several MB) loads in
// its own chunk the first time an editor opens; the branded spinner shows meanwhile.
// @see docs/phases/phase-ex8.md

import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { LoadingView } from '@/components/ui/loading-view';

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** File path or name; picks the language and labels the model */
  path: string;
  /** Ctrl/⌘+S inside the editor */
  onSave?: () => void;
  readOnly?: boolean;
  className?: string;
}

const CodeEditorImpl = lazy(() => import('./code-editor-impl'));

/** The editor fills its parent; wrap it in a sized container. */
export function CodeEditor({ className, ...props }: CodeEditorProps) {
  return (
    <div
      className={cn(
        'relative min-h-0 overflow-hidden rounded-[14px] border border-edge bg-paper transition-[border-color,box-shadow] duration-150 focus-within:border-accent-solid/60 focus-within:ring-[3px] focus-within:ring-accent-soft',
        className,
      )}
    >
      <Suspense fallback={<LoadingView label="Opening editor…" />}>
        <CodeEditorImpl {...props} className="absolute inset-0" />
      </Suspense>
    </div>
  );
}
CodeEditor.displayName = 'CodeEditor';
