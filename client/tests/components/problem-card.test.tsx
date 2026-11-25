// M15.14: a failed sign-in explains itself and leads to the docs and the log
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProblemCard } from '../../src/components/Login/ProblemCard';

type Bridge = { electronAPI?: { openLogs?: () => Promise<void> } };

const failure = {
  title: 'Nothing is answering at 127.0.0.1:2222',
  hint: 'The server may be off, or SSH may use another port.',
  detail: 'connect ECONNREFUSED 127.0.0.1:2222',
  help: 'connection-refused',
};

afterEach(() => {
  delete (window as unknown as Bridge).electronAPI;
});

describe('ProblemCard', () => {
  it('says what happened, what to try and the exact error', () => {
    render(<ProblemCard failure={failure} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing is answering at 127.0.0.1:2222');
    expect(screen.getByRole('alert')).toHaveTextContent('The server may be off');
    expect(screen.getByTestId('problem-detail')).toHaveTextContent('connect ECONNREFUSED 127.0.0.1:2222');
  });

  it('links to the matching Troubleshooting section, in the browser', () => {
    render(<ProblemCard failure={failure} />);
    const link = screen.getByTestId('problem-help');
    expect(link).toHaveAttribute('href', 'https://headlessos.com/docs/troubleshooting#connection-refused');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('copies the exact error', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ProblemCard failure={failure} />);
    fireEvent.click(screen.getByTestId('problem-copy'));
    expect(writeText).toHaveBeenCalledWith('connect ECONNREFUSED 127.0.0.1:2222');
    await waitFor(() => expect(screen.getByLabelText('Copied')).toBeInTheDocument());
  });

  it('leaves out what a failure does not have', () => {
    render(<ProblemCard failure={{ title: "This server's saved key can't be read", help: 'ssh-key-problems' }} />);
    expect(screen.queryByTestId('problem-detail')).toBeNull();
    expect(screen.queryByTestId('problem-copy')).toBeNull();
  });

  it('opens the log in the desktop app', () => {
    const openLogs = vi.fn().mockResolvedValue(undefined);
    (window as unknown as Bridge).electronAPI = { openLogs };
    render(<ProblemCard failure={failure} />);
    fireEvent.click(screen.getByTestId('problem-open-log'));
    expect(openLogs).toHaveBeenCalledOnce();
  });

  it('offers no log in a browser, which has none', () => {
    render(<ProblemCard failure={failure} />);
    expect(screen.queryByTestId('problem-open-log')).toBeNull();
  });
});

// M17.8: on a Mac, a connection kept off the local network opens the setting
describe('ProblemCard for a connection kept off the local network', () => {
  const blocked = {
    title: "Can't reach 192.168.1.20",
    hint: 'macOS may be keeping HeadlessOS off your local network. Allow it in System Settings → Privacy & Security → Local Network.',
    detail: 'connect EHOSTUNREACH 192.168.1.20:22',
    help: 'local-network-access-on-macos',
  };
  type MacBridge = { electronAPI?: { openLocalNetworkSettings?: () => Promise<void> } };

  it('opens Privacy & Security in the Mac app', () => {
    const openLocalNetworkSettings = vi.fn().mockResolvedValue(undefined);
    (window as unknown as MacBridge).electronAPI = { openLocalNetworkSettings };
    render(<ProblemCard failure={blocked} />);
    const button = screen.getByTestId('problem-open-settings');
    expect(button).toHaveTextContent('Open Privacy & Security');
    fireEvent.click(button);
    expect(openLocalNetworkSettings).toHaveBeenCalledOnce();
  });

  it('offers it for no other failure', () => {
    (window as unknown as MacBridge).electronAPI = { openLocalNetworkSettings: vi.fn() };
    render(<ProblemCard failure={failure} />);
    expect(screen.queryByTestId('problem-open-settings')).toBeNull();
  });

  it('offers it nowhere but the Mac app', () => {
    render(<ProblemCard failure={blocked} />);
    expect(screen.queryByTestId('problem-open-settings')).toBeNull();
  });
});
