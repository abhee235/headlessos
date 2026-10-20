// M2.2: Uptime Card — system info display
// EX8.6: LumenOS v3 — uptime as a big number, OS / Kernel / Arch as mono chips
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { Server } from 'lucide-react';
import { DashCard, MonoChip } from './parts';

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
    <DashCard icon={Server} title="System">
      <div className="mb-4">
        <p className="text-[13px] text-label-2">Uptime</p>
        <p
          className="truncate text-[30px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-foreground"
          title={system.uptime}
        >
          {compactUptime(system.uptime)}
        </p>
      </div>

      <div className="mt-auto divide-y divide-border border-t border-border">
        <InfoRow label="OS" value={system.os} />
        <InfoRow label="Kernel" value={system.kernel} />
        <InfoRow label="Arch" value={system.architecture} />
      </div>
    </DashCard>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="shrink-0 text-[13px] text-label-2">{label}</span>
      <MonoChip title={value}>{value}</MonoChip>
    </div>
  );
}

/** "up 2 days, 3 hours, 5 minutes" → "2d 3h 5m" (display only; raw value stays in the tooltip). */
function compactUptime(raw: string): string {
  const s = raw.replace(/^up\s+/i, '').trim();
  const units: Array<[RegExp, string]> = [
    [/(\d+)\s*years?/i, 'y'],
    [/(\d+)\s*weeks?/i, 'w'],
    [/(\d+)\s*days?/i, 'd'],
    [/(\d+)\s*hours?/i, 'h'],
    [/(\d+)\s*min(?:ute)?s?/i, 'm'],
  ];
  const parts = units.flatMap(([re, unit]) => {
    const m = s.match(re);
    return m ? [`${m[1]}${unit}`] : [];
  });
  return parts.length > 0 ? parts.join(' ') : s;
}
