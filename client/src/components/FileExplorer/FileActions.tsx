// M2.4 + M2.5: File Actions — create file, create folder buttons (legacy; toolbar is in use)
// EX8.6: LumenOS v3 tokens — round ghost buttons, accent rename-style field.
// @see docs/phases/phase-2.md

import { useState } from 'react';
import { FolderPlus, FilePlus, X, Check } from 'lucide-react';
import { createDirectory, writeFile } from '../../lib/api';
import { toast } from 'sonner';

interface FileActionsProps {
  serverId: string;
  currentPath: string;
  onComplete: () => void;
}

export function FileActions({ serverId, currentPath, onComplete }: FileActionsProps) {
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);

    const fullPath =
      currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;

    try {
      if (creatingType === 'folder') {
        await createDirectory(serverId, fullPath);
      } else {
        await writeFile(serverId, fullPath, '');
      }
      setCreatingType(null);
      setName('');
      onComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  if (creatingType) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">
          {creatingType === 'folder' ? 'New folder:' : 'New file:'}
        </span>
        <input
          autoFocus
          className="w-40 rounded-[6px] border border-accent-solid bg-mat-thick px-2 py-0.5 text-[13px] text-foreground outline-none placeholder:text-label-3 focus:ring-[3px] focus:ring-accent-soft"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') {
              setCreatingType(null);
              setName('');
            }
          }}
          placeholder={creatingType === 'folder' ? 'folder-name' : 'filename.txt'}
          disabled={busy}
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || busy}
          className="grid h-7 w-7 place-items-center rounded-full text-success transition-colors duration-150 hover:bg-fill disabled:opacity-40"
          title="Create"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setCreatingType(null);
            setName('');
          }}
          className="grid h-7 w-7 place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setCreatingType('file')}
        className="grid h-[34px] w-[34px] place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground"
        title="New File"
      >
        <FilePlus className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <button
        onClick={() => setCreatingType('folder')}
        className="grid h-[34px] w-[34px] place-items-center rounded-full text-label-2 transition-colors duration-150 hover:bg-fill hover:text-foreground"
        title="New Folder"
      >
        <FolderPlus className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}
