// EX5-C.2: Save As App Dialog — lets users save a generated DynamicView as a reusable app
// @see docs/phases/phase-ex5.md

import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getLucideIcon } from './widgets/icon-helper';
import { createSavedApp, type CreateAppInput } from '@/lib/api';
import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import { toast } from 'sonner';

// ── Icon grid for the picker ────────────────────────────

const ICON_NAMES = [
  'Activity', 'Archive', 'BarChart3', 'Bell', 'Blocks', 'Box',
  'Cable', 'Calendar', 'Cloud', 'Code', 'Container', 'Cpu',
  'Database', 'Download', 'Eye', 'File', 'FileText', 'Filter',
  'Folder', 'Globe', 'HardDrive', 'Heart', 'History', 'Home',
  'Image', 'Info', 'Key', 'Layers', 'Link', 'List',
  'Lock', 'Mail', 'Map', 'Monitor', 'Network', 'Package',
  'Play', 'Plug', 'Power', 'Radio', 'Route', 'Save',
  'ScrollText', 'Search', 'Server', 'Settings', 'Shield', 'Signal',
  'Star', 'Target', 'Terminal', 'Upload', 'User', 'Users',
  'Wifi', 'Zap',
];

// ── Props ───────────────────────────────────────────────

export interface SaveAsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The generated DynamicView to save */
  view: DynamicView;
  /** Pre-fill values from agent generation */
  defaultName?: string;
  defaultDescription?: string;
  defaultCliTool?: string;
  defaultIcon?: string;
  defaultTags?: string[];
  /** Server ID for optional association */
  serverId?: string | null;
  /** Called after successful save */
  onSaved?: () => void;
}

export function SaveAsAppDialog({
  open,
  onOpenChange,
  view,
  defaultName = '',
  defaultDescription = '',
  defaultCliTool = '',
  defaultIcon = 'Package',
  defaultTags = [],
  serverId,
  onSaved,
}: SaveAsAppDialogProps) {
  const [name, setName] = useState(defaultName || view.title || '');
  const [description, setDescription] = useState(
    defaultDescription || view.description || '',
  );
  const [cliTool, setCliTool] = useState(defaultCliTool);
  const [icon, setIcon] = useState(defaultIcon);
  const [tagsInput, setTagsInput] = useState(defaultTags.join(', '));
  const [saving, setSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const parsedTags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [tagsInput],
  );

  const isValid = name.trim().length > 0 && icon.trim().length > 0 && cliTool.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const input: CreateAppInput = {
        name: name.trim(),
        icon: icon.trim(),
        cliTool: cliTool.trim(),
        description: description.trim(),
        tags: parsedTags,
        view: view as unknown as Record<string, unknown>,
        serverId: serverId ?? undefined,
      };
      await createSavedApp(input);
      toast.success('App saved! You can find it in the Start Menu.');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save app';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [isValid, saving, name, icon, cliTool, description, parsedTags, view, serverId, onOpenChange, onSaved]);

  const SelectedIcon = getLucideIcon(icon);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="save-as-app-dialog">
        <DialogHeader>
          <DialogTitle>Save as App</DialogTitle>
          <DialogDescription>
            Save this generated view as a reusable app for quick access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="app-name">Name *</Label>
            <Input
              id="app-name"
              data-testid="app-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Docker Dashboard"
              maxLength={100}
            />
          </div>

          {/* Icon picker */}
          <div className="space-y-1.5">
            <Label>Icon *</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                onClick={() => setShowIconPicker(!showIconPicker)}
                data-testid="icon-picker-trigger"
              >
                {SelectedIcon && <SelectedIcon className="w-4 h-4" />}
                <span className="text-xs">{icon}</span>
              </Button>
            </div>
            {showIconPicker && (
              <ScrollArea className="h-40 border rounded-md p-2" data-testid="icon-picker-grid">
                <div className="grid grid-cols-8 gap-1">
                  {ICON_NAMES.map((iconName) => {
                    const IconComp = getLucideIcon(iconName);
                    if (!IconComp) return null;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        className={cn(
                          'flex items-center justify-center w-8 h-8 rounded hover:bg-accent transition-colors',
                          icon === iconName && 'bg-primary/10 ring-1 ring-primary',
                        )}
                        onClick={() => {
                          setIcon(iconName);
                          setShowIconPicker(false);
                        }}
                        title={iconName}
                        data-testid={`icon-option-${iconName}`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* CLI Tool */}
          <div className="space-y-1.5">
            <Label htmlFor="app-cli-tool">CLI Tool *</Label>
            <Input
              id="app-cli-tool"
              data-testid="app-cli-tool-input"
              value={cliTool}
              onChange={(e) => setCliTool(e.target.value)}
              placeholder="docker, nginx, systemctl..."
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="app-description">Description</Label>
            <Textarea
              id="app-description"
              data-testid="app-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this app show?"
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="app-tags">Tags</Label>
            <Input
              id="app-tags"
              data-testid="app-tags-input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="docker, monitoring, dashboard"
            />
            <p className="text-[10px] text-muted-foreground">
              Comma-separated tags for search and discovery
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || saving}
            data-testid="save-app-button"
          >
            {saving ? 'Saving…' : 'Save App'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
