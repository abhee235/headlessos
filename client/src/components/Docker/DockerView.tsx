// M3.1-M3.3: Docker Manager — container/image management with log viewer
// EX8.6: LumenOS v3 look — PaneSidebar, Lumen header, card tables, badges
// @see docs/phases/phase-3.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  Box,
  Image,
  Play,
  Square,
  RotateCcw,
  Pause,
  PlayCircle,
  Trash2,
  RefreshCw,
  AlertCircle,
  FileText,
  Info,
  Search,
  X,
  Download,
  FolderOpen,
  SquareTerminal,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useDesktopStore } from '../../store/window-store';
import { LoadingView } from '@/components/ui/loading-view';
import type {
  DockerContainerData,
  DockerImageData,
  DockerContainersResponse,
  DockerImagesResponse,
} from '../../lib/api';
import {
  fetchDockerContainers,
  fetchDockerImages,
  dockerContainerAction,
  removeDockerContainer,
  removeDockerImage,
  fetchDockerLogs,
  runDockerImage,
} from '../../lib/api';
import type { RunDockerImageOptions } from '../../lib/api';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PaneSidebar, PaneSidebarItem } from '@/components/ui/pane-sidebar';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DisconnectedState } from '@/components/ui/disconnected-state';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DockerInstallTerminal } from './DockerInstallTerminal';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = 'containers' | 'images';

interface SidebarEntry {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: SidebarEntry[] = [
  { id: 'containers', label: 'Containers', icon: Box },
  { id: 'images', label: 'Images', icon: Image },
];

// ─── State badge helper ──────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'secondary' | 'destructive' | 'outline';

function stateVariant(state: string): BadgeVariant {
  if (state === 'running') return 'success';
  if (state === 'paused' || state === 'restarting') return 'warning';
  if (state === 'dead') return 'destructive';
  if (state === 'exited') return 'secondary';
  return 'outline';
}

function StateBadge({ state }: { state: string }) {
  return (
    <Badge variant={stateVariant(state)} className="capitalize">
      {state}
    </Badge>
  );
}

// ─── Shared Lumen pieces (header, filter field, table, row menu) ─────────────

/** Secondary metadata: images, ids, ports */
const MONO_META = 'font-mono text-[12px] text-label-2';
/** Column templates. Header and rows share them; the header sits outside the scroller. */
const CONTAINER_COLS =
  'grid grid-cols-[minmax(150px,1.1fr)_minmax(140px,1fr)_104px_minmax(130px,1fr)_minmax(150px,1.2fr)_36px] items-center gap-x-3 px-4';
const IMAGE_COLS =
  'grid grid-cols-[minmax(160px,1.4fr)_minmax(90px,.6fr)_116px_84px_minmax(170px,1fr)_36px] items-center gap-x-3 px-4';
const CELL = 'min-w-0 truncate';

function rowClass(selected: boolean, busy: boolean) {
  return cn(
    'border-b border-border last:border-b-0 cursor-default text-[13px] transition-colors duration-150',
    selected ? 'bg-accent-soft' : 'hover:bg-fill',
    busy && 'opacity-50',
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  search,
  onSearch,
  onRefresh,
  refreshing,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  search: string;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 pb-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-edge bg-mat shadow-[var(--lumen-spec)]">
          <Icon className="size-5 text-label-2" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[24px] font-bold leading-7 tracking-[-0.02em] text-foreground">{title}</h2>
          <p className="truncate text-[12px] text-label-2">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[17px] -translate-y-1/2 text-label-3"
            strokeWidth={1.75}
          />
          <Input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-56 pl-9"
          />
        </div>
        <Button variant="secondary" onClick={onRefresh}>
          <RefreshCw className={cn(refreshing && 'animate-spin')} strokeWidth={1.75} />
          Refresh
        </Button>
      </div>
    </div>
  );
}

/**
 * List card: hugs its rows and scrolls inside once it reaches the window height.
 * The 11px uppercase header stays outside the scroller (a sticky header would paint
 * a band on the translucent card); both reserve the scrollbar gutter so columns align.
 */
function TableCard({
  label,
  cols,
  columns,
  children,
}: {
  label: string;
  cols: string;
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div role="table" aria-label={label} className="lumen-card flex min-h-0 flex-col overflow-hidden rounded-[20px]">
      <div role="rowgroup" className="shrink-0 overflow-hidden border-b border-border [scrollbar-gutter:stable]">
        <div role="row" className={cn(cols, 'h-[34px] text-[11px] font-bold uppercase tracking-[.06em] text-label-3')}>
          {columns.map((c) => (
            <div key={c} role="columnheader" className={CELL}>{c}</div>
          ))}
          <div role="columnheader"><span className="sr-only">Actions</span></div>
        </div>
      </div>
      <div role="rowgroup" className="min-h-0 overflow-y-auto [scrollbar-gutter:stable]">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div role="row" className="px-4 py-10 text-center text-[13px] text-label-2">
      <div role="cell">{children}</div>
    </div>
  );
}

/** Row menus render the same items as a right-click menu and from the "…" button. */
interface MenuKit {
  Item: React.ComponentType<{ onClick?: () => void; danger?: boolean; children?: React.ReactNode }>;
  Separator: React.ComponentType;
}
const CONTEXT_KIT: MenuKit = { Item: ContextMenuItem, Separator: ContextMenuSeparator };
const DROPDOWN_KIT: MenuKit = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator };

