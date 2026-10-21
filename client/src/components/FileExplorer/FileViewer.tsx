// M2.4 + M2.5: File Viewer — text file viewer with save capability
// EX8.6: LumenOS v3 — transparent toolbar, lit Save pill, bg-paper text pane.
// EX8.8: Monaco code editor (syntax colouring, Ctrl/⌘+S) + language chip.
// @see docs/phases/phase-2.md, docs/phases/phase-ex8.md

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  AlertCircle,
} from 'lucide-react';
import { LoadingView } from '@/components/ui/loading-view';
import { CodeEditor } from '@/components/ui/code-editor';
import { fileLanguageLabel } from '@/lib/code-language';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileIcon } from '@/components/ui/FileIcon';
import { ExplorerIconButton, EXPLORER_ICON } from './ExplorerToolbar';
import { readFile, writeFile } from '../../lib/api';
import { toast } from 'sonner';

interface FileViewerProps {
  serverId: string;
  filePath: string;
  onClose: () => void;
  onSave: () => void;
}

export function FileViewer({ serverId, filePath, onClose, onSave }: FileViewerProps) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileName = filePath.split('/').pop() ?? filePath;
  const hasChanges = content !== originalContent;

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await readFile(serverId, filePath);
      setContent(result.content);
      setOriginalContent(result.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setLoading(false);
    }
  }, [serverId, filePath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  const handleSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      await writeFile(serverId, filePath, content);
      setOriginalContent(content);
      toast.success('File saved');
      onSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar — transparent row on the window glass */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ExplorerIconButton onClick={onClose} title="Back to file list">
            <ArrowLeft className={EXPLORER_ICON} strokeWidth={1.75} />
          </ExplorerIconButton>
          <FileIcon name={fileName} size="sm" className="shrink-0" />
          <span className="truncate text-[13px] font-semibold text-foreground">{fileName}</span>
          <span className="hidden truncate font-mono text-[11px] text-label-3 sm:inline">{filePath}</span>
          <Badge variant="secondary" className="shrink-0">{fileLanguageLabel(fileName)}</Badge>
          {hasChanges && (
            <Badge variant="warning" className="shrink-0">● modified</Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            <Save strokeWidth={1.75} />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <LoadingView label="Opening file…" />
      )}

      {error && !loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="mb-2 h-8 w-8 text-danger" strokeWidth={1.75} />
            <p className="mb-3 text-[13px] text-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadFile}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <CodeEditor
          className="mt-3 min-h-[300px] flex-1"
          path={filePath}
          value={content}
          onChange={setContent}
          onSave={() => void handleSave()}
        />
      )}
    </div>
  );
}
