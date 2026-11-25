import { WifiOff, RotateCw, Settings } from 'lucide-react';
import { Button } from './button';
import { useState } from 'react';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/app-store';
import { LOCAL_NETWORK_HELP, desktopOpenLocalNetworkSettings } from '../../lib/local-network';

interface DisconnectedStateProps {
  serverId: string;
  /** Called after successful reconnection */
  onReconnected?: () => void;
  /** Additional context message */
  message?: string;
}

/**
 * Shared component shown when an app detects the server is disconnected.
 * Offers a "Reconnect" button that attempts SSH reconnection, or a
 * "Sign Out" link to go back to the login screen.
 */
export function DisconnectedState({ serverId, onReconnected, message }: DisconnectedStateProps) {
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // M17.8: on a Mac, a reconnect kept off the local network opens the setting
  const [blocked, setBlocked] = useState(false);
  const openSettings = blocked ? desktopOpenLocalNetworkSettings() : undefined;
  const signOut = useAppStore((s) => s.signOut);

  const handleReconnect = async () => {
    setReconnecting(true);
    setError(null);
    setBlocked(false);
    try {
      await api.connectServer(serverId);
      onReconnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnection failed');
      setBlocked(api.connectFailureOf(err).help === LOCAL_NETWORK_HELP);
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm">
        <WifiOff className="w-10 h-10 text-label-3 mx-auto mb-3" strokeWidth={1.75} />
        <p className="text-sm font-medium text-foreground mb-1">
          Server disconnected
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          {message ?? 'The SSH connection to this server was lost. This can happen after a server restart or network interruption.'}
        </p>

        {error && (
          <p className="text-xs text-destructive mb-3">{error}</p>
        )}

        <div className="flex items-center justify-center gap-2">
          <Button onClick={handleReconnect} disabled={reconnecting} className="gap-2">
            <RotateCw className={`h-4 w-4 ${reconnecting ? 'animate-spin' : ''}`} />
            {reconnecting ? 'Reconnecting…' : 'Reconnect'}
          </Button>
          {openSettings && (
            <Button variant="secondary" onClick={() => void openSettings()} className="gap-2" data-testid="disconnected-open-settings">
              <Settings className="h-4 w-4" />
              Open Privacy &amp; Security
            </Button>
          )}
        </div>

        <button
          onClick={() => signOut()}
          className="text-xs text-label-3 hover:text-label-2 mt-4 underline cursor-pointer"
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
