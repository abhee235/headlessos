// M2.4 + M2.5: File Viewer — text file viewer with save capability
// @see docs/phases/phase-2.md

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { readFile, writeFile } from '../../lib/api';

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
    setSaving(true);
    try {
      await writeFile(serverId, filePath, content);
      setOriginalContent(content);
      onSave();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-gray-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 shrink-0"
            title="Back to file list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <FileText className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
          <span className="text-sm text-gray-900 dark:text-zinc-200 truncate">{fileName}</span>
          <span className="text-xs text-gray-400 dark:text-zinc-600 truncate hidden sm:inline">{filePath}</span>
          {hasChanges && (
            <span className="text-xs text-amber-500 shrink-0">● modified</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3 h-3" />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <RefreshCw className="w-4 h-4 animate-spin text-gray-400 dark:text-zinc-400" />
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="flex-1 min-h-0 mt-3">
          <textarea
            className="w-full h-full min-h-[400px] bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg p-3 font-mono text-sm text-gray-900 dark:text-zinc-300 resize-none outline-none focus:border-gray-400 dark:focus:border-zinc-700"
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
