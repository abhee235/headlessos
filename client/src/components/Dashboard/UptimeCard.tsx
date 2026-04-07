// M2.2: Uptime Card — system info display
// @see docs/phases/phase-2.md

import { Server } from 'lucide-react';

interface UptimeCardProps {
  system: {
    hostname: string;
    uptime: string;
    os: string;
    kernel: string;
    architecture: string;
  };
}

export function UptimeCard({ system }: UptimeCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-card-foreground">System</h3>
      </div>

      <div className="space-y-2">
        <InfoRow label="Uptime" value={system.uptime} />
        <InfoRow label="OS" value={system.os} />
        <InfoRow label="Kernel" value={system.kernel} />
        <InfoRow label="Arch" value={system.architecture} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-mono">{value}</span>
    </div>
  );
}
