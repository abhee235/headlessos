// EX9.2: generated view buttons run catalog actions; changes wait on an approval card
// @see docs/phases/phase-ex9.md §7, docs/DECISIONS.md (ADR-024)
//
// action ref  → preview → read: run now · change: ApprovalCard → Allow runs the
//               command the server recorded at preview; Deny drops it
// legacy command → the old /dynamic-ui/execute-action path (the server only
//               lets it read)

import { useCallback, useRef, useState } from 'react';
import type { z } from 'zod';
import { toast } from 'sonner';
import type { WidgetActionSchema } from 'headlessos-shared/schemas/dynamic-view';
import {
  denyViewAction, executeWidgetAction, previewViewAction, runViewAction,
  type ApprovalRequest,
} from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { ApprovalCard } from '@/components/Agent/ApprovalCard';

type WidgetAction = z.infer<typeof WidgetActionSchema>;

/** Replace {column} placeholders in each param with the row's value. */
export function fillParams(
  params: Record<string, string> | null | undefined,
  row: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(params ?? {})) {
    out[key] = template.replace(/\{([^{}]+)\}/g, (whole, column: string) =>
      column in row ? (row[column] == null ? '' : String(row[column])) : whole);
  }
  return out;
}

function rowParams(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? '' : String(v)]));
}

function report(label: string, ok: boolean, detail?: string) {
  if (ok) toast.success(`${label}: completed`, { description: detail?.substring(0, 100) || undefined });
  else toast.error(`${label}: failed`, { description: detail });
}

/**
 * Run a table action. Returns `run(action, row)`, whether something is running,
 * and the approval dialog to render.
 */
export function useViewAction(serverId: string | null | undefined) {
  const [executing, setExecuting] = useState(false);
  const [pending, setPending] = useState<{ request: ApprovalRequest; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const answered = useRef(false);

  const run = useCallback(async (action: WidgetAction, row: Record<string, unknown>) => {
    if (!serverId) {
      toast.error('No server connected');
      return;
    }
    setExecuting(true);
    try {
      if (action.action) {
        const params = fillParams(action.action.params, row);
        const preview = await previewViewAction(serverId, action.action.id, params, action.label);
        if (preview.risk === 'change') {
          answered.current = false;
          setPending({ request: preview.approval, label: action.label });
          return;
        }
        const result = await runViewAction(serverId, { actionId: action.action.id, params });
        report(action.label, result.success, result.success ? result.output : result.error);
      } else if (action.command) {
        const result = await executeWidgetAction(serverId, action.command, rowParams(row));
        report(action.label, result.success, result.success ? result.output : result.error);
      } else {
        toast.error(`${action.label}: this button has nothing to run`);
      }
    } catch (err) {
      report(action.label, false, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExecuting(false);
    }
  }, [serverId]);

  const decide = useCallback(async (decision: 'allow' | 'deny') => {
    if (!pending || !serverId || answered.current) return;
    answered.current = true; // Esc, the X and Deny can all fire; answer once
    const { request, label } = pending;
    setBusy(true);
    try {
      if (decision === 'allow') {
        const result = await runViewAction(serverId, { approvalId: request.approvalId });
        report(label, result.success, result.success ? result.output : result.error);
      } else {
        await denyViewAction(serverId, request.approvalId).catch(() => {});
        toast.info(`${label}: not run`);
      }
    } catch (err) {
      report(label, false, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [pending, serverId]);

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) void decide('deny'); }}>
      <DialogContent className="max-w-lg" onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}>
        <VisuallyHidden>
          <DialogTitle>Allow this change?</DialogTitle>
          <DialogDescription>{pending?.request.command}</DialogDescription>
        </VisuallyHidden>
        {pending && (
          <ApprovalCard
            request={pending.request}
            status="pending"
            busy={busy}
            variant="bare"
            onDecide={(d) => void decide(d)}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  return { run, executing: executing || busy, dialog };
}
