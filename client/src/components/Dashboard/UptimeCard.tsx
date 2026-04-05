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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Server className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-medium text-zinc-200">System</h3>
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
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  );
}
