// M2.X + M10.10: Window Manager — lazy-loaded app views for code splitting
// @see docs/phases/phase-2.md

import { lazy, Suspense } from 'react';
import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import { WindowFrame } from './Window';
import { Skeleton } from '@/components/ui/skeleton';

// ── Lazy-loaded views (M10.10 — code splitting) ─────────
const DashboardView = lazy(() => import('../Dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const FileExplorerView = lazy(() => import('../FileExplorer/FileExplorerView').then(m => ({ default: m.FileExplorerView })));
const TerminalView = lazy(() => import('../Terminal/TerminalView').then(m => ({ default: m.TerminalView })));
const SettingsView = lazy(() => import('./SettingsView').then(m => ({ default: m.SettingsView })));
const TaskManagerView = lazy(() => import('../TaskManager/TaskManagerView').then(m => ({ default: m.TaskManagerView })));
const DockerView = lazy(() => import('../Docker/DockerView').then(m => ({ default: m.DockerView })));
const ServicesView = lazy(() => import('../Services/ServicesView').then(m => ({ default: m.ServicesView })));
const ServerAdminView = lazy(() => import('../ServerAdmin/ServerAdminView').then(m => ({ default: m.ServerAdminView })));
const FleetDashboardView = lazy(() => import('../Fleet/FleetDashboardView').then(m => ({ default: m.FleetDashboardView })));
const AgentView = lazy(() => import('../Agent/AgentView').then(m => ({ default: m.AgentView })));
const DynamicUITabView = lazy(() => import('../DynamicUI/DynamicUITabView').then(m => ({ default: m.DynamicUITabView })));
const UIAgentView = lazy(() => import('../Agent/UIAgentView').then(m => ({ default: m.UIAgentView })));
const ObservatoryView = lazy(() => import('../Observatory/ObservatoryView').then(m => ({ default: m.ObservatoryView })));

function LazyFallback() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function WindowContent({ appId, serverId, windowId, meta }: { appId: string; serverId: string; windowId: string; meta?: Record<string, string> }) {
  switch (appId) {
    case 'dashboard':
      return (
        <div className="p-4 h-full overflow-auto">
          <DashboardView serverId={serverId} />
        </div>
      );
    case 'files':
      return (
        <div className="h-full overflow-hidden">
          <FileExplorerView serverId={serverId} initialPath={meta?.initialPath} />
        </div>
      );
    case 'terminal':
      return (
        <div className="h-full">
          <TerminalView serverId={serverId} />
        </div>
      );
    case 'settings':
      return (
        <div className="h-full overflow-hidden">
          <SettingsView initialPage={meta?.initialPage as 'general' | 'appearance' | 'wallpaper' | 'terminal' | 'keyboard' | 'notifications' | 'ai' | 'plugins' | 'about' | undefined} />
        </div>
      );
    case 'taskmanager':
      return (
        <div className="h-full overflow-hidden">
          <TaskManagerView serverId={serverId} />
        </div>
      );
    case 'docker':
      return (
        <div className="h-full overflow-hidden">
          <DockerView serverId={serverId} />
        </div>
      );
    case 'services':
      return (
        <div className="h-full overflow-hidden">
          <ServicesView serverId={serverId} />
        </div>
      );
    case 'serveradmin':
      return (
        <div className="h-full overflow-hidden">
          <ServerAdminView serverId={serverId} />
        </div>
      );
    case 'fleet':
      return (
        <div className="h-full overflow-hidden">
          <FleetDashboardView />
        </div>
      );
    case 'agent':
      return (
        <div className="h-full overflow-hidden">
          <AgentView serverId={serverId} />
        </div>
      );
    case 'dynamic-ui':
      return (
        <div className="h-full overflow-hidden">
          <DynamicUITabView serverId={serverId} windowId={windowId} />
        </div>
      );
    case 'ui-agent':
      return (
        <div className="h-full overflow-hidden">
          <UIAgentView serverId={serverId} />
        </div>
      );
    case 'observatory':
      return (
        <div className="h-full overflow-hidden">
          <ObservatoryView />
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-center h-full text-white/30 text-sm">
          Unknown app: {appId}
        </div>
      );
  }
}

export function WindowManager() {
  const windows = useDesktopStore(s => s.windows);
  const activeServerId = useAppStore(s => s.activeServerId);

  // EX6-D: Citrix-style session isolation — only render windows belonging
  // to the active session. Other live sessions keep their windows in the
  // store but are visually hidden until the user switches to them.
  // Global apps (empty serverId, e.g. Settings/Personalize) are always visible.
  const visible = windows.filter(
    w => w.serverId === '' || (activeServerId !== null && w.serverId === activeServerId),
  );

  return (
    <>
      {visible.map(win => (
        <WindowFrame key={win.id} win={win}>
          <Suspense fallback={<LazyFallback />}>
            <WindowContent appId={win.appId} serverId={win.serverId} windowId={win.id} meta={win.meta} />
          </Suspense>
        </WindowFrame>
      ))}
    </>
  );
}
