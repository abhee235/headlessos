// EX1.3 + EX1.12 + EX1.13 + EX3-D.1: DynamicAppWindow — wraps DynamicViewRenderer in AppWindow overlay
// Window chrome always includes a sidebar (lifted from LLM layout) for consistent navigation.
// EX3-D.1: Enhanced with loading → skeleton → progressive → complete states.
// EX8.6: Lumen toolbar pills, bg-paper JSON pane, token colours.
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

import { useState, useMemo } from 'react';
import type { DynamicView, DeepPartial } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { AppWindow } from '@/components/ui/app-window';
import { DynamicViewRenderer } from './DynamicViewRenderer';
import { DynamicViewProvider } from './DynamicViewContext';
import { SectionContent } from './SectionContent';
import { useDynamicSidebar } from './useDynamicSidebar';
import { openDynamicUIWindow } from './open-dynamic-ui-window';
import { SaveAsAppDialog } from './SaveAsAppDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Code2, RotateCcw, Pin, Save, Copy, Maximize2 } from 'lucide-react';
import { getLucideIcon } from './widgets/icon-helper';
import { PANE_CLASS } from './widgets/widget-card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** EX3-D.1: Generation phase for progressive states */
type GenerationPhase = 'loading' | 'skeleton' | 'progressive' | 'complete';

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
  /** Server ID for live data refresh (EX1.12) */
  serverId?: string | null;
  /** CLI tool name for Save As App pre-fill (EX5-C.2) */
  cliTool?: string;
  /** Tags for Save As App pre-fill (EX5-C.2) */
  tags?: string[];
}

export function DynamicAppWindow({
  view,
  open,
  onClose,
  onRegenerate,
  loading = false,
  serverId = null,
  cliTool,
  tags,
}: DynamicAppWindowProps) {
  const [showJson, setShowJson] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const { items, activeId, setActiveId, activeLayout } = useDynamicSidebar(view);

  const title = (view.title as string) ?? 'Dynamic View';
  const meta = view.meta as DynamicView['meta'] | undefined;

  // EX3-D.1: Determine the current generation phase
  const phase: GenerationPhase = useMemo(() => {
    if (!loading) return 'complete';
    // Check if view has any real content (sections with children)
    const sections = view.sections as Record<string, unknown> | undefined;
    if (!sections || Object.keys(sections).length === 0) return 'loading';
    // Check if any section has children with real data
    const hasContent = Object.values(sections).some((section) => {
      const s = section as Record<string, unknown> | undefined;
      if (!s) return false;
      if (Array.isArray(s.children) && s.children.length > 0) return true;
      if (Array.isArray(s.tabs) && s.tabs.length > 0) return true;
      return false;
    });
    return hasContent ? 'progressive' : 'skeleton';
  }, [loading, view.sections]);

  // EX3-D.2: Copy JSON to clipboard
  const handleCopyJson = () => {
    const json = JSON.stringify(view, null, 2);
    void navigator.clipboard.writeText(json).then(() => {
      toast.success('View JSON copied to clipboard');
    });
  };

  return (
    <AppWindow
      open={open}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={title}
      description={view.description as string | undefined}
      size="lg"
    >
      {/* Window-level sidebar — always present for consistent navigation */}
      {items.length > 0 && (
        <AppWindow.Sidebar>
          <AppWindow.SidebarGroup>
            {items.map((item) => (
              <AppWindow.SidebarItem
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon ? getLucideIcon(item.icon) : undefined}
                active={item.id === activeId}
                onClick={() => setActiveId(item.id)}
              />
            ))}
          </AppWindow.SidebarGroup>
        </AppWindow.Sidebar>
      )}

      <AppWindow.Toolbar>
        {/* EX3-D.2: Refresh / Regenerate */}
        {onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={loading}
          >
            <RotateCcw strokeWidth={1.75} />
            Regenerate
          </Button>
        )}
        {/* EX3-D.2: Copy JSON */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyJson}
          title="Copy view schema as JSON"
        >
          <Copy strokeWidth={1.75} />
          Copy JSON
        </Button>
        {/* Toggle JSON/Preview */}
        <Button
          variant={showJson ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setShowJson(!showJson)}
        >
          <Code2 strokeWidth={1.75} />
          {showJson ? 'Preview' : 'JSON'}
        </Button>
        {/* Pin as desktop window */}
        {serverId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const parsed = DynamicViewSchema.safeParse(view);
              if (parsed.success) {
                openDynamicUIWindow(serverId, parsed.data);
                onClose();
              }
            }}
            title="Open as desktop window"
          >
            <Pin strokeWidth={1.75} />
            Pin
          </Button>
        )}
        {/* EX5-C.2: Save as App button */}
        {!loading && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
            title="Save as reusable app"
            data-testid="save-as-app-button"
          >
            <Save strokeWidth={1.75} />
            Save as App
          </Button>
        )}
      </AppWindow.Toolbar>

      <AppWindow.Body>
        <DynamicViewProvider serverId={serverId}>
          {/* EX3-D.1: Phase-based rendering */}
          {phase === 'loading' ? (
            <SkeletonBody />
          ) : showJson ? (
            <pre className={cn(PANE_CLASS, 'max-h-full overflow-auto px-4 py-3 text-xs leading-relaxed')}>
              <code>{JSON.stringify(view, null, 2)}</code>
            </pre>
          ) : (
            <SectionContent layout={activeLayout} />
          )}
        </DynamicViewProvider>
      </AppWindow.Body>

      {/* Footer: generation stats */}
      <AppWindow.Footer>
        <div className="flex min-w-0 items-center gap-3 text-xs text-label-2">
          {loading && (
            <span className="animate-pulse font-medium text-accent-text">
              {phase === 'loading' ? 'Preparing…' : phase === 'skeleton' ? 'Building layout…' : 'Populating widgets…'}
            </span>
          )}
          {meta?.command && <span className="truncate">Command: {meta.command}</span>}
          {meta?.templateId && <span>Template: {meta.templateId}</span>}
          {meta?.generatedAt && (
            <span>Generated: {new Date(meta.generatedAt).toLocaleTimeString()}</span>
          )}
        </div>
      </AppWindow.Footer>

      {/* EX5-C.2: Save As App Dialog */}
      {(() => {
        const parsed = DynamicViewSchema.safeParse(view);
        if (!parsed.success) return null;
        const derivedCliTool = cliTool ?? meta?.tool ?? '';
        const derivedTags = tags ?? (derivedCliTool ? [derivedCliTool] : []);
        return (
          <SaveAsAppDialog
            open={showSaveDialog}
            onOpenChange={setShowSaveDialog}
            view={parsed.data}
            defaultName={(view.title as string) ?? ''}
            defaultDescription={(view.description as string) ?? ''}
            defaultCliTool={derivedCliTool}
            defaultIcon={(view.icon as string) ?? 'Package'}
            defaultTags={derivedTags}
            serverId={serverId}
          />
        );
      })()}
    </AppWindow>
  );
}

/** EX3-D.1: Skeleton placeholder during loading phase */
function SkeletonBody() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Stat card skeletons */}
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-[22px]" />
        <Skeleton className="h-24 rounded-[22px]" />
        <Skeleton className="h-24 rounded-[22px]" />
      </div>
      {/* Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-full rounded-[10px]" />
        <Skeleton className="h-[34px] w-[80%] rounded-[10px]" />
      </div>
    </div>
  );
}
