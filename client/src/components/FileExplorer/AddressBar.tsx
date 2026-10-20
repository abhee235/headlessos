// M6: Address Bar — editable breadcrumb path bar
// EX8.6: LumenOS v3 — round ghost nav buttons and a 34px bg-field breadcrumb pill.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  ChevronRight as Separator,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FolderSVG } from '@/components/ui/FileIcon';
import { ExplorerIconButton, EXPLORER_ICON } from './ExplorerToolbar';

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

/** One breadcrumb segment: 26px pill inside the address field. */
const CRUMB = 'flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[13px] transition-colors duration-150';

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

  const isTrash = currentPath === '__trash__';
  const parts = currentPath === '/' || isTrash ? [] : currentPath.split('/').filter(Boolean);
  const canGoUp = currentPath !== '/' && !isTrash;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      {/* Navigation buttons */}
      <ExplorerIconButton onClick={onBack} disabled={historyBack.length === 0} title="Back">
        <ArrowLeft className={EXPLORER_ICON} strokeWidth={1.75} />
      </ExplorerIconButton>
      <ExplorerIconButton onClick={onForward} disabled={historyForward.length === 0} title="Forward">
        <ArrowRight className={EXPLORER_ICON} strokeWidth={1.75} />
      </ExplorerIconButton>
      <ExplorerIconButton onClick={onUp} disabled={!canGoUp} title="Up">
        <ArrowUp className={EXPLORER_ICON} strokeWidth={1.75} />
      </ExplorerIconButton>

      {/* Address / breadcrumb pill */}
      <div
        className={cn(
          'ml-1.5 flex h-9 min-w-0 flex-1 cursor-text items-center rounded-full border border-edge bg-field px-1.5',
          'transition-[border-color,box-shadow] duration-150 hover:border-edge-2',
          'focus-within:border-accent-solid/60 focus-within:ring-[3px] focus-within:ring-accent-soft',
        )}
        onClick={() => !isTrash && setEditing(true)}
      >
        {editing && !isTrash ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent px-2 font-mono text-[13px] text-foreground outline-none"
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
          <div className="flex min-w-0 select-none items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
            {isTrash ? (
              <button className={cn(CRUMB, 'font-semibold text-foreground')}>
                <Trash2 className="h-4 w-4 text-label-2" strokeWidth={1.75} />
                <span>Recycle Bin</span>
              </button>
            ) : (
            <>
            <button
              onClick={e => {
                e.stopPropagation();
                onNavigate('/');
              }}
              className={cn(
                CRUMB,
                parts.length === 0
                  ? 'font-semibold text-foreground'
                  : 'font-medium text-label-2 hover:bg-fill hover:text-foreground',
              )}
            >
              <FolderSVG size={16} />
              <span>/</span>
            </button>
            {parts.map((part, i) => {
              const fullPath = '/' + parts.slice(0, i + 1).join('/');
              const isLast = i === parts.length - 1;
              return (
                <span key={fullPath} className="flex shrink-0 items-center gap-0.5">
                  <Separator className="h-3.5 w-3.5 text-label-3" strokeWidth={1.75} />
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onNavigate(fullPath);
                    }}
                    className={cn(
                      CRUMB,
                      isLast
                        ? 'font-semibold text-foreground'
                        : 'font-medium text-label-2 hover:bg-fill hover:text-foreground',
                    )}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
            </>
            )}
          </div>
        )}
      </div>

      {/* Refresh */}
      <ExplorerIconButton onClick={onRefresh} title="Refresh">
        <RefreshCw className={cn('h-[17px] w-[17px]', loading && 'animate-spin')} strokeWidth={1.75} />
      </ExplorerIconButton>
    </div>
  );
}
