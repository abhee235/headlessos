// EX8.28: a server list that fails to load is not "no servers"
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const fetchServers = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, fetchServers };
});

import { LoginScreen } from '../../src/components/Login/LoginScreen';
import { useAppStore } from '../../src/store/app-store';

const server = { id: 's1', name: 'Prod', host: '10.0.0.5', port: 22, username: 'u', authMethod: 'password', state: null };
const down = () => Promise.reject(new Error('Request failed: 500'));

beforeEach(() => {
  fetchServers.mockReset();
  useAppStore.setState({ servers: [], activeServerId: null, loadingServers: false, serversError: null });
});
afterEach(() => vi.useRealTimers());

describe('server list load', () => {
  it('keeps the last list and records the error when a refresh fails', async () => {
    fetchServers.mockResolvedValueOnce([server]).mockImplementationOnce(down).mockResolvedValueOnce([server]);
    await useAppStore.getState().fetchServers();
    await useAppStore.getState().fetchServers();
    expect(useAppStore.getState().servers).toHaveLength(1);
    expect(useAppStore.getState().serversError).toBe('Request failed: 500');
    await useAppStore.getState().fetchServers();
    expect(useAppStore.getState().serversError).toBeNull();
  });

  it('says the list could not load, not that there are no servers, and Retry brings it back', async () => {
    fetchServers.mockImplementationOnce(down).mockResolvedValueOnce([server]);
    await act(async () => { render(<LoginScreen embedded />); });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your saved servers");
    expect(screen.getByRole('alert')).toHaveAttribute('title', 'Request failed: 500');
    expect(screen.queryByText(/No servers configured yet/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Prod')).toBeInTheDocument();
  });

  it('tries again every 3 s on its own until the backend answers', async () => {
    vi.useFakeTimers();
    fetchServers.mockImplementationOnce(down).mockImplementationOnce(down).mockResolvedValueOnce([server]);
    await act(async () => { render(<LoginScreen embedded />); });
    expect(fetchServers).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchServers).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchServers).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Prod')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(fetchServers).toHaveBeenCalledTimes(3);
  });

  it('still says "No servers configured yet" after a load that worked and returned none', async () => {
    fetchServers.mockResolvedValueOnce([]);
    await act(async () => { render(<LoginScreen embedded />); });
    expect(screen.getByText(/No servers configured yet/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
