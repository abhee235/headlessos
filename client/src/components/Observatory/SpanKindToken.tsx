// Phoenix-style SpanKindToken — pill badge with auto-derived colors via lch()
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
 * Phoenix-style token badge that uses CSS lch() color functions
 * to auto-derive bg/border/text from a single base color.
 *
 * Dark theme formula (from Phoenix):
 *   bg:     lch(from <color> 18 calc(c * 0.2) h)
 *   border: lch(from <color> 28 calc(c * 0.3) h)
 *   text:   lch(from <color> 90 calc(c * 0.8) h)
 */
export function SpanKindToken({ kind, size = 'M', className = '' }: SpanKindTokenProps) {
  const baseColor = getSpanKindTokenColor(kind);
  const sizeClass = SIZE_MAP[size];

  return (
    <span
      className={`phoenix-token inline-flex items-center rounded-full px-2 font-medium select-none ${sizeClass} ${className}`}
      style={{
        '--internal-token-color': baseColor,
        backgroundColor: `lch(from ${baseColor} 18 calc(c * 0.2) h)`,
        borderColor: `lch(from ${baseColor} 28 calc(c * 0.3) h)`,
        color: `lch(from ${baseColor} 90 calc(c * 0.8) h)`,
        borderWidth: '1px',
        borderStyle: 'solid',
      } as React.CSSProperties}
    >
      <span className="truncate">{kind.toLowerCase()}</span>
    </span>
  );
}
