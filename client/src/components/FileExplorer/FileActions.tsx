// M2.4 + M2.5: File Actions — create file, create folder buttons
// @see docs/phases/phase-2.md

import { useState } from 'react';
import { FolderPlus, FilePlus, X, Check } from 'lucide-react';
import { createDirectory, writeFile } from '../../lib/api';

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
      alert(err instanceof Error ? err.message : 'Create failed');
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
          className="bg-background border border-input rounded px-2 py-0.5 text-foreground text-sm outline-none focus:border-primary w-40"
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
          className="p-1 rounded hover:bg-accent text-success disabled:opacity-40"
          title="Create"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setCreatingType(null);
            setName('');
          }}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
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
        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="New File"
      >
        <FilePlus className="w-4 h-4" />
      </button>
      <button
        onClick={() => setCreatingType('folder')}
        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="New Folder"
      >
        <FolderPlus className="w-4 h-4" />
      </button>
    </div>
  );
}
