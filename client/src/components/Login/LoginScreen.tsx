// M6.11: Login Screen — Windows 11-style server selection + credential entry
// @see docs/phases/phase-6.md

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app-store';
import { Wallpaper } from '../Desktop/Wallpaper';
import { ServerAvatar } from './ServerAvatar';
import { AddServerForm } from './AddServerForm';
import {
  Server,
  Plus,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  AlertCircle,
} from 'lucide-react';

type LoginView = 'select' | 'credentials' | 'add-server';

export function LoginScreen() {
  const {
    servers,
    loginError,
    fetchServers,
    connectServer,
    setActiveServer,
    goToDesktop,
    setLoginError,
    addServer,
    loadingServers,
  } = useAppStore();

  const [view, setView] = useState<LoginView>('select');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const selectedServer = servers.find(s => s.id === selectedServerId);

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

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
    setLoginError(null);
    setView('credentials');
  };

  const handleConnect = async () => {
    if (!selectedServerId || connecting) return;

    setConnecting(true);
    setLoginError(null);

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

      await connectServer(selectedServerId, Object.keys(credentials).length > 0 ? credentials : undefined);

      // Check if connection succeeded
      const updatedServers = useAppStore.getState().servers;
      const srv = updatedServers.find(s => s.id === selectedServerId);

      if (srv?.state?.status === 'connected') {
        goToDesktop();
      } else {
        setLoginError('Connection failed. Check server credentials.');
        triggerShake();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setLoginError(message);
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
    setLoginError(null);
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
    <div className="fixed inset-0 z-[99999] select-none">
      {/* Wallpaper */}
      <Wallpaper />

      {/* Subtle overlay for contrast */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* ── Server Selection View ── */}
        {view === 'select' && (
          <div className="flex flex-col items-center gap-8 animate-fadeIn">
            {/* Title */}
            <div className="text-center">
              <h1 className="text-white text-2xl font-semibold tracking-tight mb-1">
                HeadlessOS
              </h1>
              <p className="text-white/50 text-sm">
                Select a server to connect
              </p>
            </div>

            {/* Server avatars */}
            <div className="flex flex-wrap justify-center gap-6 max-w-lg">
              {loadingServers && servers.length === 0 && (
                <div className="flex items-center gap-2 text-white/40">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading servers…</span>
                </div>
              )}
              {servers.map(srv => (
                <ServerAvatar
                  key={srv.id}
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
                onClick={() => { setView('add-server'); setLoginError(null); }}
              >
                <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-dashed border-white/20 flex items-center justify-center group-hover:bg-white/15 group-hover:border-white/30 transition-all duration-200">
                  <Plus className="w-8 h-8 text-white/40 group-hover:text-white/60 transition-colors" />
                </div>
                <span className="text-white/50 text-xs font-medium group-hover:text-white/70 transition-colors">
                  Add Server
                </span>
              </button>
            </div>

            {/* Empty state */}
            {servers.length === 0 && !loadingServers && (
              <p className="text-white/30 text-sm">
                No servers configured yet. Click "Add Server" to get started.
              </p>
            )}
          </div>
        )}

        {/* ── Credentials View ── */}
        {view === 'credentials' && selectedServer && (
          <div
            className={`flex flex-col items-center gap-6 animate-fadeIn ${shakeError ? 'animate-shake' : ''}`}
            onKeyDown={handleKeyDown}
          >
            {/* Back button */}
            <button
              className="absolute top-8 left-8 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>

            {/* Server avatar (large) */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/20">
              <Server className="w-10 h-10 text-white" />
            </div>

            {/* Server name */}
            <div className="text-center">
              <h2 className="text-white text-xl font-semibold">{selectedServer.name}</h2>
              <p className="text-white/40 text-sm mt-0.5">
                {selectedServer.username}@{selectedServer.host}:{selectedServer.port}
              </p>
            </div>

            {/* Auth method indicator */}
            <div className="flex items-center gap-2 text-white/30 text-xs">
              <KeyRound className="w-3.5 h-3.5" />
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
              <div className="w-72">
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={connecting}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* SSH Key auth — passphrase field (optional) */}
            {selectedServer.authMethod === 'privateKey' && (
              <div className="w-72 space-y-3">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
                  <KeyRound className="w-3.5 h-3.5" />
                  SSH key configured
                </div>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Key passphrase (if encrypted)"
                    className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={connecting}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    type="button"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Error message */}
            {loginError && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Connect button */}
            <button
              className="w-72 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        )}

        {/* ── Add Server View ── */}
        {view === 'add-server' && (
          <div className="animate-fadeIn">
            {/* Back button */}
            <button
              className="absolute top-8 left-8 flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
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
