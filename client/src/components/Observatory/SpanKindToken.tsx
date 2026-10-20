// Phoenix-style SpanKindToken — pill badge with auto-derived colors
// EX8.6: Lumen badge recipe (radius 6px, ~14% tint, ~30% border), works in light + dark
// @see temp/phoenix/app/src/components/trace/SpanKindToken.tsx

import { getSpanKindTokenColor } from './constants';

interface SpanKindTokenProps {
  kind: string;
  size?: 'S' | 'M' | 'L';
  className?: string;
}

const SIZE_MAP = {
  S: 'h-4 text-[10px]',
  M: 'h-5 text-[11px]',
  L: 'h-6 text-xs',
} as const;

/**
 * Token badge that derives bg/border/text from a single kind colour with
 * color-mix(), following the Lumen status-badge recipe:
 *   bg:     kind colour at 14%
 *   border: kind colour at 30%
 *   text:   kind colour mixed toward the label colour (lighter in dark, darker in light)
 */
export function SpanKindToken({ kind, size = 'M', className = '' }: SpanKindTokenProps) {
  const baseColor = getSpanKindTokenColor(kind);
  const sizeClass = SIZE_MAP[size];

  return (
    <span
      className={`phoenix-token inline-flex items-center rounded-[6px] border px-1.5 font-semibold select-none ${sizeClass} ${className}`}
      style={{
        '--internal-token-color': baseColor,
        backgroundColor: `color-mix(in srgb, ${baseColor} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${baseColor} 30%, transparent)`,
        color: `color-mix(in srgb, ${baseColor} 62%, var(--lumen-label))`,
      } as React.CSSProperties}
    >
      <span className="truncate">{kind.toLowerCase()}</span>
    </span>
  );
}
