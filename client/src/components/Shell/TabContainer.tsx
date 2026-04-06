// M1.8 + M2.2: Tab Container — tab bar + active tab content
// @see docs/phases/phase-1.md, docs/phases/phase-2.md

import { useAppStore } from '../../store/app-store';
import { X, MonitorDot } from 'lucide-react';
import { DashboardView } from '../Dashboard/DashboardView';
import { FileExplorerView } from '../FileExplorer/FileExplorerView';

export function TabContainer() {
  const { tabs, activeTabId, setActiveTab, closeTab, activeServerId } =
    useAppStore();

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-muted-foreground">
          <MonitorDot className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {activeServerId
              ? 'Select an app from the sidebar to get started.'
              : 'Select a server to get started.'}
          </p>
        </div>
      </div>
    );
  }

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Tab Bar */}
      <div className="flex items-center bg-sidebar border-b border-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`group flex items-center gap-2 px-4 py-2 text-sm border-r border-border shrink-0 ${
              tab.id === activeTabId
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate max-w-[140px]">{tab.title}</span>
            <span
              className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {activeTab ? (
          <TabContent appId={activeTab.appId} serverId={activeTab.serverId} />
        ) : null}
      </div>
    </div>
  );
}

function TabContent({ appId, serverId }: { appId: string; serverId: string }) {
  switch (appId) {
    case 'dashboard':
      return <DashboardView serverId={serverId} />;
    case 'files':
      return <FileExplorerView serverId={serverId} />;
    default:
      return (
        <div className="text-muted-foreground text-sm">
          <p>Unknown app: <span className="text-foreground">{appId}</span></p>
        </div>
      );
  }
}
