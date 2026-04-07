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
      {/* Sidebar — Apple Finder inspired */}
      <nav className="w-[200px] shrink-0 border-r border-border/40 overflow-y-auto pt-1.5">
        <div className="px-4 pt-2.5 pb-1.5 text-[11px] font-semibold text-foreground/50 tracking-wide">
          Server Admin
        </div>
        <div className="px-3 pb-2">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  'flex items-center gap-2 w-full px-2.5 py-2 text-[13px] rounded-md transition-colors outline-none',
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-foreground hover:bg-accent/50',
                )}
              >
                <Icon size={20} strokeWidth={1.6} className={cn('shrink-0', isActive && 'text-primary')} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <SectionContent section={activeSection} serverId={serverId} />
      </div>
    </div>
  );
}
