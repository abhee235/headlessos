// M16.4: Settings says where the key to saved logins is held, and the sign-in screen says when it's locked
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ fetchServers: vi.fn(), fetchServerNotice: vi.fn() }));
vi.mock('../../src/lib/api', async (orig) => {
  const actual = await orig<typeof import('../../src/lib/api')>();
  return { ...actual, ...api };
});

import { GlobalSettingsSection } from '../../src/components/ControlCenter/GlobalSettingsSection';
import { LoginScreen } from '../../src/components/Login/LoginScreen';
import { useAppStore } from '../../src/store/app-store';

const notice = (secretStore: string, locked: unknown = null) => ({ damagedList: null, locked, secretStore });
const server = { id: 's1', name: 'Prod', host: '10.0.0.5', port: 22, username: 'u', authMethod: 'password', state: null };
const locked = { title: 'Your saved logins are locked', hint: 'Quit HeadlessOS and open it again.', help: 'saved-logins-are-locked' };

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.fetchServers.mockResolvedValue([server]);
  useAppStore.setState({ servers: [], activeServerId: null, loadingServers: false, serversError: null });
});

describe('Saved logins in Global Settings', () => {
  it.each([
    ['keychain', "this computer's keychain"],
    ['file', 'in a file in the .headlessos folder'],
    ['locked', 'locked'],
  ])('describes %s', async (store, text) => {
    api.fetchServerNotice.mockResolvedValue(notice(store));
    render(<GlobalSettingsSection />);
    expect(await screen.findByTestId('cc-secret-store')).toHaveTextContent(text);
  });

  it('leaves the row out if the backend does not answer', async () => {
    api.fetchServerNotice.mockRejectedValue(new Error('no backend'));
    render(<GlobalSettingsSection />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('cc-secret-store')).toBeNull();
  });
});

describe('the sign-in screen', () => {
  it('shows the locked card above a list that still has its servers', async () => {
    api.fetchServerNotice.mockResolvedValue(notice('locked', locked));
    render(<LoginScreen embedded />);
    expect(await screen.findByTestId('problem-card')).toHaveTextContent('Your saved logins are locked');
    expect(screen.getByTestId('problem-help')).toHaveAttribute('href', expect.stringContaining('#saved-logins-are-locked'));
    expect(await screen.findByTestId('server-avatar-s1')).toBeInTheDocument();
  });

  it('shows nothing extra when logins open', async () => {
    api.fetchServerNotice.mockResolvedValue(notice('keychain'));
    render(<LoginScreen embedded />);
    await screen.findByTestId('server-avatar-s1');
    expect(screen.queryByTestId('problem-card')).toBeNull();
  });
});
