// M6.11: Server Avatar — Windows 11-style user avatar for server selection
// @see docs/phases/phase-6.md
// EX6 (post-D): adds right-click "Remove server" + hover delete affordance.

import { useState } from 'react';
import { Server, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAppStore } from '../../store/app-store';

function nameToGradient(name: string): string {
  const gradients = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-green-500 to-emerald-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-blue-500',
    'from-teal-500 to-green-500',
    'from-rose-500 to-purple-500',
    'from-amber-500 to-orange-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

interface ServerAvatarProps {
  id?: string;
  name: string;
  host: string;
  port: number;
  status: string;
  onClick: () => void;
}

export function ServerAvatar({ id, name, host, port, status, onClick }: ServerAvatarProps) {
  const gradient = nameToGradient(name);
  const initials = getInitials(name);
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const removeServer = useAppStore((s) => s.removeServer);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canDelete = Boolean(id);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await removeServer(id);
    } catch (err) {
      console.error('Failed to remove server', err);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className="relative flex flex-col items-center gap-2 group cursor-pointer"
            onClick={onClick}
            data-testid={id ? `server-avatar-${id}` : undefined}
          >
            {canDelete && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${name}`}
                className="absolute -top-1 -right-1 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-[#D2483F] text-white shadow-md ring-2 ring-white/30 transition-transform hover:scale-110 group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
                data-testid={`server-avatar-remove-${id}`}
              >
                <Trash2 className="h-3 w-3" />
              </span>
            )}

            <div className="relative">
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full border-2 border-edge-2 bg-linear-to-br ${gradient} shadow-[0_14px_32px_-12px_rgba(0,0,0,.55)] transition-transform duration-200 group-hover:scale-105 ${isConnecting ? 'animate-pulse' : ''}`}
              >
                {initials ? (
                  <span className="text-white text-xl font-bold">{initials}</span>
                ) : (
                  <Server className="h-8 w-8 text-white" strokeWidth={1.75} />
                )}
              </div>

              <div
                className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-white/80 ${isConnected ? 'bg-success' : isConnecting ? 'bg-warning animate-pulse' : 'bg-label-3'}`}
              />
            </div>

            <div className="text-center max-w-24">
              <p className="truncate text-[13px] font-semibold text-white [text-shadow:0_1px_6px_rgba(0,0,0,.45)]">
                {name}
              </p>
              <p className="truncate font-mono text-[11px] text-white/65 [text-shadow:0_1px_6px_rgba(0,0,0,.45)]">
                {host}:{port}
              </p>
            </div>
          </button>
        </ContextMenuTrigger>

        {canDelete && (
          <ContextMenuContent className="w-44">
            <ContextMenuItem
              danger
              onSelect={() => setConfirmOpen(true)}
              data-testid={`server-avatar-context-remove-${id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove server…
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {canDelete && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Remove ${name}?`}
          description={`This will disconnect and forget ${host}:${port}. The server on the other end is not affected. You can re-add it later.`}
          confirmLabel="Remove"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
