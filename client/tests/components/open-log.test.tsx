// M15.4: Global Settings opens the log, and it is the only place to do so with no server connected
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSettingsSection } from '../../src/components/ControlCenter/GlobalSettingsSection';

type Bridge = { electronAPI?: { openLogs?: () => Promise<void> } };

afterEach(() => {
  delete (window as unknown as Bridge).electronAPI;
});

describe('Open log in Global Settings', () => {
  it('asks the desktop app to show the log', () => {
    const openLogs = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Bridge).electronAPI = { openLogs };

    render(<GlobalSettingsSection />);
    fireEvent.click(screen.getByTestId('cc-open-log'));

    expect(openLogs).toHaveBeenCalledOnce();
  });

  it('is not offered in a browser, which has no log file', () => {
    render(<GlobalSettingsSection />);
    expect(screen.queryByTestId('cc-open-log')).toBeNull();
  });
});
