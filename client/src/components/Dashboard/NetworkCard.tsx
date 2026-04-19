// M2.2: Network Card — network interfaces display
// @see docs/phases/phase-2.md

import { Network, Wifi, WifiOff } from 'lucide-react';

interface NetworkInterfaceData {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  ipAddresses: string[];
}

interface NetworkCardProps {
  interfaces: NetworkInterfaceData[];
}

export function NetworkCard({ interfaces }: NetworkCardProps) {
  // Show UP interfaces first, then UNKNOWN, then DOWN
  const sorted = [...interfaces].sort((a, b) => {
    const order = { UP: 0, UNKNOWN: 1, DOWN: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-card-foreground">Network</h3>
        <span className="text-xs text-muted-foreground">
          {interfaces.filter(i => i.status === 'UP').length} up /{' '}
          {interfaces.length} total
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map(iface => (
          <InterfaceRow key={iface.name} iface={iface} />
        ))}
      </div>
    </div>
  );
}

function InterfaceRow({ iface }: { iface: NetworkInterfaceData }) {
  const StatusIcon = iface.status === 'UP' ? Wifi : WifiOff;
  const statusColor =
    iface.status === 'UP'
      ? 'text-success'
      : iface.status === 'UNKNOWN'
        ? 'text-warning'
        : 'text-muted-foreground/50';

  return (
    <div className="flex items-center gap-3 text-xs py-1">
      <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
      <span className="text-foreground font-mono w-24 truncate" title={iface.name}>
        {iface.name}
      </span>
      <div className="flex-1 flex flex-wrap gap-1">
        {iface.ipAddresses.length > 0 ? (
          iface.ipAddresses.map(ip => (
            <span
              key={ip}
              className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-mono text-[10px]"
            >
              {ip}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground/50 italic">no address</span>
        )}
      </div>
    </div>
  );
}
