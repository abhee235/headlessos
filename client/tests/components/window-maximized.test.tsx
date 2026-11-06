// EX8.31: a maximized window fills the screen below the menu bar, whichever side the dock is on
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { WindowFrame } from '../../src/components/Desktop/Window';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { TOP_RESERVE, useDesktopStore } from '../../src/store/window-store';
import { usePreferencesStore, type DockPosition } from '../../src/store/preferences-store';

function maximized(position: DockPosition) {
  act(() => {
    usePreferencesStore.setState({ dockPosition: position });
    useDesktopStore.setState({ windows: [] });
    useDesktopStore.getState().openWindow('files', 's1', 'File Explorer', 'files');
    const { windows, maximizeWindow } = useDesktopStore.getState();
    maximizeWindow(windows[0]!.id);
  });
  const win = useDesktopStore.getState().windows[0]!;
  const { container } = render(
    <TooltipProvider>
      <WindowFrame win={win}><div /></WindowFrame>
    </TooltipProvider>,
  );
  return (container.firstElementChild as HTMLElement).style;
}

beforeEach(() => act(() => useDesktopStore.setState({ windows: [] })));

describe('a maximized window', () => {
  it.each(['bottom', 'right'] as const)('fills the screen with the dock at the %s', (position) => {
    const style = maximized(position);
    expect(style.top).toBe(`${TOP_RESERVE}px`);
    expect(style.left).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.bottom).toBe('0px');
  });
});
