// EX1.4: JSON Playground — split-pane dev tool for testing dynamic UI schemas
// EX8.6: Lumen panes — bg-paper editor, 11px pane headings, glass shows through
// @see docs/phases/phase-ex1.md

import { useState, useMemo, useCallback } from 'react';
import type { DynamicView, Layout } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { AppWindow } from '@/components/ui/app-window';
import { DynamicViewRenderer } from './DynamicViewRenderer';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, CheckCircle2, Code2, Download, Upload } from 'lucide-react';
import { EXAMPLE_VIEWS } from './playground-examples';
import { GROUP_LABEL_CLASS, PANE_CLASS } from './widgets/widget-card';
import { cn } from '@/lib/utils';

/** Small heading row above each pane */
const PANE_HEADING_CLASS = 'flex h-7 shrink-0 items-center px-1';

interface DynamicUIPlaygroundProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DynamicUIPlayground({ open, onOpenChange }: DynamicUIPlaygroundProps) {
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(EXAMPLE_VIEWS[0].data, null, 2)
  );
  const [selectedExample, setSelectedExample] = useState(EXAMPLE_VIEWS[0].id);

  // Parse and validate the JSON
  const parseResult = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const validated = DynamicViewSchema.parse(parsed);
      return { valid: true as const, view: validated, error: null, widgetCount: countWidgets(validated) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid JSON';
      // Try to extract a meaningful Zod error
      const cleanMessage = message.length > 200 ? message.slice(0, 200) + '…' : message;
      return { valid: false as const, view: null, error: cleanMessage, widgetCount: 0 };
    }
  }, [jsonText]);

  const handleExampleChange = useCallback((exampleId: string) => {
    const example = EXAMPLE_VIEWS.find((e) => e.id === exampleId);
    if (example) {
      setJsonText(JSON.stringify(example.data, null, 2));
      setSelectedExample(exampleId);
    }
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dynamic-view.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonText]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => setJsonText(reader.result as string);
        reader.readAsText(file);
      }
    };
    input.click();
  }, []);

  return (
    <AppWindow
      open={open}
      onOpenChange={onOpenChange}
      title="Dynamic UI Playground"
      icon={Code2}
      size="xl"
    >
      <AppWindow.Toolbar>
        <div className="flex items-center gap-2 flex-1">
          <Select value={selectedExample} onValueChange={handleExampleChange}>
            <SelectTrigger className="h-[30px] w-[200px] text-xs">
              <SelectValue placeholder="Load example…" />
            </SelectTrigger>
            <SelectContent>
              {EXAMPLE_VIEWS.map((ex) => (
                <SelectItem key={ex.id} value={ex.id} className="text-xs">
                  {ex.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleImport}>
            <Upload strokeWidth={1.75} />
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download strokeWidth={1.75} />
            Export
          </Button>
        </div>
      </AppWindow.Toolbar>

      <AppWindow.Body noPadding noScroll>
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          {/* Left pane: JSON editor */}
          <ResizablePanel defaultSize="45%" minSize="25%">
            <div className="flex h-full flex-col pb-3 pl-3 pr-2">
              <div className={cn(PANE_HEADING_CLASS, GROUP_LABEL_CLASS)}>
                JSON Schema
              </div>
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className={cn(PANE_CLASS, 'flex-1 resize-none px-3.5 py-3 text-xs leading-relaxed shadow-none focus-visible:border-accent-solid/50 focus-visible:ring-0 md:text-xs')}
                spellCheck={false}
                data-testid="json-editor"
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right pane: Live preview */}
          <ResizablePanel defaultSize="55%" minSize="25%">
            <div className="flex h-full min-w-0 flex-col">
              <div className={cn(PANE_HEADING_CLASS, GROUP_LABEL_CLASS, 'pl-4')}>
                Live Preview
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-4 pb-4">
                  {parseResult.valid && parseResult.view ? (
                    <DynamicViewRenderer view={parseResult.view} />
                  ) : (
                    <div className="flex items-start gap-3 rounded-[20px] border border-danger/30 bg-danger/10 px-4 py-3.5 text-xs text-danger">
                      <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                      <div className="min-w-0">
                        <p className="mb-1 text-[13px] font-semibold">Validation Error</p>
                        <p className="break-all font-mono text-[11px] text-label-2">{parseResult.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </AppWindow.Body>

      <AppWindow.Footer>
        <div className="flex items-center gap-3">
          {parseResult.valid ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span>Valid</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              <span>Invalid</span>
            </>
          )}
          <Badge variant="secondary">
            Widgets: {parseResult.widgetCount}
          </Badge>
        </div>
      </AppWindow.Footer>
    </AppWindow>
  );
}

/** Count total widgets across all sections recursively */
function countWidgets(view: DynamicView): number {
  return Object.values(view.sections).reduce<number>(
    (sum, layout) => sum + countLayoutChildren(layout),
    0,
  );
}

function countLayoutChildren(layout: Layout): number {
  switch (layout.layout) {
    case 'stack':
    case 'grid':
      return (layout.children as unknown[]).reduce<number>((sum, child) => {
        if (child && typeof child === 'object' && 'layout' in child && !('type' in child)) {
          return sum + countLayoutChildren(child as Layout);
        }
        return sum + 1;
      }, 0);
    case 'tabs':
      return layout.tabs.reduce<number>((sum, tab) =>
        sum + (tab.children as unknown[]).reduce<number>((tSum, child) => {
          if (child && typeof child === 'object' && 'layout' in child && !('type' in child)) {
            return tSum + countLayoutChildren(child as Layout);
          }
          return tSum + 1;
        }, 0),
      0);
    default:
      return 0;
  }
}
