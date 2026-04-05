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
      <div className="flex-1 flex items-center justify-center bg-zinc-950">
        <div className="text-center text-zinc-600">
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
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950">
      {/* Tab Bar */}
      <div className="flex items-center bg-zinc-900 border-b border-zinc-800 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`group flex items-center gap-2 px-4 py-2 text-sm border-r border-zinc-800 shrink-0 ${
              tab.id === activeTabId
                ? 'bg-zinc-950 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="truncate max-w-[140px]">{tab.title}</span>
            <span
              className="p-0.5 rounded hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
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
        <div className="text-zinc-400 text-sm">
          <p>Unknown app: <span className="text-zinc-200">{appId}</span></p>
        </div>
      );
  }
}
