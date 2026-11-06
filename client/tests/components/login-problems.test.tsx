// M15.14, M15.16, M15.17: what the sign-in screen shows when something is wrong
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchServers: vi.fn(),
  connectServer: vi.fn(),
  fetchServerNotice: vi.fn(),
}));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});

import { LoginScreen } from '../../src/components/Login/LoginScreen';
import { useAppStore } from '../../src/store/app-store';

const passwordServer = { id: 'p1', name: 'Local Ubuntu Dev', host: '127.0.0.1', port: 2222, username: 'testuser', authMethod: 'password', state: null };
const keyServer = { id: 'k1', name: 'VPS', host: '10.0.0.5', port: 22, username: 'root', authMethod: 'privateKey', state: null };

const refused = {
  title: 'Nothing is answering at 127.0.0.1:2222',
  hint: 'The server may be off, or SSH may use another port.',
  detail: 'connect ECONNREFUSED 127.0.0.1:2222',
  help: 'connection-refused',
};

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.fetchServerNotice.mockResolvedValue({ damagedList: null });
  useAppStore.setState({ servers: [], activeServerId: null, loadingServers: false, serversError: null });
});

async function openServer(server: typeof passwordServer & { keyLost?: boolean }) {
  api.fetchServers.mockResolvedValue([server]);
  render(<LoginScreen embedded />);
  fireEvent.click(await screen.findByTestId(`server-avatar-${server.id}`));
}

describe('a failed sign-in', () => {
  it('shows the card with the failure the server sent', async () => {
    await openServer(passwordServer);
    api.connectServer.mockRejectedValue(Object.assign(new Error(refused.title), { failure: refused }));

    fireEvent.click(screen.getByLabelText('Sign in'));

    expect(await screen.findByTestId('problem-card')).toHaveTextContent(refused.title);
    expect(screen.getByTestId('problem-detail')).toHaveTextContent(refused.detail);
  });

  it('points to the backend section when the backend gave no answer', async () => {
    await openServer(passwordServer);
    api.connectServer.mockRejectedValue(Object.assign(new Error("HeadlessOS can't reach its own backend"), { cause: new TypeError('Failed to fetch') }));

    fireEvent.click(screen.getByLabelText('Sign in'));

    expect(await screen.findByTestId('problem-help')).toHaveAttribute('href', expect.stringContaining('#backend-errors'));
  });

  it('clears the card when you go back', async () => {
    await openServer(passwordServer);
    api.connectServer.mockRejectedValue(Object.assign(new Error(refused.title), { failure: refused }));
    fireEvent.click(screen.getByLabelText('Sign in'));
    await screen.findByTestId('problem-card');

    fireEvent.click(screen.getByText('Back'));

    await waitFor(() => expect(screen.queryByTestId('problem-card')).toBeNull());
  });
});

describe('M15.16: a saved key that is gone', () => {
  it('says so instead of "SSH key configured"', async () => {
    await openServer({ ...keyServer, keyLost: true });
    expect(await screen.findByText("Saved key can't be read")).toBeInTheDocument();
    expect(screen.queryByText('SSH key configured')).toBeNull();
  });

  it('keeps "SSH key configured" for a key that is there', async () => {
    await openServer(keyServer);
    expect(await screen.findByText('SSH key configured')).toBeInTheDocument();
  });
});

describe('M15.17: the empty server list', () => {
  it('names the kept file when the list was damaged', async () => {
    api.fetchServers.mockResolvedValue([]);
    api.fetchServerNotice.mockResolvedValue({ damagedList: 'servers.json.broken' });
    render(<LoginScreen embedded />);

    expect(await screen.findByTestId('problem-card')).toHaveTextContent('servers.json.broken');
    expect(screen.queryByText(/No servers configured yet/)).toBeNull();
  });

  it('stays the plain empty state on a new install', async () => {
    api.fetchServers.mockResolvedValue([]);
    render(<LoginScreen embedded />);

    expect(await screen.findByText(/No servers configured yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('problem-card')).toBeNull();
  });
});
