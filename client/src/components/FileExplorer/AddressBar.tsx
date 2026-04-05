// M6: Address Bar — modern rounded editable path bar
// @see docs/phases/phase-6.md

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
    <div className="flex items-center gap-2 px-3 pt-1 pb-2">
      {/* Navigation buttons */}
      <div className="flex items-center gap-1 shrink-0">
        <NavButton
          icon={<ChevronLeft className="w-4.5 h-4.5" />}
          onClick={onBack}
          disabled={historyBack.length === 0}
          title="Back"
        />
        <NavButton
          icon={<ChevronRight className="w-4.5 h-4.5" />}
          onClick={onForward}
          disabled={historyForward.length === 0}
          title="Forward"
        />
        <NavButton
          icon={<ArrowUp className="w-4.5 h-4.5" />}
          onClick={onUp}
          disabled={!canGoUp}
          title="Up"
        />
      </div>

      {/* Address / breadcrumb area */}
      <div
        className="flex-1 flex items-center min-w-0 h-10 bg-foreground/3 rounded-xl px-3.5 cursor-text hover:bg-foreground/5 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/20 transition-all"
        onClick={() => setEditing(true)}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-foreground outline-none font-mono"
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
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg hover:bg-accent/80 text-foreground/60 hover:text-foreground shrink-0 transition-colors"
            >
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium">/</span>
            </button>
            {parts.map((part, i) => {
              const fullPath = '/' + parts.slice(0, i + 1).join('/');
              const isLast = i === parts.length - 1;
              return (
                <span key={fullPath} className="flex items-center gap-0.5 shrink-0">
                  <Separator className="w-3 h-3 text-foreground/25" />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onNavigate(fullPath);
                    }}
                    className={`px-1.5 py-0.5 rounded-lg text-xs transition-colors ${
                      isLast
                        ? 'text-foreground font-medium'
                        : 'text-foreground/60 hover:text-foreground hover:bg-accent/80'
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
        icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
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
      className="p-2 rounded-lg text-foreground/50 hover:text-foreground/70 hover:bg-foreground/4 disabled:text-foreground/30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-all duration-150"
      title={title}
    >
      {icon}
    </button>
  );
}
