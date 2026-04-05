// M6.1: Desktop — high-quality desktop with rich SVG icons and wallpaper
// @see docs/phases/phase-6.md

import { useCallback, useState, useRef, useEffect } from 'react';
import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import {
  DashboardIcon,
  FileExplorerIcon,
  TerminalIcon,
  ThisPCIcon,
} from '../ui/FileIcon';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { AppWindow } from '@/components/ui/app-window';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder,
  File,
  RefreshCw,
  LayoutGrid,
  List,
  SortAsc,
  Info,
  Paintbrush,
  Activity,
  Box,
  Server,
} from 'lucide-react';
import { Wallpaper } from './Wallpaper';
import { createDirectory, writeFile } from '../../lib/api';

interface DesktopIcon {
  id: string;
  appId: string;
  label: string;
  IconComponent: React.FC<{ size?: number }>;
}

const DESKTOP_ICONS: DesktopIcon[] = [
  {
    id: 'desktop-dashboard',
    appId: 'dashboard',
    label: 'Dashboard',
    IconComponent: DashboardIcon,
  },
  {
    id: 'desktop-files',
    appId: 'files',
    label: 'File Explorer',
    IconComponent: FileExplorerIcon,
  },
  {
    id: 'desktop-terminal',
    appId: 'terminal',
    label: 'Terminal',
    IconComponent: TerminalIcon,
  },
];

