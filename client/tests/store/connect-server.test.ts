// M15.10, M15.14: the store hands sign-in the real reason a connection failed, and never throws,
// because most callers start a connection without waiting for it
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/api', async (original) => ({
  ...(await original<typeof import('../../src/lib/api')>()),
  connectServer: vi.fn(),
  fetchServers: vi.fn().mockResolvedValue([]),
}));

import * as api from '../../src/lib/api';
import { useAppStore } from '../../src/store/app-store';

beforeEach(() => {
  vi.mocked(api.connectServer).mockReset();
});

describe('connectServer', () => {
  it('resolves to the failure the backend sent', async () => {
    const failure = { title: "Can't reach 192.168.1.20", detail: 'connect EHOSTUNREACH 192.168.1.20:22', help: 'no-route-to-host' };
    vi.mocked(api.connectServer).mockRejectedValue(Object.assign(new Error(failure.title), { failure }));
    await expect(useAppStore.getState().connectServer('s1')).resolves.toEqual(failure);
  });

  it('points to the backend section when the backend gave no answer', async () => {
    vi.mocked(api.connectServer).mockRejectedValue(Object.assign(new Error('no backend'), { cause: new TypeError('Failed to fetch') }));
    await expect(useAppStore.getState().connectServer('s1')).resolves.toEqual({ title: 'no backend', help: 'backend-errors' });
  });

  it('falls back to the general section for any other error', async () => {
    vi.mocked(api.connectServer).mockRejectedValue(new Error('Server not found'));
    await expect(useAppStore.getState().connectServer('s1')).resolves.toEqual({ title: 'Server not found', help: 'a-server-wont-connect' });
  });

  it('resolves to null when it connects', async () => {
    vi.mocked(api.connectServer).mockResolvedValue({ serverId: 's1', status: 'connected' } as never);
    await expect(useAppStore.getState().connectServer('s1')).resolves.toBeNull();
  });
});
