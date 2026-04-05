// M6.11: Add Server Form — inline form for adding new server connections
// @see docs/phases/phase-6.md

import { useState } from 'react';
import type { ServerConfig } from 'headlessos-shared';
import {
  Server,
  Loader2,
} from 'lucide-react';

type AuthMethod = 'password' | 'privateKey' | 'agent';

interface AddServerFormProps {
  onSubmit: (config: Omit<ServerConfig, 'id'>) => Promise<void>;
  onCancel: () => void;
}

export function AddServerForm({ onSubmit, onCancel }: AddServerFormProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('password');
  const [password, setPassword] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() && host.trim() && username.trim() && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const config: Omit<ServerConfig, 'id'> = {
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port, 10) || 22,
        username: username.trim(),
        authMethod,
        ...(authMethod === 'password' ? { password } : {}),
        ...(authMethod === 'privateKey' ? { privateKeyPath } : {}),
      };
      await onSubmit(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/10 text-white placeholder-white/30 text-sm outline-none focus:border-blue-400/50 focus:bg-white/15 transition-all';

  const labelClass = 'text-white/50 text-xs font-medium uppercase tracking-wider mb-1.5 block';

  return (
    <div className="w-96 bg-white/5 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Server className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-white text-lg font-semibold">Add Server</h2>
          <p className="text-white/40 text-xs">Configure a new SSH connection</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className={labelClass}>Display Name</label>
          <input
            className={inputClass}
            placeholder="My VPS Server"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Host + Port */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelClass}>Host</label>
            <input
              className={inputClass}
              placeholder="192.168.1.100"
              value={host}
              onChange={e => setHost(e.target.value)}
            />
          </div>
          <div className="w-24">
            <label className={labelClass}>Port</label>
            <input
              className={inputClass}
              placeholder="22"
              value={port}
              onChange={e => setPort(e.target.value)}
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className={labelClass}>Username</label>
          <input
            className={inputClass}
            placeholder="root"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </div>

        {/* Auth Method */}
        <div>
          <label className={labelClass}>Authentication</label>
          <div className="flex gap-2">
            {(['password', 'privateKey', 'agent'] as AuthMethod[]).map(method => (
              <button
                key={method}
                type="button"
                className={`
                  flex-1 py-2 rounded-lg text-xs font-medium transition-all
                  ${authMethod === method
                    ? 'bg-blue-500/20 border border-blue-400/30 text-blue-400'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/60 hover:bg-white/10'
                  }
                `}
                onClick={() => setAuthMethod(method)}
              >
                {method === 'password' ? 'Password' : method === 'privateKey' ? 'SSH Key' : 'Agent'}
              </button>
            ))}
          </div>
        </div>

        {/* Auth-method-specific field */}
        {authMethod === 'password' && (
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              className={inputClass}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
        )}

        {authMethod === 'privateKey' && (
          <div>
            <label className={labelClass}>Private Key (paste content)</label>
            <textarea
              className={`${inputClass} h-20 resize-none font-mono text-xs`}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              value={privateKeyPath}
              onChange={e => setPrivateKeyPath(e.target.value)}
            />
          </div>
        )}

        {authMethod === 'agent' && (
          <p className="text-white/30 text-xs py-2">
            Will use your local SSH agent (SSH_AUTH_SOCK)
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 text-sm font-medium transition-all"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/50 text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Server'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
