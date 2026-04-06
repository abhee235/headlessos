// M9.5: Command Palette — Ctrl+K searchable launcher for apps, actions, settings
// @see docs/phases/phase-9.md

import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  Terminal,
  Box,
  Server,
  Activity,
  Settings,
  Shield,
  Search,
  Moon,
  Sun,
  Monitor,
  Keyboard,
  Image,
  Paintbrush,
  Bell,
  Info,
} from 'lucide-react';
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
import { APPS } from '../../lib/apps';

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

  const openTab = useAppStore(s => s.openTab);
  const activeServerId = useAppStore(s => s.activeServerId);
  const servers = useAppStore(s => s.servers);
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const toggleStartMenu = useDesktopStore(s => s.toggleStartMenu);

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

  const hasServer = !!activeServerId && servers.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 max-w-lg top-[20%] translate-y-0 rounded-xl border-border shadow-2xl">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput placeholder="Search apps, actions, settings…" />
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
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
