// EX1.12: DynamicViewContext — provides serverId to widget tree for refresh
// @see docs/phases/phase-ex1.md

import { createContext, useContext } from 'react';

interface DynamicViewContextValue {
  /** The server ID this dynamic view is rendered against */
  serverId: string | null;
}

const DynamicViewContext = createContext<DynamicViewContextValue>({
  serverId: null,
});

export function DynamicViewProvider({
  serverId,
  children,
}: {
  serverId: string | null;
  children: React.ReactNode;
}) {
  return (
    <DynamicViewContext.Provider value={{ serverId }}>
      {children}
    </DynamicViewContext.Provider>
  );
}

export function useDynamicViewContext() {
  return useContext(DynamicViewContext);
}
