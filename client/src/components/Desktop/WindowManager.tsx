// M2.X: Window Manager — renders all open windows with their app content
// @see docs/phases/phase-2.md

import { useDesktopStore } from '../../store/window-store';
import { WindowFrame } from './Window';
import { DashboardView } from '../Dashboard/DashboardView';
import { FileExplorerView } from '../FileExplorer/FileExplorerView';
import { TerminalView } from '../Terminal/TerminalView';
import { SettingsView } from './SettingsView';
import { TaskManagerView } from '../TaskManager/TaskManagerView';
import { DockerView } from '../Docker/DockerView';
import { ServicesView } from '../Services/ServicesView';

function WindowContent({ appId, serverId }: { appId: string; serverId: string }) {
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
          <FileExplorerView serverId={serverId} />
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
          <SettingsView />
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

  return (
    <>
      {windows.map(win => (
        <WindowFrame key={win.id} win={win}>
          <WindowContent appId={win.appId} serverId={win.serverId} />
        </WindowFrame>
      ))}
    </>
  );
}
