// M17.8: a reconnect kept off the local network on a Mac opens the setting
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ connectServer: vi.fn() }));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});

import { DisconnectedState } from '../../src/components/ui/disconnected-state';

type MacBridge = { electronAPI?: { openLocalNetworkSettings?: () => Promise<void> } };

const blocked = { title: "Can't reach 192.168.0.213", detail: 'connect EHOSTUNREACH 192.168.0.213:22', help: 'local-network-access-on-macos' };
const refused = { title: 'Nothing is answering at 10.0.0.5:22', detail: 'connect ECONNREFUSED 10.0.0.5:22', help: 'connection-refused' };

// In braces: a hook that returns a function has it run as cleanup, and this one throws
beforeEach(() => {
  api.connectServer.mockReset();
});
afterEach(() => {
  delete (window as unknown as MacBridge).electronAPI;
});

describe('DisconnectedState', () => {
  it('offers Privacy & Security on a Mac when the reconnect was kept off the local network', async () => {
    const openLocalNetworkSettings = vi.fn().mockResolvedValue(undefined);
    (window as unknown as MacBridge).electronAPI = { openLocalNetworkSettings };
    api.connectServer.mockImplementation(async () => { throw Object.assign(new Error(blocked.title), { failure: blocked }); });
    render(<DisconnectedState serverId="pi" />);

    fireEvent.click(screen.getByText('Reconnect'));
    fireEvent.click(await screen.findByTestId('disconnected-open-settings'));

    expect(openLocalNetworkSettings).toHaveBeenCalledOnce();
    expect(screen.getByText(blocked.title)).toBeInTheDocument();
  });

  it('offers nothing more for another failure', async () => {
    (window as unknown as MacBridge).electronAPI = { openLocalNetworkSettings: vi.fn() };
    api.connectServer.mockImplementation(async () => { throw Object.assign(new Error(refused.title), { failure: refused }); });
    render(<DisconnectedState serverId="vps" />);

    fireEvent.click(screen.getByText('Reconnect'));

    expect(await screen.findByText(refused.title)).toBeInTheDocument();
    expect(screen.queryByTestId('disconnected-open-settings')).toBeNull();
  });
});
