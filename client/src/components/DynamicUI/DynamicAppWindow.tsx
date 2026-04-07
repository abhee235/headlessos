// EX1.3: DynamicAppWindow — wraps DynamicViewRenderer in AppWindow overlay
// @see docs/phases/phase-ex1.md

import { useState } from 'react';
import type { DynamicView, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { AppWindow } from '@/components/ui/app-window';
import { DynamicViewRenderer } from './DynamicViewRenderer';
import { Button } from '@/components/ui/button';
import { Code2, RotateCcw } from 'lucide-react';

interface DynamicAppWindowProps {
  /** The dynamic view data to render */
  view: DeepPartial<DynamicView>;
  /** Whether the window is open */
  open: boolean;
  /** Called when the window should close */
  onClose: () => void;
  /** Called to regenerate the view (re-run LLM) */
  onRegenerate?: () => void;
  /** Whether the view is currently being generated */
  loading?: boolean;
}

export function DynamicAppWindow({
  view,
  open,
  onClose,
  onRegenerate,
  loading = false,
}: DynamicAppWindowProps) {
  const [showJson, setShowJson] = useState(false);

  const title = (view.title as string) ?? 'Dynamic View';
  const meta = view.meta as DynamicView['meta'] | undefined;

  return (
    <AppWindow
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={title}
      description={view.description as string | undefined}
      size="lg"
    >
      <AppWindow.Toolbar>
        {onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={loading}
            className="h-7 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Regenerate
          </Button>
        )}
        <Button
          variant={showJson ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowJson(!showJson)}
          className="h-7 text-xs"
        >
          <Code2 className="w-3.5 h-3.5 mr-1" />
          {showJson ? 'Preview' : 'JSON'}
        </Button>
      </AppWindow.Toolbar>

      <AppWindow.Body>
        {showJson ? (
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs font-mono leading-relaxed max-h-full">
            <code>{JSON.stringify(view, null, 2)}</code>
          </pre>
        ) : (
          <DynamicViewRenderer view={view} />
        )}
      </AppWindow.Body>

      {meta && (
        <AppWindow.Footer>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {meta.command && <span>Command: {meta.command}</span>}
            {meta.templateId && <span>Template: {meta.templateId}</span>}
            {meta.generatedAt && (
              <span>Generated: {new Date(meta.generatedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </AppWindow.Footer>
      )}
    </AppWindow>
  );
}
