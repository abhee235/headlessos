// EX8.31: a maximized window fills the screen below the menu bar. With the dock on the right it
// stops short of the edge, so its scrollbar isn't under the dock's handle.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { WindowFrame } from '../../src/components/Desktop/Window';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { DOCK_HANDLE_DEPTH, TOP_RESERVE, useDesktopStore } from '../../src/store/window-store';
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
  it.each([
    ['bottom', 0],
    ['right', DOCK_HANDLE_DEPTH],
  ] as const)('with the dock at the %s, leaves %d px on the right', (position, right) => {
    const style = maximized(position);
    expect(style.top).toBe(`${TOP_RESERVE}px`);
    expect(style.left).toBe('0px');
    expect(style.right).toBe(`${right}px`);
    expect(style.bottom).toBe('0px');
  });
});
