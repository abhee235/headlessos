// EX9.2: Approval card — nothing changes a server until the owner allows it
// @see docs/phases/phase-ex9.md §7, docs/DECISIONS.md (ADR-024)
//
// Pending: the full command, the server, the login user and the reason, with
// Allow once (focused, Enter) and Deny (Esc). Settled: one line saying what
// happened. There is no "always allow".

import { useEffect, useRef } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '@/lib/api';
import { BUBBLE_CLASS } from './agent-ui';

export type ApprovalStatus = 'pending' | 'allowed' | 'denied' | 'stopped' | 'expired';

interface ApprovalCardProps {
  request: ApprovalRequest;
  status: ApprovalStatus;
  onDecide?: (decision: 'allow' | 'deny') => void;
  /** an answer is on its way to the server */
  busy?: boolean;
  /** focus "Allow once" when the card appears (default true) */
  autoFocus?: boolean;
  /** 'bare' drops the bubble surface, for use inside a dialog (which has its own close button) */
  variant?: 'inline' | 'bare';
  className?: string;
}

const SETTLED: Record<Exclude<ApprovalStatus, 'pending'>, { text: string; icon: typeof CheckCircle2; tone: string }> = {
  allowed: { text: 'You allowed', icon: CheckCircle2, tone: 'text-success' },
  denied: { text: 'You denied', icon: XCircle, tone: 'text-danger' },
  stopped: { text: 'Stopped before an answer', icon: XCircle, tone: 'text-label-3' },
  expired: { text: 'Not answered in time', icon: XCircle, tone: 'text-label-3' },
};

export function ApprovalCard({
  request, status, onDecide, busy = false, autoFocus = true, variant = 'inline', className,
}: ApprovalCardProps) {
  const allowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (status === 'pending' && autoFocus) allowRef.current?.focus({ preventScroll: true });
  }, [status, autoFocus]);

  if (status !== 'pending') {
    const s = SETTLED[status];
    const Icon = s.icon;
    return (
      <div
        className={cn(BUBBLE_CLASS, 'flex items-center gap-2 px-3.5 py-2.5', className)}
        data-testid="approval-settled"
      >
        <Icon className={cn('h-4 w-4 shrink-0', s.tone)} strokeWidth={1.75} />
        <span className="shrink-0 text-[13px] text-label-2">{s.text}:</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{request.command}</code>
      </div>
    );
  }

  const server = request.host && request.host !== request.serverName
    ? `${request.serverName} (${request.host})`
    : request.serverName;

  return (
    <div
      role="alertdialog"
      aria-label={`Allow ${request.title}?`}
      aria-describedby={`approval-cmd-${request.approvalId}`}
      className={cn(variant === 'inline' ? cn(BUBBLE_CLASS, 'border-warning/40 p-4') : '', 'space-y-3', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) {
          e.stopPropagation();
          onDecide?.('deny');
        }
      }}
    >
      <div className={cn('flex items-center gap-2.5', variant === 'bare' && 'pr-9')}>
        <ShieldAlert className="h-[18px] w-[18px] shrink-0 text-warning" strokeWidth={1.75} />
        <p className="text-[15px] font-bold leading-tight">Allow this change?</p>
        <span className="ml-auto truncate text-xs text-label-2">{request.title}</span>
      </div>

      <pre
        id={`approval-cmd-${request.approvalId}`}
        className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-[14px] border border-edge bg-paper px-3 py-2.5 font-mono text-[13px] text-foreground"
      >
        {request.command}
      </pre>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-label-3">Server</dt>
        <dd className="min-w-0 truncate text-foreground">{server}</dd>
        <dt className="text-label-3">Runs as</dt>
        <dd className="min-w-0 truncate font-mono text-foreground">{request.loginUser || 'the SSH login user'}</dd>
        <dt className="text-label-3">Reason</dt>
        <dd className="min-w-0 text-foreground">{request.reason}</dd>
      </dl>

      <div className="flex items-center gap-2">
        <span className="mr-auto text-[11px] text-label-3">Enter allows · Esc denies</span>
        {busy && <Spinner className="h-4 w-4 text-accent-solid" />}
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDecide?.('deny')}>
          Deny
        </Button>
        <Button ref={allowRef} size="sm" disabled={busy} onClick={() => onDecide?.('allow')}>
          Allow once
        </Button>
      </div>
    </div>
  );
}