export function Desktop() {
  const openWindow = useDesktopStore(s => s.openWindow);
  const closeStartMenu = useDesktopStore(s => s.closeStartMenu);
  const activeServerId = useAppStore(s => s.activeServerId);
  const servers = useAppStore(s => s.servers);
  const activeServer = servers.find(s => s.id === activeServerId);
  const isConnected = activeServer?.state?.status === 'connected';

  // New Folder / New File dialog state
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Focus textbox when the dialog opens
  useEffect(() => {
    if (creatingType) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [creatingType]);

  const handleCreate = async () => {
    if (!createName.trim() || !activeServerId) return;
    setCreateBusy(true);
    setCreateError(null);

    const fullPath = `/${createName.trim()}`;

    try {
      if (creatingType === 'folder') {
        await createDirectory(activeServerId, fullPath);
      } else {
        await writeFile(activeServerId, fullPath, '');
      }
      setCreatingType(null);
      setCreateName('');
      // Open File Explorer so user can see the new item
      openWindow('files', activeServerId, 'File Explorer', 'files');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreateBusy(false);
    }
  };

  const closeCreateDialog = () => {
    setCreatingType(null);
    setCreateName('');
    setCreateError(null);
  };

  const handleDoubleClick = (icon: DesktopIcon) => {
    if (!activeServerId || !isConnected) return;
    openWindow(icon.appId, activeServerId, icon.label, icon.appId);
  };

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="absolute inset-0 bottom-12 overflow-hidden select-none"
          onClick={() => closeStartMenu()}
        >
      {/* Wallpaper with branded watermark */}
      <Wallpaper />

      {/* Desktop Icons */}
      <div className="relative z-10 flex flex-col flex-wrap gap-2 p-5 h-full content-start">
        {DESKTOP_ICONS.map(icon => (
          <button
            key={icon.id}
            className={`
              flex flex-col items-center justify-center gap-1.5
              w-[80px] h-[88px] rounded-2xl
              transition-all duration-200 ease-out
              hover:bg-white/[0.10] active:bg-white/[0.15]
              hover:shadow-lg hover:shadow-black/[0.05]
              ${!isConnected ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
              group
            `}
            onDoubleClick={() => handleDoubleClick(icon)}
            disabled={!isConnected}
            title={isConnected ? icon.label : 'Connect to a server first'}
          >
            <div className="transition-transform duration-200 ease-out group-hover:scale-110 group-hover:-translate-y-1 group-active:scale-95 drop-shadow-lg">
              <icon.IconComponent size={44} />
            </div>
            <span className="text-[11px] text-white/90 font-medium leading-tight text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] line-clamp-2 px-1">
              {icon.label}
            </span>
          </button>
        ))}

        {/* "This PC" when no server connected */}
        {!isConnected && (
          <button
            className="flex flex-col items-center justify-center gap-1.5 w-[80px] h-[88px] rounded-2xl hover:bg-white/[0.10] cursor-pointer group transition-all duration-200"
            onDoubleClick={() => {/* future: open server manager */}}
            title="No server connected"
          >
            <div className="transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-1 drop-shadow-lg opacity-50">
              <ThisPCIcon size={44} />
            </div>
            <span className="text-[11px] text-white/50 font-medium leading-tight text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              This PC
            </span>
          </button>
        )}
      </div>

      {/* Connect prompt when no server */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-end justify-center pb-24 pointer-events-none">
          <div className="text-center glass rounded-2xl px-8 py-5 border border-white/[0.12]">
            <p className="text-white/50 text-sm font-medium">Connect a server to get started</p>
            <p className="text-white/25 text-xs mt-1.5">Use the Start menu to manage servers</p>
          </div>
        </div>
      )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <LayoutGrid className="w-4 h-4 mr-2 opacity-60" />
            View
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Large Icons</ContextMenuItem>
            <ContextMenuItem>Medium Icons</ContextMenuItem>
            <ContextMenuItem>Small Icons</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <SortAsc className="w-4 h-4 mr-2 opacity-60" />
            Sort by
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Name</ContextMenuItem>
            <ContextMenuItem>Type</ContextMenuItem>
            <ContextMenuItem>Date Modified</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => { setCreatingType('folder'); setCreateName(''); setCreateError(null); }}
        >
          <Folder className="w-4 h-4 mr-2 opacity-60" />
          New Folder
          <ContextMenuShortcut>⇧⌘N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => { setCreatingType('file'); setCreateName(''); setCreateError(null); }}
        >
          <File className="w-4 h-4 mr-2 opacity-60" />
          New File
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem>
          <RefreshCw className="w-4 h-4 mr-2 opacity-60" />
          Refresh
          <ContextMenuShortcut>F5</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => activeServerId && openWindow('taskmanager', activeServerId, 'Task Manager', 'taskmanager')}
        >
          <Activity className="w-4 h-4 mr-2 opacity-60" />
          Task Manager
          <ContextMenuShortcut>⌃⇧Esc</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => activeServerId && openWindow('docker', activeServerId, 'Docker', 'docker')}
        >
          <Box className="w-4 h-4 mr-2 opacity-60" />
          Docker
        </ContextMenuItem>

        <ContextMenuItem
          disabled={!isConnected}
          onClick={() => activeServerId && openWindow('services', activeServerId, 'Services', 'services')}
        >
          <Server className="w-4 h-4 mr-2 opacity-60" />
          Services
        </ContextMenuItem>

        <ContextMenuItem onClick={() => openWindow('settings', '', 'Settings', 'settings')}>
          <Paintbrush className="w-4 h-4 mr-2 opacity-60" />
          Personalize
        </ContextMenuItem>

        <ContextMenuItem>
          <Info className="w-4 h-4 mr-2 opacity-60" />
          About HeadlessOS
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    {/* New Folder / New File dialog */}
    <AppWindow
      open={creatingType !== null}
      onOpenChange={(open) => { if (!open) closeCreateDialog(); }}
      title={creatingType === 'folder' ? 'New Folder' : 'New File'}
      icon={creatingType === 'folder' ? Folder : File}
      size="xs"
      width={400}
      height={220}
    >
      <AppWindow.Body noPadding>
        <div className="px-4 pt-4 pb-2">
          <Input
            ref={createInputRef}
            placeholder={creatingType === 'folder' ? 'folder-name' : 'filename.txt'}
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') closeCreateDialog();
            }}
            disabled={createBusy}
          />
          {createError && (
            <p className="text-sm text-destructive mt-2">{createError}</p>
          )}
        </div>
      </AppWindow.Body>
      <AppWindow.Footer className="justify-end gap-2 py-3 px-4">
        <Button variant="outline" size="sm" onClick={closeCreateDialog} disabled={createBusy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleCreate} disabled={!createName.trim() || createBusy}>
          {createBusy ? 'Creating…' : 'Create'}
        </Button>
      </AppWindow.Footer>
    </AppWindow>
    </>
  );
}
