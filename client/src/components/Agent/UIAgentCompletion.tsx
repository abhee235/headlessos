// EX10.4: UI Agent completion summary — a finished view, or one that stopped early and why
// @see docs/phases/phase-ex10.md §5

import { AlertTriangle, Sparkles } from 'lucide-react';
import type { AgentMetaType } from './AgentPanel';

export function UIAgentCompletion({ meta }: { meta: AgentMetaType }) {
  const incomplete = meta.incomplete;
  const timing = (
    <>
      Completed in {((meta.latencyMs ?? 0) / 1000).toFixed(1)}s
      {' · '}
      {meta.stepsCompleted} step{meta.stepsCompleted !== 1 ? 's' : ''}
      {meta.reflectionLoops > 0 && (
        <> · {meta.reflectionLoops} reflection{meta.reflectionLoops !== 1 ? 's' : ''}</>
      )}
      {' · '}View is open in a desktop window
    </>
  );

  if (incomplete) {
    const empty = incomplete.emptySections;
    return (
      <div className="space-y-4">
        <div
          className="space-y-1.5 rounded-[18px] border border-warning/30 bg-warning/10 px-4 py-3"
          data-testid="ui-agent-incomplete"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-warning">View Partly Generated</span>
          </div>
          <p className="text-xs text-label-2">
            Stopped early: {incomplete.reason}.
            {empty.length > 0 && <> Still empty: {empty.join(', ')}.</>}
          </p>
          <p className="text-xs text-label-2">{timing}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 rounded-[18px] border border-success/30 bg-success/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-success" strokeWidth={1.75} />
          <span className="text-sm font-semibold text-success">
            View Generated
          </span>
        </div>
        <p className="text-xs text-label-2">{timing}</p>
      </div>
    </div>
  );
}
