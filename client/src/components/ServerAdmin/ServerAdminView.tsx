// M7.2: Server Admin View — main shell with sidebar navigation
// @see docs/phases/phase-7.md

import { useState } from 'react';
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
  icon: React.ElementType;
}

const SECTIONS: SidebarItem[] = [
  { id: 'network', label: 'Network', icon: Network },
  { id: 'firewall', label: 'Firewall', icon: Shield },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'webserver', label: 'Web Server', icon: Globe },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'cron', label: 'Cron Jobs', icon: Clock },
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

export function ServerAdminView({ serverId }: { serverId: string }) {
  const [activeSection, setActiveSection] = useState<SectionId>('network');

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-48 shrink-0 border-r border-border bg-muted/30 overflow-y-auto">
        <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Server Admin
        </div>
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon size={16} className="shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <SectionContent section={activeSection} serverId={serverId} />
      </div>
    </div>
  );
}
