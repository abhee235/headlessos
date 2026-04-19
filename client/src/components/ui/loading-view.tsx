// EX6-C.8: Branded Loading Spinner Rollout — shared LoadingView
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

type LoadingViewProps = {
  /** Optional label shown below the spinner. Omit for icon-only. */
  label?: string;
  /** Spinner size in px. Defaults to 64 for full-screen states. */
  size?: number;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Fill parent height (default true). Set false for inline sections. */
  fullHeight?: boolean;
};

export function LoadingView({
  label,
  size = 64,
  className,
  fullHeight = true,
}: LoadingViewProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        fullHeight ? 'h-full' : 'py-10',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size={size} />
      {label && <span className="text-sm">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </div>
  );
}