function RowMenuButton({
  label,
  onOpenChange,
  children,
}: {
  label: string;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="bg-fill hover:bg-fill-2"
          aria-label={label}
          title={label}
        >
          <MoreHorizontal strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Log Viewer Panel ────────────────────────────────────────────────────────

function LogViewer({
  serverId,
  containerId,
  containerName,
  onClose,
}: {
  serverId: string;
  containerId: string;
  containerName: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const logRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetchDockerLogs(serverId, containerId, 500);
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch {
      // silent fail on refresh
    } finally {
      setLoading(false);
    }
  }, [serverId, containerId]);

  useEffect(() => {
    loadLogs();
    // Auto-refresh logs every 3s
    intervalRef.current = setInterval(loadLogs, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="lumen-card flex h-full flex-col gap-2 overflow-hidden rounded-[20px] p-2">
      <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 pl-2">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-label-2">
          <FileText className="size-4 shrink-0 text-label-3" strokeWidth={1.75} />
          <span className="truncate">Logs: <span className="font-semibold text-foreground">{containerName}</span></span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close logs"
          title="Close logs"
        >
          <X strokeWidth={1.75} />
        </Button>
      </div>
      <pre
        ref={logRef}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-[14px] bg-paper px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground"
      >
        {loading ? 'Loading logs…' : logs || 'No logs available'}
      </pre>
    </div>
  );
}

// ─── Containers Tab ──────────────────────────────────────────────────────────

function ContainersTab({
  containers,
  serverId,
  onRefresh,
  refreshing,
  onViewLogs,
  onContextMenuOpenChange,
}: {
  containers: DockerContainerData[];
  serverId: string;
  onRefresh: () => void;
  refreshing: boolean;
  onViewLogs: (containerId: string, containerName: string) => void;
  onContextMenuOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openWindow = useDesktopStore((s) => s.openWindow);

  const filtered = containers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.image.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAction = async (
    containerId: string,
    action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause',
  ) => {
    setActionBusy(containerId);
    try {
      const res = await dockerContainerAction(serverId, containerId, action);
      if (res.success) {
        toast.success(`Container ${action}ed`);
        onRefresh();
      } else {
        toast.error(res.error ?? `Failed to ${action} container`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleRemove = async (containerId: string, force: boolean) => {
    setActionBusy(containerId);
    try {
      const res = await removeDockerContainer(serverId, containerId, force);
      if (res.success) {
        toast.success('Container removed');
        onRefresh();
      } else {
        toast.error(res.error ?? 'Failed to remove container');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setActionBusy(null);
    }
  };

  const running = containers.filter((c) => c.state === 'running').length;

  const renderMenu = ({ Item, Separator }: MenuKit, c: DockerContainerData) => (
    <>
      {c.state === 'running' && (
        <>
          <Item onClick={() => handleAction(c.id, 'stop')}>
            <Square strokeWidth={1.75} />
            Stop
          </Item>
          <Item onClick={() => handleAction(c.id, 'restart')}>
            <RotateCcw strokeWidth={1.75} />
            Restart
          </Item>
          <Item onClick={() => handleAction(c.id, 'pause')}>
            <Pause strokeWidth={1.75} />
            Pause
          </Item>
        </>
      )}
      {c.state === 'paused' && (
        <Item onClick={() => handleAction(c.id, 'unpause')}>
          <PlayCircle strokeWidth={1.75} />
          Unpause
        </Item>
      )}
      {(c.state === 'exited' || c.state === 'dead') && (
        <Item onClick={() => handleAction(c.id, 'start')}>
          <Play strokeWidth={1.75} />
          Start
        </Item>
      )}
      <Separator />
      <Item onClick={() => onViewLogs(c.id, c.name)}>
        <FileText strokeWidth={1.75} />
        View Logs
      </Item>
      {c.state === 'running' && (
        <>
          <Item onClick={() => openWindow('container-files', serverId, `Files — ${c.name}`, 'FolderOpen', { containerId: c.id, containerName: c.name })}>
            <FolderOpen strokeWidth={1.75} />
            Open Files
          </Item>
          <Item onClick={() => openWindow('container-shell', serverId, `Shell — ${c.name}`, 'SquareTerminal', { containerId: c.id, containerName: c.name })}>
            <SquareTerminal strokeWidth={1.75} />
            Open Shell
          </Item>
        </>
      )}
      <Separator />
      <Item danger onClick={() => handleRemove(c.id, c.state === 'running')}>
        <Trash2 strokeWidth={1.75} />
        {c.state === 'running' ? 'Force Remove' : 'Remove'}
      </Item>
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        icon={Box}
        title="Containers"
        subtitle={`${containers.length} ${containers.length === 1 ? 'container' : 'containers'} · ${running} running`}
        search={search}
        onSearch={setSearch}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <TableCard label="Containers" cols={CONTAINER_COLS} columns={['Name', 'Image', 'State', 'Status', 'Ports']}>
        {filtered.map((c) => (
          <ContextMenu key={c.id} onOpenChange={onContextMenuOpenChange}>
            <ContextMenuTrigger asChild>
              <div
                role="row"
                aria-selected={selectedId === c.id}
                className={cn(CONTAINER_COLS, 'h-[52px]', rowClass(selectedId === c.id, actionBusy === c.id))}
                onClick={() => setSelectedId(c.id)}
                onContextMenu={() => setSelectedId(c.id)}
              >
                <div role="cell" className="min-w-0">
                  <div className={cn('truncate font-semibold', selectedId === c.id ? 'text-accent-text' : 'text-foreground')}>
                    {c.name}
                  </div>
                  <div className="truncate font-mono text-[11px] text-label-3">{c.id.substring(0, 12)}</div>
                </div>
                <div role="cell" className={cn(CELL, MONO_META)}>
                  {c.image}
                </div>
                <div role="cell" className="min-w-0">
                  <StateBadge state={c.state} />
                </div>
                <div role="cell" className={cn(CELL, 'text-[12px] text-label-2')}>
                  {c.status}
                </div>
                <div role="cell" className={cn(CELL, MONO_META)} title={c.ports || undefined}>
                  {c.ports || '—'}
                </div>
                <div role="cell" className="flex justify-end">
                  <RowMenuButton label={`Actions for ${c.name}`} onOpenChange={onContextMenuOpenChange}>
                    {renderMenu(DROPDOWN_KIT, c)}
                  </RowMenuButton>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>{renderMenu(CONTEXT_KIT, c)}</ContextMenuContent>
          </ContextMenu>
        ))}
        {filtered.length === 0 && (
          <EmptyRow>
            {search ? 'No containers match filter' : 'No containers found'}
          </EmptyRow>
        )}
      </TableCard>
    </div>
  );
}

// ─── Images Tab ──────────────────────────────────────────────────────────────

function ImagesTab({
  images,
  serverId,
  onRefresh,
  refreshing,
  onContextMenuOpenChange,
}: {
  images: DockerImageData[];
  serverId: string;
  onRefresh: () => void;
  refreshing: boolean;
  onContextMenuOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [runDialogImage, setRunDialogImage] = useState<DockerImageData | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = images.filter(
    (img) =>
      img.repository.toLowerCase().includes(search.toLowerCase()) ||
      img.tag.toLowerCase().includes(search.toLowerCase()) ||
      img.id.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRemove = async (imageId: string, force: boolean) => {
    setActionBusy(imageId);
    try {
      const res = await removeDockerImage(serverId, imageId, force);
      if (res.success) {
        toast.success('Image removed');
        onRefresh();
      } else {
        toast.error(res.error ?? 'Failed to remove image');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setActionBusy(null);
    }
  };

  const renderMenu = ({ Item, Separator }: MenuKit, img: DockerImageData) => (
    <>
      <Item onClick={() => setRunDialogImage(img)}>
        <Play strokeWidth={1.75} />
        Run Image
      </Item>
      <Separator />
      <Item danger onClick={() => handleRemove(img.id, false)}>
        <Trash2 strokeWidth={1.75} />
        Remove Image
      </Item>
      <Item danger onClick={() => handleRemove(img.id, true)}>
        <Trash2 strokeWidth={1.75} />
        Force Remove
      </Item>
    </>
  );

  return (
    <div className="flex h-full flex-col">
      <RunImageDialog
        open={!!runDialogImage}
        onOpenChange={(open) => { if (!open) setRunDialogImage(null); }}
        image={runDialogImage}
        serverId={serverId}
        onCreated={onRefresh}
      />

      <SectionHeader
        icon={Image}
        title="Images"
        subtitle={`${images.length} ${images.length === 1 ? 'image' : 'images'}`}
        search={search}
        onSearch={setSearch}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      <TableCard label="Images" cols={IMAGE_COLS} columns={['Repository', 'Tag', 'ID', 'Size', 'Created']}>
        {filtered.map((img) => {
          const rowKey = img.id + img.tag;
          return (
            <ContextMenu key={rowKey} onOpenChange={onContextMenuOpenChange}>
              <ContextMenuTrigger asChild>
                <div
                  role="row"
                  aria-selected={selectedKey === rowKey}
                  className={cn(IMAGE_COLS, 'h-[44px]', rowClass(selectedKey === rowKey, actionBusy === img.id))}
                  onClick={() => setSelectedKey(rowKey)}
                  onContextMenu={() => setSelectedKey(rowKey)}
                >
                  <div
                    role="cell"
                    className={cn(CELL, 'font-semibold', selectedKey === rowKey ? 'text-accent-text' : 'text-foreground')}
                  >
                    {img.repository}
                  </div>
                  <div role="cell" className={cn(CELL, MONO_META)}>{img.tag}</div>
                  <div role="cell" className={cn(CELL, MONO_META)}>
                    {img.id.substring(0, 12)}
                  </div>
                  <div role="cell" className={cn(CELL, 'text-[12px] text-label-2 tabular-nums')}>{img.size}</div>
                  <div role="cell" className={cn(CELL, 'text-[12px] text-label-2')}>
                    {img.created}
                  </div>
                  <div role="cell" className="flex justify-end">
                    <RowMenuButton label={`Actions for ${img.repository}`} onOpenChange={onContextMenuOpenChange}>
                      {renderMenu(DROPDOWN_KIT, img)}
                    </RowMenuButton>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>{renderMenu(CONTEXT_KIT, img)}</ContextMenuContent>
            </ContextMenu>
          );
        })}
        {filtered.length === 0 && (
          <EmptyRow>
            {search ? 'No images match filter' : 'No images found'}
          </EmptyRow>
        )}
      </TableCard>
    </div>
  );
}

// ─── Run Image Dialog ─────────────────────────────────────────────────────────

interface RunImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: DockerImageData | null;
  serverId: string;
  onCreated: () => void;
}

function RunImageDialog({ open, onOpenChange, image, serverId, onCreated }: RunImageDialogProps) {
  const [containerName, setContainerName] = useState('');
  const [portsStr, setPortsStr] = useState('');
  const [envStr, setEnvStr] = useState('');
  const [volumesStr, setVolumesStr] = useState('');
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);

  // Reset form when dialog opens with a new image
  useEffect(() => {
    if (open) {
      setContainerName('');
      setPortsStr('');
      setEnvStr('');
      setVolumesStr('');
      setCommand('');
    }
  }, [open]);

  const imageRef = image ? `${image.repository}${image.tag && image.tag !== '<none>' ? ':' + image.tag : ''}` : '';

  const handleRun = async () => {
    if (!image) return;
    setRunning(true);
    try {
      const opts: RunDockerImageOptions = {
        image: imageRef,
        detach: true,
      };
      if (containerName.trim()) opts.name = containerName.trim();
      if (portsStr.trim()) opts.ports = portsStr.split(',').map(s => s.trim()).filter(Boolean);
      if (envStr.trim()) opts.env = envStr.split(',').map(s => s.trim()).filter(Boolean);
      if (volumesStr.trim()) opts.volumes = volumesStr.split(',').map(s => s.trim()).filter(Boolean);
      if (command.trim()) opts.command = command.trim();

      const res = await runDockerImage(serverId, opts);
      if (res.success) {
        toast.success(`Container created${res.containerId ? ` (${res.containerId})` : ''}`);
        onOpenChange(false);
        onCreated();
      } else {
        toast.error(res.error ?? 'Failed to run container');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run container');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="size-[18px] text-accent-solid" strokeWidth={1.75} />
            Run Image
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Create and start a new container from <span className="font-mono font-medium text-foreground">{imageRef}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="container-name" className="px-1 text-[12px] font-semibold text-label-2">Container Name</Label>
            <Input
              id="container-name"
              placeholder="my-container (optional)"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ports" className="px-1 text-[12px] font-semibold text-label-2">Port Mappings</Label>
            <Input
              id="ports"
              placeholder="8080:80, 3306:3306 (optional)"
              value={portsStr}
              onChange={(e) => setPortsStr(e.target.value)}
              className="font-mono"
            />
            <p className="px-1 text-[12px] text-label-3">host:container, comma-separated</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="env" className="px-1 text-[12px] font-semibold text-label-2">Environment Variables</Label>
            <Input
              id="env"
              placeholder="KEY=value, FOO=bar (optional)"
              value={envStr}
              onChange={(e) => setEnvStr(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="volumes" className="px-1 text-[12px] font-semibold text-label-2">Volume Mounts</Label>
            <Input
              id="volumes"
              placeholder="/host/path:/container/path (optional)"
              value={volumesStr}
              onChange={(e) => setVolumesStr(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="command" className="px-1 text-[12px] font-semibold text-label-2">Command Override</Label>
            <Input
              id="command"
              placeholder="Override default CMD (optional)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={running}
          >
            {running ? <RefreshCw className="animate-spin" strokeWidth={1.75} /> : <Play strokeWidth={1.75} />}
            {running ? 'Creating…' : 'Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Docker View ─────────────────────────────────────────────────────────────

interface DockerViewProps {
  serverId: string;
}

export function DockerView({ serverId }: DockerViewProps) {
  const [tab, setTab] = useState<TabId>('containers');
  const [containers, setContainers] = useState<DockerContainerData[]>([]);
  const [images, setImages] = useState<DockerImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(true);
  const [showInstaller, setShowInstaller] = useState(false);

  // Log viewer state
  const [logTarget, setLogTarget] = useState<{ id: string; name: string } | null>(null);

  const pauseRefreshRef = useRef(false);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [containerRes, imageRes] = await Promise.all([
          fetchDockerContainers(serverId),
          fetchDockerImages(serverId),
        ]) as [DockerContainersResponse, DockerImagesResponse];

        if (containerRes.success) {
          setContainers(containerRes.data ?? []);
          if (containerRes.dockerAvailable !== undefined) {
            setDockerAvailable(containerRes.dockerAvailable);
          }
        }
        if (imageRes.success) {
          setImages(imageRes.data ?? []);
        }

        if (!containerRes.success && !imageRes.success) {
          setError(containerRes.error ?? imageRes.error ?? 'Failed to fetch Docker data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch Docker data');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serverId],
  );

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh based on preference (minimum 5s for Docker)
  const autoRefreshInterval = usePreferencesStore(s => s.autoRefreshInterval);
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const ms = Math.max(autoRefreshInterval * 1000, 5000);
    const interval = setInterval(() => {
      if (!pauseRefreshRef.current) loadData(true);
    }, ms);
    return () => clearInterval(interval);
  }, [loadData, autoRefreshInterval]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="h-full">
        <LoadingView label="Loading Docker…" />
      </div>
    );
  }

  // ── Docker not available ──
  if (!dockerAvailable) {
    // Show installer terminal when user clicks Install
    if (showInstaller) {
      return (
        <div className="flex h-full flex-col">
          <DockerInstallTerminal
            serverId={serverId}
            onClose={() => setShowInstaller(false)}
            onInstallComplete={() => {
              setShowInstaller(false);
              setDockerAvailable(true);
              loadData();
              toast.success('Docker installation complete — reloading…');
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center px-6 pb-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-[18px] border border-edge bg-mat shadow-[var(--lumen-spec)]">
            <Box className="size-8 text-label-2" strokeWidth={1.5} />
          </div>
          <p className="mb-1.5 text-[17px] font-bold text-foreground">Docker is not installed</p>
          <p className="mb-5 text-[13px] leading-relaxed text-label-2">
            Install Docker on this server to manage containers and images.
            The official install script from <span className="font-mono text-foreground">get.docker.com</span> will be used.
          </p>
          <Button onClick={() => setShowInstaller(true)}>
            <Download strokeWidth={1.75} />
            Install Docker
          </Button>
          <p className="mt-3 text-[12px] text-label-3">
            Requires sudo privileges on the server
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  // Detect "not connected" errors and show a friendly disconnected state
  const isDisconnected = error && /not connected/i.test(error);

  if (isDisconnected) {
    return (
      // The shared DisconnectedState paints bg-background; let the window glass show instead.
      <div className="h-full [&>div]:bg-transparent">
        <DisconnectedState
          serverId={serverId}
          onReconnected={() => loadData()}
          message="The SSH connection to this server was lost. Reconnect to manage Docker containers."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 pb-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-3 size-8 text-danger" strokeWidth={1.75} />
          <p className="mb-4 text-[13px] text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => loadData()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const runningCount = containers.filter((c) => c.state === 'running').length;
  const pausedCount = containers.filter((c) => c.state === 'paused').length;
  const stoppedCount = containers.length - runningCount - pausedCount;

  return (
    <div className="flex h-full">
      {/* ── Sidebar ── */}
      <PaneSidebar
        width={200}
        aria-label="Docker"
        footer={
          <div className="flex flex-col gap-1.5 pb-0.5 text-[12px] text-label-2">
            <SummaryRow dotClass="bg-success" label="Running" value={runningCount} />
            {pausedCount > 0 && <SummaryRow dotClass="bg-warning" label="Paused" value={pausedCount} />}
            <SummaryRow dotClass="bg-label-3" label="Stopped" value={stoppedCount} />
          </div>
        }
      >
        {TABS.map((entry) => (
          <PaneSidebarItem
            key={entry.id}
            icon={entry.icon}
            label={entry.label}
            active={tab === entry.id}
            badge={entry.id === 'containers' ? containers.length : images.length}
            onClick={() => setTab(entry.id)}
          />
        ))}
      </PaneSidebar>

      {/* ── Content area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 pb-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === 'containers' && (
            <ContainersTab
              containers={containers}
              serverId={serverId}
              onRefresh={() => loadData(true)}
              refreshing={refreshing}
              onViewLogs={(id, name) => setLogTarget({ id, name })}
              onContextMenuOpenChange={(open) => { pauseRefreshRef.current = open; }}
            />
          )}
          {tab === 'images' && (
            <ImagesTab
              images={images}
              serverId={serverId}
              onRefresh={() => loadData(true)}
              refreshing={refreshing}
              onContextMenuOpenChange={(open) => { pauseRefreshRef.current = open; }}
            />
          )}
        </div>

        {/* Log viewer panel */}
        {logTarget && (
          <div className="mt-3 h-[40%] min-h-[150px] shrink-0">
            <LogViewer
              serverId={serverId}
              containerId={logTarget.id}
              containerName={logTarget.name}
              onClose={() => setLogTarget(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ dotClass, label, value }: { dotClass: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('size-2 shrink-0 rounded-full', dotClass)} />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
