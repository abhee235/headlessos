// M6.11: Login Screen — Windows 11-style server selection + credential entry
// EX8.5: LumenOS v3 sign-in — blurred wallpaper, 96px avatar ring, 52px raised
// pill password field with the 40px round submit inside it; shake + danger hint.
// M15.14, M15.16, M15.17: problems appear on a ProblemCard, with the way to the docs and the log
// @see docs/phases/phase-ex8.md
// @see docs/phases/phase-6.md

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app-store';
import { Wallpaper } from '../Desktop/Wallpaper';
import { ServerAvatar } from './ServerAvatar';
import { AddServerForm } from './AddServerForm';
import { ProblemCard } from './ProblemCard';
import { connectFailureOf, fetchServerNotice } from '../../lib/api';
import type { ConnectFailure } from 'headlessos-shared';
import { Server, Plus, ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

type LoginView = 'select' | 'credentials' | 'add-server';

interface LoginScreenProps {
  /** When true, skips the full-screen wallpaper + overlay (caller provides chrome). */
  embedded?: boolean;
}

export function LoginScreen({ embedded = false }: LoginScreenProps = {}) {
  const {
    servers,
    fetchServers,
    connectServer,
    setActiveServer,
    goToDesktop,
    addServer,
    loadingServers,
    serversError,
  } = useAppStore();

  const [view, setView] = useState<LoginView>('select');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [failure, setFailure] = useState<ConnectFailure | null>(null);
  const [damagedList, setDamagedList] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // EX8.28: the list failed to load (backend down or restarting): try again every 3 s
  const listFailed = !!serversError && servers.length === 0;
  useEffect(() => {
    if (!listFailed) return;
    const id = setInterval(() => { void fetchServers(); }, 3000);
    return () => clearInterval(id);
  }, [listFailed, fetchServers]);

  // M15.17: an empty list may be a damaged one, which isn't the same as a new install
  const listEmpty = servers.length === 0 && !loadingServers && !serversError;
  useEffect(() => {
    if (!listEmpty) return;
    let live = true;
    fetchServerNotice()
      .then(({ damagedList: file }) => { if (live) setDamagedList(file); })
      .catch(() => { /* the plain empty state still reads true */ });
    return () => { live = false; };
  }, [listEmpty]);

  // Focus password field when entering credentials view
  useEffect(() => {
    if (view === 'credentials') {
      setTimeout(() => passwordRef.current?.focus(), 200);
    }
  }, [view]);

  const handleSelectServer = (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server) return;

    // If already connected, go straight to desktop
    if (server.state?.status === 'connected') {
      setActiveServer(serverId);
      goToDesktop();
      return;
    }

    setSelectedServerId(serverId);
    setPassword('');
    setFailure(null);
    setView('credentials');
  };

  const handleConnect = async () => {
    if (!selectedServerId || connecting) return;

    setConnecting(true);
    setFailure(null);

    try {
      setActiveServer(selectedServerId);

      // Build credentials from the form based on auth method
      const credentials: Record<string, string> = {};
      if (selectedServer?.authMethod === 'password' && password) {
        credentials.password = password;
      }
      // For privateKey auth, the key is stored server-side from addServer.
      // If user entered a passphrase, send it.
      if (selectedServer?.authMethod === 'privateKey' && password) {
        credentials.passphrase = password;
      }

      const result = await connectServer(selectedServerId, Object.keys(credentials).length > 0 ? credentials : undefined);

      // Check if connection succeeded
      const updatedServers = useAppStore.getState().servers;
      const srv = updatedServers.find(s => s.id === selectedServerId);

      if (srv?.state?.status === 'connected') {
        goToDesktop();
      } else {
        setFailure(result ?? connectFailureOf(new Error('Connection failed')));
        triggerShake();
      }
    } catch (err) {
      setFailure(connectFailureOf(err));
      triggerShake();
    } finally {
      setConnecting(false);
    }
  };

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 500);
  };

  const handleBack = () => {
    setView('select');
    setFailure(null);
    setPassword('');
  };

  const handleAddServerComplete = async (config: Parameters<typeof addServer>[0]) => {
    await addServer(config);
    setView('select');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConnect();
    }
    if (e.key === 'Escape') {
      handleBack();
    }
  };

  return (
    <div className={embedded ? 'relative w-full h-full select-none' : 'fixed inset-0 z-[99999] select-none'}>
      {/* Wallpaper */}
      {!embedded && <Wallpaper />}

      {/* Subtle overlay for contrast */}
      {!embedded && <div className="absolute inset-0 backdrop-blur-[44px] backdrop-saturate-150" />}

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* ── Server Selection View ── */}
        {view === 'select' && (
          <div className="flex flex-col items-center gap-8 animate-fadeIn">
            {/* Title */}
            <div className="text-center">
              <h1 className="mb-1 text-[28px] font-bold tracking-[-0.02em] text-white [text-shadow:0_2px_16px_rgba(0,0,0,.3)]">
                HeadlessOS
              </h1>
              <p className="text-sm text-white/75 [text-shadow:0_1px_8px_rgba(0,0,0,.35)]">
                Select a server to connect
              </p>
            </div>

            {/* Server avatars */}
            <div className="flex flex-wrap justify-center gap-6 max-w-lg">
              {loadingServers && servers.length === 0 && !listFailed && (
                <div className="glass-heavy flex items-center gap-2 rounded-full px-4 py-2">
                  <Spinner className="w-5 h-5" />
                  <span className="text-sm text-label-2">Loading servers…</span>
                </div>
              )}
              {servers.map(srv => (
                <ServerAvatar
                  key={srv.id}
                  id={srv.id}
                  name={srv.name}
                  host={srv.host}
                  port={srv.port}
                  status={srv.state?.status ?? 'disconnected'}
                  onClick={() => handleSelectServer(srv.id)}
                />
              ))}

              {/* Add Server button */}
              <button
                className="flex flex-col items-center gap-2 group cursor-pointer"
                onClick={() => { setView('add-server'); setFailure(null); }}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-edge-2 bg-mat-thin backdrop-blur-xl transition-all duration-200 group-hover:scale-105 group-hover:bg-mat">
                  <Plus className="h-7 w-7 text-label-2 transition-colors group-hover:text-foreground" strokeWidth={1.75} />
                </div>
                <span className="text-[13px] font-semibold text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,.4)] transition-colors group-hover:text-white">
                  Add Server
                </span>
              </button>
            </div>

            {/* Couldn't load the list: not the same as having no servers */}
            {listFailed && (
              <div role="alert" title={serversError ?? undefined} className="glass-heavy flex items-center gap-3 rounded-full py-1 pl-4 pr-1 text-[13px] text-label-2">
                <span>Couldn't load your saved servers. Retrying…</span>
                <Button size="sm" variant="secondary" onClick={() => { void fetchServers(); }}>
                  Retry
                </Button>
              </div>
            )}

            {/* M15.17: a damaged list is kept, and says so */}
            {listEmpty && damagedList && (
              <ProblemCard
                failure={{
                  title: "Your saved servers couldn't be read",
                  hint: `The damaged file is kept as ${damagedList} in the .headlessos folder. Add your servers again.`,
                  help: 'saved-servers-are-missing',
                }}
              />
            )}

            {/* Empty state: only after a load that worked */}
            {listEmpty && !damagedList && (
              <p className="glass-heavy rounded-full px-4 py-2 text-[13px] text-label-2">
                No servers configured yet. Click "Add Server" to get started.
              </p>
            )}
          </div>
        )}

        {/* ── Credentials View ── */}
        {view === 'credentials' && selectedServer && (
          <div
            className={`flex flex-col items-center gap-6 animate-fadeIn short:max-h-full short:gap-3 short:overflow-y-auto short:px-8 short:py-2 ${shakeError ? 'animate-shake' : ''}`}
            onKeyDown={handleKeyDown}
          >
            {/* Back button */}
            <button
              className="glass-heavy absolute top-6 left-6 flex h-9 items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-semibold transition-colors hover:bg-mat-thick"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              <span>Back</span>
            </button>

            {/* Server avatar (large) */}
            <div data-testid="login-avatar" className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-edge-2 bg-[linear-gradient(160deg,var(--lumen-accent-hi),var(--lumen-accent))] shadow-[0_18px_40px_-14px_rgba(0,0,0,.55)] short:h-16 short:w-16">
              <Server className="h-10 w-10 text-white" strokeWidth={1.75} />
            </div>

            {/* Server name */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-white [text-shadow:0_2px_12px_rgba(0,0,0,.35)]">{selectedServer.name}</h2>
              <p className="mt-1 font-mono text-xs text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,.4)]">
                {selectedServer.username}@{selectedServer.host}:{selectedServer.port}
              </p>
            </div>

            {/* Auth method indicator */}
            <div className="flex items-center gap-2 text-xs text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,.4)]">
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span>
                {selectedServer.authMethod === 'password'
                  ? 'Password authentication'
                  : selectedServer.authMethod === 'privateKey'
                    ? 'Private key authentication'
                    : 'SSH agent authentication'}
              </span>
            </div>

            {/* Password field (for password auth) */}
            {selectedServer.authMethod === 'password' && (
              <div className="w-[320px]">
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    className="lumen-field-raised h-[52px] w-full rounded-full pl-5 pr-[92px] text-[15px] text-foreground outline-none backdrop-blur-xl transition-shadow placeholder:text-label-3 focus:ring-[3px] focus:ring-accent-soft"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={connecting}
                  />
                  <button
                    className="absolute right-[54px] top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-label-3 transition-colors hover:bg-fill hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  </button>
                  <SubmitButton connecting={connecting} onClick={handleConnect} />
                </div>
              </div>
            )}

            {/* SSH Key auth — passphrase field (optional) */}
            {selectedServer.authMethod === 'privateKey' && (
              <div className="w-[320px] space-y-3">
                <div className={`glass-heavy flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${selectedServer.keyLost ? 'text-danger' : 'text-success'}`}>
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {selectedServer.keyLost ? "Saved key can't be read" : 'SSH key configured'}
                </div>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Key passphrase (if encrypted)"
                    className="lumen-field-raised h-[52px] w-full rounded-full pl-5 pr-[92px] text-[15px] text-foreground outline-none backdrop-blur-xl transition-shadow placeholder:text-label-3 focus:ring-[3px] focus:ring-accent-soft"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={connecting}
                  />
                  <button
                    className="absolute right-[54px] top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-label-3 transition-colors hover:bg-fill hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  </button>
                  <SubmitButton connecting={connecting} onClick={handleConnect} />
                </div>
              </div>
            )}

            {/* M15.14: what went wrong, and the way to the docs and the log */}
            {failure && <ProblemCard failure={failure} />}

            {/* SSH agent auth has no field, so it gets a standalone lit pill */}
            {selectedServer.authMethod !== 'password' && selectedServer.authMethod !== 'privateKey' && (
              <button
                className="lumen-lit flex h-11 w-[240px] items-center justify-center gap-2 rounded-full text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Connecting...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            )}
          </div>
        )}

        {/* ── Add Server View ── */}
        {view === 'add-server' && (
          <div className="animate-fadeIn">
            {/* Back button */}
            <button
              className="glass-heavy absolute top-6 left-6 flex h-9 items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-semibold transition-colors hover:bg-mat-thick"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              <span>Back</span>
            </button>

            <AddServerForm
              onSubmit={handleAddServerComplete}
              onCancel={handleBack}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** 40px round lit submit button that sits inside the password pill. */
function SubmitButton({ connecting, onClick }: { connecting: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="lumen-lit absolute right-1.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-70"
      onClick={onClick}
      disabled={connecting}
      aria-label={connecting ? 'Connecting' : 'Sign in'}
      title="Sign in"
    >
      {connecting ? <Spinner className="h-4 w-4" /> : <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} />}
    </button>
  );
}
