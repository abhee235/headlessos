// M3.1-M3.3: Docker Manager — container/image management with log viewer
// @see docs/phases/phase-3.md

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
} from 'lucide-react';
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
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DisconnectedState } from '@/components/ui/disconnected-state';
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
  icon: React.ReactNode;
}

const TABS: SidebarEntry[] = [
  { id: 'containers', label: 'Containers', icon: <Box size={16} /> },
  { id: 'images', label: 'Images', icon: <Image size={16} /> },
];

// ─── State badge helper ──────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const variant =
    state === 'running'
      ? 'success'
      : state === 'paused'
        ? 'warning'
        : state === 'dead' || state === 'exited'
          ? 'secondary'
          : 'outline';

  return (
    <Badge variant={variant as 'success' | 'warning' | 'secondary' | 'outline'} className="text-[10px] px-1.5 py-0">
      {state}
    </Badge>
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
    <div className="flex flex-col h-full border-t border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-sidebar border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText size={12} />
          <span>Logs: <span className="text-foreground font-medium">{containerName}</span></span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>
      <pre
        ref={logRef}
        className="flex-1 overflow-auto p-2 text-[11px] font-mono leading-relaxed text-foreground bg-background whitespace-pre-wrap"
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            Containers ({containers.length})
          </span>
          {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-6 pr-2 py-1 text-xs bg-secondary border border-border rounded-md w-40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sidebar z-10">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Image</th>
              <th className="px-3 py-1.5 font-medium">State</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              <th className="px-3 py-1.5 font-medium">Ports</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <ContextMenu key={c.id} onOpenChange={onContextMenuOpenChange}>
                <ContextMenuTrigger asChild>
                  <tr
                    className={`
                      border-b border-border/50 hover:bg-accent/50 cursor-default
                      ${actionBusy === c.id ? 'opacity-50' : ''}
                    `}
                  >
                    <td className="px-3 py-1.5 font-medium text-foreground max-w-[180px] truncate">
                      {c.name}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">
                      {c.image}
                    </td>
                    <td className="px-3 py-1.5">
                      <StateBadge state={c.state} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">
                      {c.status}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[180px] truncate">
                      {c.ports || '—'}
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  {c.state === 'running' && (
                    <>
                      <ContextMenuItem onClick={() => handleAction(c.id, 'stop')}>
                        <Square className="w-4 h-4 mr-2 opacity-60" />
                        Stop
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleAction(c.id, 'restart')}>
                        <RotateCcw className="w-4 h-4 mr-2 opacity-60" />
                        Restart
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleAction(c.id, 'pause')}>
                        <Pause className="w-4 h-4 mr-2 opacity-60" />
                        Pause
                      </ContextMenuItem>
                    </>
                  )}
                  {c.state === 'paused' && (
                    <ContextMenuItem onClick={() => handleAction(c.id, 'unpause')}>
                      <PlayCircle className="w-4 h-4 mr-2 opacity-60" />
                      Unpause
                    </ContextMenuItem>
                  )}
                  {(c.state === 'exited' || c.state === 'dead') && (
                    <ContextMenuItem onClick={() => handleAction(c.id, 'start')}>
                      <Play className="w-4 h-4 mr-2 opacity-60" />
                      Start
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onViewLogs(c.id, c.name)}>
                    <FileText className="w-4 h-4 mr-2 opacity-60" />
                    View Logs
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={() => handleRemove(c.id, c.state === 'running')}
                  >
                    <Trash2 className="w-4 h-4 mr-2 opacity-60" />
                    {c.state === 'running' ? 'Force Remove' : 'Remove'}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  {search ? 'No containers match filter' : 'No containers found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

  return (
    <div className="flex flex-col h-full">
      <RunImageDialog
        open={!!runDialogImage}
        onOpenChange={(open) => { if (!open) setRunDialogImage(null); }}
        image={runDialogImage}
        serverId={serverId}
        onCreated={onRefresh}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            Images ({images.length})
          </span>
          {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-6 pr-2 py-1 text-xs bg-secondary border border-border rounded-md w-40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sidebar z-10">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Repository</th>
              <th className="px-3 py-1.5 font-medium">Tag</th>
              <th className="px-3 py-1.5 font-medium">ID</th>
              <th className="px-3 py-1.5 font-medium">Size</th>
              <th className="px-3 py-1.5 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((img) => (
              <ContextMenu key={img.id + img.tag} onOpenChange={onContextMenuOpenChange}>
                <ContextMenuTrigger asChild>
                  <tr
                    className={`
                      border-b border-border/50 hover:bg-accent/50 cursor-default
                      ${actionBusy === img.id ? 'opacity-50' : ''}
                    `}
                  >
                    <td className="px-3 py-1.5 font-medium text-foreground max-w-[200px] truncate">
                      {img.repository}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{img.tag}</td>
                    <td className="px-3 py-1.5 text-muted-foreground font-mono">
                      {img.id.substring(0, 12)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{img.size}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">
                      {img.created}
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextMenuItem
                    onClick={() => setRunDialogImage(img)}
                  >
                    <Play className="w-4 h-4 mr-2 opacity-60" />
                    Run Image
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={() => handleRemove(img.id, false)}
                  >
                    <Trash2 className="w-4 h-4 mr-2 opacity-60" />
                    Remove Image
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={() => handleRemove(img.id, true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2 opacity-60" />
                    Force Remove
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">
                  {search ? 'No images match filter' : 'No images found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Play className="w-4 h-4" />
            Run Image
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create and start a new container from <span className="font-mono font-medium">{imageRef}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="container-name" className="text-xs">Container Name</Label>
            <Input
              id="container-name"
              placeholder="my-container (optional)"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ports" className="text-xs">Port Mappings</Label>
            <Input
              id="ports"
              placeholder="8080:80, 3306:3306 (optional)"
              value={portsStr}
              onChange={(e) => setPortsStr(e.target.value)}
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">host:container, comma-separated</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="env" className="text-xs">Environment Variables</Label>
            <Input
              id="env"
              placeholder="KEY=value, FOO=bar (optional)"
              value={envStr}
              onChange={(e) => setEnvStr(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="volumes" className="text-xs">Volume Mounts</Label>
            <Input
              id="volumes"
              placeholder="/host/path:/container/path (optional)"
              value={volumesStr}
              onChange={(e) => setVolumesStr(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="command" className="text-xs">Command Override</Label>
            <Input
              id="command"
              placeholder="Override default CMD (optional)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running}
            className="gap-1.5"
          >
            {running ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
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
      <div className="flex items-center justify-center h-full bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading Docker…</span>
        </div>
      </div>
    );
  }

  // ── Docker not available ──
  if (!dockerAvailable) {
    // Show installer terminal when user clicks Install
    if (showInstaller) {
      return (
        <div className="flex flex-col h-full bg-background">
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
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center max-w-sm">
          <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-sm font-medium text-foreground mb-1">Docker is not installed</p>
          <p className="text-xs text-muted-foreground mb-5">
            Install Docker on this server to manage containers and images.
            The official install script from <span className="font-mono">get.docker.com</span> will be used.
          </p>
          <Button
            onClick={() => setShowInstaller(true)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Install Docker
          </Button>
          <p className="text-[11px] text-muted-foreground/50 mt-3">
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
      <DisconnectedState
        serverId={serverId}
        onReconnected={() => loadData()}
        message="The SSH connection to this server was lost. Reconnect to manage Docker containers."
      />
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-destructive mb-3">{error}</p>
          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 text-xs bg-secondary hover:bg-accent text-foreground rounded-md"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* ── Left sidebar — Windows 11 style ── */}
      <nav className="w-12 shrink-0 border-r border-border bg-sidebar flex flex-col items-center py-2 gap-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`
              w-9 h-9 rounded-md flex items-center justify-center transition-colors relative group
              ${
                tab === entry.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }
            `}
            title={entry.label}
          >
            {tab === entry.id && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
            )}
            {entry.icon}
          </button>
        ))}
      </nav>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <div className={logTarget ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-hidden'}>
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
          <div className="h-[40%] min-h-[150px] shrink-0">
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
