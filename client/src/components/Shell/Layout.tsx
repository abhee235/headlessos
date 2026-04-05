// M1.8: Shell Layout — main layout composing sidebar + tabs + terminal
// @see docs/phases/phase-1.md

import { Sidebar } from './Sidebar';
import { TabContainer } from './TabContainer';
import { TerminalPanel } from './TerminalPanel';

export function Layout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TabContainer />
        <TerminalPanel />
      </div>
    </div>
  );
}
