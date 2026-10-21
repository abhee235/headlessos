// EX6-C.8: Branded Loading Spinner Rollout
// EX8.25: viewBox cropped to the mark; 16px minimum
import { cn } from '@/lib/utils';

type SpinnerProps = {
  className?: string;
  size?: number;
};

/**
 * Branded loader: ring + "H" glyph remain static; only the orbit group
 * (trailing arc + leading dot) spins around the centre, matching the
 * locked Ring-Tick H mark.
 *
 * EX8.25: the viewBox is cropped to the mark (ring + orbit dot reach 20.2
 * units from the centre), so `size` is the size you see. The old 0 0 64 64
 * box drew the mark at 61%: a 16px spinner showed a 10px mark. Sizes:
 * 16 inline (buttons, rows), 18 next to a status label, 40 for a panel
 * (LoadingView). `min-h-4 min-w-4` keeps any caller at 16px or more.
 */
export function Spinner({ className, size = 18 }: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="11.5 11.5 41 41"
      width={size}
      height={size}
      className={cn('inline-block min-h-4 min-w-4 align-middle', className)}
      aria-hidden="true"
      role="img"
    >
      {/* Static base ring */}
      <circle
        cx="32"
        cy="32"
        r="18"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2.5"
      />
      {/* Static H glyph */}
      <g fill="currentColor" opacity="0.96">
        <rect x="24" y="23" width="3" height="18" rx="1" />
        <rect x="37" y="23" width="3" height="18" rx="1" />
        <rect x="24" y="30.5" width="16" height="3" rx="1" />
      </g>
      {/* Spinning orbit */}
      <g className="hos-spinner-orbit" style={{ transformOrigin: '32px 32px' }}>
        <path
          d="M 44.73 44.73 A 18 18 0 1 1 44.73 19.27"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="44.73" cy="19.27" r="2.2" fill="currentColor" />
      </g>
      <style>{`
        .hos-spinner-orbit {
          animation: hos-spinner-rotate 1.1s linear infinite;
        }
        @keyframes hos-spinner-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
