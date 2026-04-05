// M6.11: Server Avatar — Windows 11-style user avatar for server selection
// @see docs/phases/phase-6.md

import { Server } from 'lucide-react';

// Generate a consistent gradient from the server name
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

// Get initials from server name
function getInitials(name: string): string {
  return name
    .split(/[\s-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

interface ServerAvatarProps {
  name: string;
  host: string;
  port: number;
  status: string;
  onClick: () => void;
}

export function ServerAvatar({ name, host, port, status, onClick }: ServerAvatarProps) {
  const gradient = nameToGradient(name);
  const initials = getInitials(name);
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <button
      className="flex flex-col items-center gap-2 group cursor-pointer"
      onClick={onClick}
    >
      {/* Avatar circle */}
      <div className="relative">
        <div
          className={`
            w-20 h-20 rounded-full bg-gradient-to-br ${gradient}
            flex items-center justify-center shadow-lg
            group-hover:scale-105 group-hover:shadow-xl
            transition-all duration-200
            ${isConnecting ? 'animate-pulse' : ''}
          `}
        >
          {initials ? (
            <span className="text-white text-xl font-bold">{initials}</span>
          ) : (
            <Server className="w-8 h-8 text-white" />
          )}
        </div>

        {/* Status dot */}
        <div
          className={`
            absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full border-2 border-black/50
            ${isConnected
              ? 'bg-green-500'
              : isConnecting
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-zinc-500'
            }
          `}
        />
      </div>

      {/* Name */}
      <div className="text-center max-w-24">
        <p className="text-white/90 text-xs font-medium truncate group-hover:text-white transition-colors">
          {name}
        </p>
        <p className="text-white/30 text-[10px] truncate">
          {host}:{port}
        </p>
      </div>
    </button>
  );
}
