// M2.5: Address Bar — Windows-style editable path bar with navigation buttons
// @see docs/phases/phase-2.md

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  ChevronRight as Separator,
  Folder,
} from 'lucide-react';

interface AddressBarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  loading: boolean;
  historyBack: string[];
  historyForward: string[];
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
}

export function AddressBar({
  currentPath,
  onNavigate,
  onRefresh,
  loading,
  historyBack,
  historyForward,
  onBack,
  onForward,
  onUp,
}: AddressBarProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const submitPath = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== currentPath) {
      onNavigate(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
    }
    setEditing(false);
  }, [editValue, currentPath, onNavigate]);

  const parts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const canGoUp = currentPath !== '/';

  return (
    <div className="flex items-center gap-1 px-1 py-1 bg-[rgb(var(--chrome))] border-b border-gray-200 dark:border-zinc-700/60">
      {/* Navigation buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        <NavButton
          icon={<ChevronLeft className="w-3.5 h-3.5" />}
          onClick={onBack}
          disabled={historyBack.length === 0}
          title="Back"
        />
        <NavButton
          icon={<ChevronRight className="w-3.5 h-3.5" />}
          onClick={onForward}
          disabled={historyForward.length === 0}
          title="Forward"
        />
        <NavButton
          icon={<ArrowUp className="w-3.5 h-3.5" />}
          onClick={onUp}
          disabled={!canGoUp}
          title="Up"
        />
      </div>

      {/* Address / breadcrumb area */}
      <div
        className="flex-1 flex items-center min-w-0 h-7 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/70 rounded px-2 cursor-text hover:border-gray-400 dark:hover:border-zinc-600 transition-colors"
        onClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-gray-900 dark:text-zinc-200 outline-none font-mono"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => {
              setEditing(false);
              setEditValue(currentPath);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') submitPath();
              if (e.key === 'Escape') {
                setEditing(false);
                setEditValue(currentPath);
              }
            }}
          />
        ) : (
          <div className="flex items-center gap-0.5 text-sm overflow-x-auto min-w-0 select-none">
            <button
              onClick={e => {
                e.stopPropagation();
                onNavigate('/');
              }}
              className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-zinc-700/60 text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 shrink-0"
            >
              <Folder className="w-3 h-3 text-yellow-500" />
              <span className="text-xs">/</span>
            </button>
            {parts.map((part, i) => {
              const fullPath = '/' + parts.slice(0, i + 1).join('/');
              const isLast = i === parts.length - 1;
              return (
                <span key={fullPath} className="flex items-center gap-0.5 shrink-0">
                  <Separator className="w-3 h-3 text-gray-300 dark:text-zinc-600" />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onNavigate(fullPath);
                    }}
                    className={`px-1 py-0.5 rounded text-xs ${
                      isLast
                        ? 'text-gray-900 dark:text-zinc-200 font-medium'
                        : 'text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700/60'
                    }`}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Refresh */}
      <NavButton
        icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
        onClick={onRefresh}
        disabled={false}
        title="Refresh"
      />
    </div>
  );
}

function NavButton({
  icon,
  onClick,
  disabled,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 disabled:text-gray-300 dark:disabled:text-zinc-700 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
      title={title}
    >
      {icon}
    </button>
  );
}
