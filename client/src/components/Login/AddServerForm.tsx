// M6.11: Add Server Form — inline form for adding new server connections
// EX8.5: LumenOS v3 — a glass window card with pill fields; tokens, not white/N overlays.
// @see docs/phases/phase-ex8.md
// @see docs/phases/phase-6.md

import { useState, useEffect, useRef } from 'react';
import type { ServerConfig } from 'headlessos-shared';
import {
  Server, KeyRound, Upload, FileText, ChevronDown, Check, FolderOpen } from 'lucide-react';
import { fetchSSHKeys, fetchSSHKeyContent, type SSHKeyInfo } from '../../lib/api';
import { Spinner } from '@/components/ui/spinner';

type AuthMethod = 'password' | 'privateKey' | 'agent';
type KeySource = 'detect' | 'upload' | 'paste';

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
  const [privateKeyContent, setPrivateKeyContent] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSH key detection state
  const [keySource, setKeySource] = useState<KeySource>('detect');
  const [detectedKeys, setDetectedKeys] = useState<SSHKeyInfo[]>([]);
  const [selectedKeyName, setSelectedKeyName] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [loadingKeyContent, setLoadingKeyContent] = useState(false);
  const [keyDropdownOpen, setKeyDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canSubmit = name.trim() && host.trim() && username.trim() && !submitting;

  // Detect local SSH keys when SSH Key auth is selected
  useEffect(() => {
    if (authMethod === 'privateKey' && keySource === 'detect' && detectedKeys.length === 0) {
      setLoadingKeys(true);
      fetchSSHKeys()
        .then(keys => {
          setDetectedKeys(keys);
          // Auto-select first key if available
          if (keys.length > 0 && !selectedKeyName) {
            setSelectedKeyName(keys[0].name);
            loadKeyContent(keys[0].name);
          }
        })
        .catch(() => {
          // No keys found or error — silently fall through
        })
        .finally(() => setLoadingKeys(false));
    }
  }, [authMethod, keySource]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setKeyDropdownOpen(false);
      }
    };
    if (keyDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [keyDropdownOpen]);

  const loadKeyContent = async (keyName: string) => {
    setLoadingKeyContent(true);
    try {
      const content = await fetchSSHKeyContent(keyName);
      setPrivateKeyContent(content);
      setError(null);
    } catch {
      setError(`Failed to read key: ${keyName}`);
    } finally {
      setLoadingKeyContent(false);
    }
  };

  const handleKeySelect = (keyName: string) => {
    setSelectedKeyName(keyName);
    setKeyDropdownOpen(false);
    loadKeyContent(keyName);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      if (!content.includes('PRIVATE KEY')) {
        setError('File does not appear to be a valid SSH private key');
        return;
      }
      setPrivateKeyContent(content);
      setSelectedKeyName(file.name);
      setError(null);
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsText(file);

    // Reset file input so same file can be selected again
    e.target.value = '';
  };

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
        ...(authMethod === 'privateKey' ? {
          privateKeyPath: privateKeyContent,
          ...(passphrase ? { passphrase } : {}),
        } : {}),
      };
      await onSubmit(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full h-[38px] px-4 rounded-full bg-field border border-edge text-foreground placeholder:text-label-3 text-[13px] outline-none focus:border-accent-solid/60 focus:ring-[3px] focus:ring-accent-soft transition-[box-shadow,border-color]';

  const labelClass = 'text-label-3 text-[11px] font-bold uppercase tracking-[.06em] mb-1.5 px-1 block';

  return (
    <div className="glass shadow-window w-[440px] max-h-[85vh] overflow-y-auto rounded-[24px] p-6">
      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pem,.key,.pub,*"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="grid h-10 w-10 place-items-center rounded-[12px] border border-edge bg-fill">
          <Server className="h-5 w-5 text-accent-solid" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-[17px] font-bold">Add Server</h2>
          <p className="text-xs text-label-2">Configure a new SSH connection</p>
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
          <div className="flex gap-0.5 rounded-full bg-fill p-[3px]">
            {(['password', 'privateKey', 'agent'] as AuthMethod[]).map(method => (
              <button
                key={method}
                type="button"
                className={`
                  flex-1 h-8 rounded-full text-xs font-semibold transition-all
                  ${authMethod === method
                    ? 'bg-mat-thick text-foreground shadow-[0_1px_3px_rgba(0,0,0,.18),var(--lumen-spec)]'
                    : 'text-label-2 hover:text-foreground'
                  }
                `}
                onClick={() => {
                  setAuthMethod(method);
                  setError(null);
                }}
              >
                {method === 'password' ? 'Password' : method === 'privateKey' ? 'SSH Key' : 'Agent'}
              </button>
            ))}
          </div>
        </div>

        {/* Password auth field */}
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

        {/* SSH Key auth fields */}
        {authMethod === 'privateKey' && (
          <div className="space-y-3">
            {/* Key source selector */}
            <div>
              <label className={labelClass}>Key Source</label>
              <div className="flex gap-1.5">
                {([
                  { id: 'detect' as KeySource, label: 'Auto-Detect', icon: KeyRound },
                  { id: 'upload' as KeySource, label: 'Upload File', icon: Upload },
                  { id: 'paste' as KeySource, label: 'Paste Key', icon: FileText },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`
                      flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1.5
                      ${keySource === id
                        ? 'bg-accent-soft border border-accent-solid/40 text-accent-solid'
                        : 'bg-fill border border-edge text-label-2 hover:text-foreground hover:bg-fill'
                      }
                    `}
                    onClick={() => {
                      setKeySource(id);
                      if (id === 'upload' || id === 'paste') {
                        setPrivateKeyContent('');
                        setSelectedKeyName(null);
                      }
                    }}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-detect: show dropdown of detected keys */}
            {keySource === 'detect' && (
              <div>
                <label className={labelClass}>
                  Detected Keys (~/.ssh)
                </label>
                {loadingKeys ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-fill-2 border border-edge text-label-2 text-sm">
                    <Spinner className="w-3.5 h-3.5" />
                    Scanning ~/.ssh ...
                  </div>
                ) : detectedKeys.length === 0 ? (
                  <div className="px-4 py-2.5 rounded-[10px] bg-fill border border-edge text-label-3 text-xs">
                    No SSH keys found in ~/.ssh — try uploading or pasting a key
                  </div>
                ) : (
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 h-[38px] rounded-full bg-field border border-edge text-[13px] transition-colors hover:bg-fill focus:border-accent-solid/60"
                      onClick={() => setKeyDropdownOpen(!keyDropdownOpen)}
                    >
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-3.5 h-3.5 text-accent-solid" />
                        <span className="text-foreground">
                          {selectedKeyName ?? 'Select a key...'}
                        </span>
                        {selectedKeyName && (
                          <span className="text-label-3 text-xs">
                            ({detectedKeys.find(k => k.name === selectedKeyName)?.type})
                          </span>
                        )}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-label-2 transition-transform ${keyDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {keyDropdownOpen && (
                      <div className="glass-heavy absolute z-50 mt-1 w-full overflow-hidden rounded-[18px] p-1.5">
                        {detectedKeys.map(key => (
                          <button
                            key={key.name}
                            type="button"
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-left hover:bg-accent-soft transition-colors"
                            onClick={() => handleKeySelect(key.name)}
                          >
                            <KeyRound className="w-3.5 h-3.5 text-label-2 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-foreground text-sm truncate">{key.name}</div>
                              <div className="text-label-3 text-[10px] truncate">{key.path}</div>
                            </div>
                            <span className="text-label-3 text-[10px] font-mono">{key.type}</span>
                            {selectedKeyName === key.name && (
                              <Check className="w-3.5 h-3.5 text-accent-solid shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Loading indicator when fetching key content */}
                {loadingKeyContent && (
                  <div className="flex items-center gap-2 mt-2 text-label-2 text-xs">
                    <Spinner className="w-3 h-3" />
                    Loading key content...
                  </div>
                )}
                {/* Key loaded confirmation */}
                {!loadingKeyContent && privateKeyContent && selectedKeyName && (
                  <div className="flex items-center gap-2 mt-2 text-success text-xs">
                    <Check className="w-3 h-3" />
                    Key loaded ({privateKeyContent.split('\n').length} lines)
                  </div>
                )}
              </div>
            )}

            {/* Upload: file picker button */}
            {keySource === 'upload' && (
              <div>
                <label className={labelClass}>Private Key File</label>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[14px] bg-field border border-dashed border-edge-2 text-label-2 text-sm hover:bg-fill hover:border-accent-solid/40 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FolderOpen className="w-4 h-4" />
                  {selectedKeyName ? (
                    <span className="text-foreground">{selectedKeyName}</span>
                  ) : (
                    'Choose private key file...'
                  )}
                </button>
                {privateKeyContent && (
                  <div className="flex items-center gap-2 mt-2 text-success text-xs">
                    <Check className="w-3 h-3" />
                    Key loaded ({privateKeyContent.split('\n').length} lines)
                  </div>
                )}
              </div>
            )}

            {/* Paste: textarea */}
            {keySource === 'paste' && (
              <div>
                <label className={labelClass}>Private Key (paste content)</label>
                <textarea
                  className={`${inputClass} h-24 resize-none font-mono text-xs`}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={privateKeyContent}
                  onChange={e => setPrivateKeyContent(e.target.value)}
                />
              </div>
            )}

            {/* Passphrase (always shown for SSH Key method) */}
            <div>
              <label className={labelClass}>Passphrase (optional)</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Leave empty if key is not encrypted"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
              />
            </div>
          </div>
        )}

        {authMethod === 'agent' && (
          <p className="text-label-3 text-xs py-2">
            Will use your local SSH agent (SSH_AUTH_SOCK)
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-[10px] border border-danger/30 bg-danger/14 px-3 py-2 text-xs text-danger">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            className="flex-1 h-[38px] rounded-full bg-mat border border-edge text-foreground shadow-[var(--lumen-spec)] hover:bg-mat-thick text-[13px] font-semibold transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="lumen-lit flex-1 h-[38px] rounded-full text-[13px] font-semibold transition-[filter,opacity] hover:brightness-105 disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Spinner className="w-4 h-4" />
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
