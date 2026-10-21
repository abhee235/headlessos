// M7.2: Server Admin View — main shell with sidebar navigation
// EX8.6: LumenOS v3 — PaneSidebar with the eight sections and a host card pinned at the bottom.
// @see docs/phases/phase-7.md, docs/phases/phase-ex8.md

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Network,
  Shield,
  Lock,
  Globe,
  Package,
  Clock,
  ScrollText,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PaneSidebar, PaneSidebarItem } from '@/components/ui/pane-sidebar';
import { useAppStore } from '../../store/app-store';
import { NetworkSection } from './NetworkSection';
import { FirewallSection } from './FirewallSection';
import { SecuritySection } from './SecuritySection';
import { WebServerSection } from './WebServerSection';
import { PackagesSection } from './PackagesSection';
import { CronSection } from './CronSection';
import { LogsSection } from './LogsSection';
import { StorageSection } from './StorageSection';

type SectionId =
  | 'network'
  | 'firewall'
  | 'security'
  | 'webserver'
  | 'packages'
  | 'cron'
  | 'logs'
  | 'storage';

interface SidebarItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}

const SECTIONS: SidebarItem[] = [
  { id: 'network', label: 'Network', icon: Network },
  { id: 'firewall', label: 'Firewall', icon: Shield },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'webserver', label: 'Web server', icon: Globe },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'cron', label: 'Cron jobs', icon: Clock },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'storage', label: 'Storage', icon: HardDrive },
];

function SectionContent({ section, serverId }: { section: SectionId; serverId: string }) {
  switch (section) {
    case 'network':
      return <NetworkSection serverId={serverId} />;
    case 'firewall':
      return <FirewallSection serverId={serverId} />;
    case 'security':
      return <SecuritySection serverId={serverId} />;
    case 'webserver':
      return <WebServerSection serverId={serverId} />;
    case 'packages':
      return <PackagesSection serverId={serverId} />;
    case 'cron':
      return <CronSection serverId={serverId} />;
    case 'logs':
      return <LogsSection serverId={serverId} />;
    case 'storage':
      return <StorageSection serverId={serverId} />;
  }
}

/** Host card pinned under the section list: status dot, server name, user@host */
function HostCard({ serverId }: { serverId: string }) {
  const server = useAppStore((s) => s.servers.find((x) => x.id === serverId));
  const status = server?.state?.status;
  const dot =
    status === 'connected'
      ? 'bg-success'
      : status === 'connecting'
        ? 'bg-warning'
        : status === 'error'
          ? 'bg-destructive'
          : 'bg-label-3';

  return (
    <div className="flex items-center gap-2.5 pb-0.5" title={status ?? undefined}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      <div className="min-w-0">
        <div className="truncate font-mono text-[13px] font-semibold text-foreground">{server?.name ?? serverId}</div>
        {server && (
          <div className="truncate text-[11px] text-label-2">
            {server.username}@{server.host}
          </div>
        )}
      </div>
    </div>
  );
}

export function ServerAdminView({ serverId }: { serverId: string }) {
  const [activeSection, setActiveSection] = useState<SectionId>('network');

  return (
    <div className="flex h-full">
      <PaneSidebar width={200} aria-label="Server Admin" footer={<HostCard serverId={serverId} />}>
        {SECTIONS.map((item) => (
          <PaneSidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeSection === item.id}
            onClick={() => setActiveSection(item.id)}
          />
        ))}
      </PaneSidebar>

      {/* Content */}
      <div className="min-w-0 flex-1 overflow-auto">
        <SectionContent section={activeSection} serverId={serverId} />
      </div>
    </div>
  );
}
