// M15.10: the store hands sign-in the real reason a connection failed, and never throws,
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
  it('resolves to the error message when the connection fails', async () => {
    vi.mocked(api.connectServer).mockRejectedValue(new Error('connect EHOSTUNREACH [ip]:22'));
    await expect(useAppStore.getState().connectServer('s1')).resolves.toBe('connect EHOSTUNREACH [ip]:22');
  });

  it('resolves to null when it connects', async () => {
    vi.mocked(api.connectServer).mockResolvedValue({ serverId: 's1', status: 'connected' } as never);
    await expect(useAppStore.getState().connectServer('s1')).resolves.toBeNull();
  });
});
