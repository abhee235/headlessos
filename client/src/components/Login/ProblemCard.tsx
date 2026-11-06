// M15.14: a problem the owner can act on. What happened, what to try, the exact error to
// search for, and the way to the docs and the log.
// @see docs/phases/phase-15.md

import { useState } from 'react';
import { AlertCircle, Check, Copy, ExternalLink, FileText } from 'lucide-react';
import type { ConnectFailure } from 'headlessos-shared';
import { Button } from '@/components/ui/button';
import { desktopOpenLogs } from '../../lib/api';
import { troubleshootingSection } from '../../lib/help-links';

export function ProblemCard({ failure }: { failure: ConnectFailure }) {
  const openLogs = desktopOpenLogs();
  const [copied, setCopied] = useState(false);

  const copyDetail = async () => {
    await navigator.clipboard.writeText(failure.detail ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div role="alert" data-testid="problem-card" className="glass-heavy w-[380px] max-w-full rounded-[20px] p-4 select-text">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="break-words text-[14px] font-semibold leading-5">{failure.title}</p>
          {failure.hint && <p className="mt-1 text-[13px] leading-[18px] text-label-2">{failure.hint}</p>}
        </div>
      </div>

      {failure.detail && (
        <div className="mt-3 flex items-center gap-1 rounded-[12px] bg-fill pl-3">
          <code data-testid="problem-detail" className="min-w-0 flex-1 break-words py-2 font-mono text-[12px] leading-4 text-label-2">
            {failure.detail}
          </code>
          <Button
            size="icon"
            variant="ghost"
            aria-label={copied ? 'Copied' : 'Copy error'}
            onClick={() => void copyDetail()}
            className="shrink-0"
            data-testid="problem-copy"
          >
            {copied ? <Check className="text-success" strokeWidth={1.75} /> : <Copy strokeWidth={1.75} />}
          </Button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button asChild size="sm" variant="secondary">
          <a href={troubleshootingSection(failure.help)} target="_blank" rel="noreferrer" data-testid="problem-help">
            How to fix this
            <ExternalLink strokeWidth={1.75} />
          </a>
        </Button>
        {openLogs && (
          <Button size="sm" variant="ghost" onClick={() => void openLogs()} data-testid="problem-open-log">
            <FileText strokeWidth={1.75} />
            Open log
          </Button>
        )}
      </div>
    </div>
  );
}
