// EX6-C.8: Branded Loading Spinner Rollout
import { cn } from '@/lib/utils';

type SpinnerProps = {
  className?: string;
  size?: number;
};

/**
 * Branded loader: ring + "H" glyph remain static; only the orbit group
 * (trailing arc + leading dot) spins around the centre, matching the
 * locked Ring-Tick H mark.
 */
export function Spinner({ className, size = 16 }: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn('inline-block align-middle', className)}
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
