// M9.5 + EX1.9: Command Palette — Ctrl+K searchable launcher with Dynamic UI generation
// @see docs/phases/phase-9.md, docs/phases/phase-ex1.md

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, FolderOpen, Terminal, Box, Server, Activity, Settings, Shield, Search, Moon, Sun, Monitor, Keyboard, Image, Paintbrush, Bell, Info, Wand2, Sparkles } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { useThemeStore } from '../../store/theme-store';
import { useSavedAppStore } from '../../store/saved-app-store';
import { APPS } from '../../lib/apps';
import {
  fetchDynamicUITemplates,
  type TemplateSummary,
} from '../../lib/api';
import { DynamicAppWindow } from '../DynamicUI';
import { getLucideIcon } from '../DynamicUI/widgets/icon-helper';

// ── Icon Map ────────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={16} />,
  FolderOpen: <FolderOpen size={16} />,
  Terminal: <Terminal size={16} />,
  Box: <Box size={16} />,
  Server: <Server size={16} />,
  Activity: <Activity size={16} />,
  Settings: <Settings size={16} />,
  Shield: <Shield size={16} />,
};

// ── Command Palette Component ───────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [dynamicUIView, setDynamicUIView] = useState<Record<string, unknown> | null>(null);
  const [dynamicUIOpen, setDynamicUIOpen] = useState(false);
  const [dynamicUILoading, setDynamicUILoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const openTab = useAppStore(s => s.openTab);
  const activeServerId = useAppStore(s => s.activeServerId);
  const servers = useAppStore(s => s.servers);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const toggleStartMenu = useDesktopStore(s => s.toggleStartMenu);

  // EX5-C.3: Saved apps
  const savedApps = useSavedAppStore(s => s.apps);
  const fetchSavedApps = useSavedAppStore(s => s.fetchApps);
  const savedAppsFetched = useSavedAppStore(s => s.fetched);
  const openSavedApp = useSavedAppStore(s => s.openApp);

  // Fetch templates when palette opens
  useEffect(() => {
    if (open && templates.length === 0) {
      fetchDynamicUITemplates().then(setTemplates).catch(() => {
        // Silently fail — templates are optional
      });
    }
    // EX5-C.3: Fetch saved apps when palette opens
    if (open && !savedAppsFetched) {
      void fetchSavedApps();
    }
  }, [open, templates.length, savedAppsFetched, fetchSavedApps]);

  // Clear search on close
  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  // Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const launchApp = useCallback((appId: string) => {
    if (!activeServerId) return;
    const app = APPS.find(a => a.id === appId);
    if (app) {
      openTab(app, activeServerId);
    }
    setOpen(false);
  }, [activeServerId, openTab]);

  const runAction = useCallback((action: () => void) => {
    action();
    setOpen(false);
  }, []);

  const handleDynamicUISelect = useCallback((template: TemplateSummary) => {
    if (!activeServerId) return;
    setOpen(false);
    setDynamicUILoading(true);
    setDynamicUIOpen(true);
    // Use the template's first match pattern as a representative command
    const tool = template.tags[0] ?? template.id;
    const command = template.name;
    // Pre-load the template as a placeholder view
    setDynamicUIView({
      title: template.name,
      description: `Generating dynamic UI for ${template.name}...`,
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [],
      },
    });
    // The actual generation will happen when the server SSH runs the command
    // For now, we show the template as a preview and mark loading done
    // In production, this would call generateDynamicUI() after running the command on the server
    setDynamicUILoading(false);
  }, [activeServerId]);

  const handleGenerateFreeform = useCallback((query: string) => {
    if (!activeServerId || !query.trim()) return;
    setOpen(false);
    setDynamicUILoading(true);
    setDynamicUIOpen(true);
    setDynamicUIView({
      title: `Dynamic UI: ${query}`,
      description: `Generating visualization for "${query}"...`,
      root: {
        layout: 'stack',
        gap: 'md',
        widgets: [],
      },
    });
    setDynamicUILoading(false);
  }, [activeServerId]);

  // EX5-C.3: Open a saved app from Command Palette
  const handleOpenSavedApp = useCallback((app: (typeof savedApps)[number]) => {
    if (!activeServerId) return;
    openSavedApp(app, activeServerId);
    setOpen(false);
  }, [activeServerId, openSavedApp]);

  // Filter templates based on search query (fuzzy match against name, description, tags)
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates.slice(0, 5); // Show top 5 by default
    const lower = searchQuery.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags.some(tag => tag.toLowerCase().includes(lower)),
    );
  }, [templates, searchQuery]);

  const hasServer = !!activeServerId && servers.length > 0;

  return (
  <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-lg top-[20%] translate-y-0 rounded-xl border-border shadow-2xl">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput
            placeholder="Search apps, actions, dynamic UI…"
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No results found.</CommandEmpty>

            {/* ── Apps ── */}
            {hasServer && (
              <CommandGroup heading="Apps">
                {APPS.map(app => (
                  <CommandItem
                    key={app.id}
                    value={`app-${app.id}-${app.name}`}
                    onSelect={() => launchApp(app.id)}
                  >
                    {ICON_MAP[app.icon] ?? <Search size={16} />}
                    <span>{app.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{app.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* EX5-C.3: Saved user apps */}
            {hasServer && savedApps.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="My Apps">
                  {savedApps.map(app => {
                    const IconComp = getLucideIcon(app.icon);
                    return (
                      <CommandItem
                        key={`saved-${app.id}`}
                        value={`saved-app-${app.id}-${app.name}-${app.cliTool}-${app.tags.join('-')}`}
                        onSelect={() => handleOpenSavedApp(app)}
                      >
                        {IconComp ? <IconComp size={16} /> : <Sparkles size={16} />}
                        <span>{app.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{app.cliTool}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            <CommandSeparator />

            {/* ── Quick Actions ── */}
            <CommandGroup heading="Actions">
              <CommandItem
                value="action-toggle-start-menu"
                onSelect={() => runAction(toggleStartMenu)}
              >
                <Monitor size={16} />
                <span>Toggle Start Menu</span>
                <CommandShortcut>Ctrl+Space</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="action-theme-light"
                onSelect={() => runAction(() => setTheme('light'))}
              >
                <Sun size={16} />
                <span>Switch to Light Theme</span>
                {theme === 'light' && <CommandShortcut>Active</CommandShortcut>}
              </CommandItem>

              <CommandItem
                value="action-theme-dark"
                onSelect={() => runAction(() => setTheme('dark'))}
              >
                <Moon size={16} />
                <span>Switch to Dark Theme</span>
                {theme === 'dark' && <CommandShortcut>Active</CommandShortcut>}
              </CommandItem>

              <CommandItem
                value="action-theme-system"
                onSelect={() => runAction(() => setTheme('system'))}
              >
                <Monitor size={16} />
                <span>Switch to System Theme</span>
                {theme === 'system' && <CommandShortcut>Active</CommandShortcut>}
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            {/* ── Settings Pages ── */}
            {hasServer && (
              <CommandGroup heading="Settings">
                {[
                  { label: 'General Settings', icon: <Settings size={16} />, page: 'general' },
                  { label: 'Appearance', icon: <Paintbrush size={16} />, page: 'appearance' },
                  { label: 'Wallpaper', icon: <Image size={16} />, page: 'wallpaper' },
                  { label: 'Terminal Settings', icon: <Terminal size={16} />, page: 'terminal' },
                  { label: 'Keyboard Shortcuts', icon: <Keyboard size={16} />, page: 'keyboard' },
                  { label: 'Notifications', icon: <Bell size={16} />, page: 'notifications' },
                  { label: 'About', icon: <Info size={16} />, page: 'about' },
                ].map(item => (
                  <CommandItem
                    key={item.page}
                    value={`settings-${item.page}-${item.label}`}
                    onSelect={() => {
                      launchApp('settings');
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* ── Dynamic UI ── */}
            {hasServer && filteredTemplates.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Dynamic UI">
                  {filteredTemplates.map(template => (
                    <CommandItem
                      key={template.id}
                      value={`dynamic-ui-${template.id}-${template.name}-${template.tags.join('-')}`}
                      onSelect={() => handleDynamicUISelect(template)}
                    >
                      <Wand2 size={16} />
                      <span>{template.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {template.tags.slice(0, 2).join(', ')}
                      </span>
                    </CommandItem>
                  ))}
                  {searchQuery.trim() && (
                    <CommandItem
                      value={`dynamic-ui-generate-${searchQuery}`}
                      onSelect={() => handleGenerateFreeform(searchQuery)}
                    >
                      <Sparkles size={16} />
                      <span>Generate UI for &quot;{searchQuery}&quot;</span>
                      <span className="ml-auto text-xs text-muted-foreground">AI</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}

            {/* Free-form generate when no templates but server connected */}
            {hasServer && filteredTemplates.length === 0 && searchQuery.trim() && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Dynamic UI">
                  <CommandItem
                    value={`dynamic-ui-generate-freeform-${searchQuery}`}
                    onSelect={() => handleGenerateFreeform(searchQuery)}
                  >
                    <Sparkles size={16} />
                    <span>Generate Dynamic UI for &quot;{searchQuery}&quot;</span>
                    <span className="ml-auto text-xs text-muted-foreground">AI</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>

    {/* Dynamic UI App Window */}
    {dynamicUIView && (
      <DynamicAppWindow
        view={dynamicUIView as Record<string, unknown>}
        open={dynamicUIOpen}
        onClose={() => {
          setDynamicUIOpen(false);
          setDynamicUIView(null);
        }}
        loading={dynamicUILoading}
      />
    )}
  </>
  );
}
