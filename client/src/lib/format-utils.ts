// EX3-A.6: Value formatting utilities for chart axes and tooltips
// @see docs/phases/phase-ex3.md

export type UnitType = 'bytes' | 'percent' | 'duration' | 'count' | 'custom';

/**
 * Format a numeric value with the given unit type.
 *
 * - bytes: converts to KB/MB/GB/TB (binary: 1024-based)
 * - percent: appends '%'
 * - duration: converts seconds to s/m/h/d
 * - count: converts to K/M/B with 1 decimal
 * - custom: appends `customUnit` string
 */
export function formatUnit(
  value: number,
  unit?: UnitType | null,
  customUnit?: string | null,
): string {
  if (unit == null) return String(value);

  switch (unit) {
    case 'bytes':
      return formatBytes(value);
    case 'percent':
      return `${value}%`;
    case 'duration':
      return formatDuration(value);
    case 'count':
      return formatCount(value);
    case 'custom':
      return customUnit ? `${value}${customUnit}` : String(value);
    default:
      return String(value);
  }
}

/** Format bytes as human-readable string (1024-based) */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), units.length - 1);
  const val = abs / Math.pow(1024, i);
  return `${sign}${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format seconds as human-readable duration */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/** Format large counts with K/M/B suffixes */
function formatCount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs < 1000) return `${sign}${abs}`;
  if (abs < 1_000_000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  if (abs < 1_000_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
}
