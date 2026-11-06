// M15.15: Help in Control Center, where someone stuck before signing in is looking
// @see docs/phases/phase-15.md

import { BookOpen, Bug, CircleHelp, FileText, LifeBuoy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { desktopOpenLogs } from '../../lib/api';
import { DOCS_URL, REPORT_ISSUE_URL, TROUBLESHOOTING_URL } from '../../lib/help-links';

const open = (url: string) => window.open(url, '_blank', 'noreferrer');

export function HelpMenu() {
  const openLogs = desktopOpenLogs();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="glass-heavy flex h-9 items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-semibold transition-colors hover:bg-mat-thick"
          data-testid="cc-help"
        >
          <CircleHelp className="h-4 w-4" strokeWidth={1.75} />
          <span>Help</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={() => open(DOCS_URL)} data-testid="cc-help-docs">
          <BookOpen strokeWidth={1.75} />
          Documentation
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(TROUBLESHOOTING_URL)} data-testid="cc-help-troubleshooting">
          <LifeBuoy strokeWidth={1.75} />
          Troubleshooting
        </DropdownMenuItem>
        {openLogs && (
          <DropdownMenuItem onSelect={() => void openLogs()} data-testid="cc-help-open-log">
            <FileText strokeWidth={1.75} />
            Open log
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open(REPORT_ISSUE_URL)} data-testid="cc-help-report">
          <Bug strokeWidth={1.75} />
          Report an issue
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
