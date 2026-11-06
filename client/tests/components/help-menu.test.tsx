// M15.15: Help in Control Center reaches the docs and the log before anyone signs in
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpMenu } from '../../src/components/ControlCenter/HelpMenu';

type Bridge = { electronAPI?: { openLogs?: () => Promise<void> } };

const opened = vi.fn();

function openMenu() {
  render(<HelpMenu />);
  fireEvent.keyDown(screen.getByTestId('cc-help'), { key: 'Enter' });
}

beforeEach(() => {
  opened.mockReset();
  vi.spyOn(window, 'open').mockImplementation(opened as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Bridge).electronAPI;
});

describe('Help in Control Center', () => {
  it.each([
    ['cc-help-docs', 'https://headlessos.com/docs/introduction'],
    ['cc-help-troubleshooting', 'https://headlessos.com/docs/troubleshooting'],
    ['cc-help-report', 'https://github.com/abhee235/headlessos/issues'],
  ])('%s opens the page in the browser', async (id, url) => {
    openMenu();
    fireEvent.click(await screen.findByTestId(id));
    expect(opened).toHaveBeenCalledWith(url, '_blank', 'noreferrer');
  });

  it('opens the log in the desktop app', async () => {
    const openLogs = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Bridge).electronAPI = { openLogs };
    openMenu();
    fireEvent.click(await screen.findByTestId('cc-help-open-log'));
    expect(openLogs).toHaveBeenCalledOnce();
  });

  it('offers no log in a browser', async () => {
    openMenu();
    await screen.findByTestId('cc-help-docs');
    expect(screen.queryByTestId('cc-help-open-log')).toBeNull();
  });
});
