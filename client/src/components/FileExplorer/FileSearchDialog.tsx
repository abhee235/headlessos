// File Search Dialog — Ctrl+F search across server filesystem
// Uses `find` command via SSH with -iname glob matching
// EX8.6: LumenOS v3 — relies on the glass Dialog; inner rows use tokens only.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, FileText, Folder, AlertCircle, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { searchFiles, type FileSearchResult } from '../../lib/api';
import { FileIcon, FolderSVG } from '../ui/FileIcon';
import { Spinner } from '@/components/ui/spinner';

interface FileSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export function FileSearchDialog({
  open,
  onOpenChange,
  serverId,
  currentPath,
  onNavigate,
  onOpenFile,
}: FileSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      // Reset state
      setQuery('');
      setResults([]);
      setError(null);
      setSearched(false);
      setTruncated(false);
    }
  }, [open]);

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const response = await searchFiles(serverId, currentPath, searchQuery.trim());
      setResults(response.results);
      setTruncated(response.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, currentPath]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    // Debounce: search 400ms after user stops typing
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 400);
  }, [doSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(query);
    }
  }, [query, doSearch]);

  const handleResultClick = useCallback((result: FileSearchResult) => {
    onOpenChange(false);
    if (result.type === 'directory') {
      onNavigate(result.path);
    } else {
      // Navigate to the parent directory, then open the file
      const parentPath = result.path.split('/').slice(0, -1).join('/') || '/';
      onNavigate(parentPath);
      // Small delay so directory loads first
      setTimeout(() => onOpenFile(result.path), 200);
    }
  }, [onOpenChange, onNavigate, onOpenFile]);

  const getParentDir = (fullPath: string) => {
    const parts = fullPath.split('/');
    parts.pop();
    return parts.join('/') || '/';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Search className="h-[18px] w-[18px] text-accent-solid" strokeWidth={1.75} />
            Search Files
          </DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="px-5 pt-3.5 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-label-3" strokeWidth={1.75} />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by filename... (e.g., *.log, config, nginx)"
              className="pl-10 pr-9"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-label-3 transition-colors duration-150 hover:bg-fill hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span>Searching in: <span className="font-mono text-label-3">{currentPath}</span></span>
          </div>
        </div>

        {/* Results */}
        <div className="border-t border-border">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Spinner className="h-4 w-4" />
              <span className="text-[13px]">Searching...</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-danger">
              <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
              <span className="text-[13px]">{error}</span>
            </div>
          )}

          {!loading && !error && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="mb-2 h-6 w-6 text-label-3" strokeWidth={1.5} />
              <span className="text-[13px]">No files found matching &quot;{query}&quot;</span>
            </div>
          )}

          {!loading && !error && !searched && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="mb-2 h-6 w-6 text-label-3 opacity-70" strokeWidth={1.5} />
              <span className="text-[13px]">Type at least 2 characters to search</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ScrollArea className="max-h-75">
              <div className="flex flex-col gap-px p-2">
                {results.map((result, idx) => (
                  <button
                    key={`${result.path}-${idx}`}
                    onClick={() => handleResultClick(result)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors duration-150 hover:bg-fill"
                  >
                    <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                      {result.type === 'directory' ? (
                        <FolderSVG size={20} className="w-5 h-5" />
                      ) : (
                        <FileIcon name={result.name} size="sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[13px] font-medium text-foreground">{result.name}</div>
                      <div className="truncate font-mono text-[11px] text-label-3">
                        {getParentDir(result.path)}
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {result.type === 'directory' ? 'folder' : 'file'}
                    </Badge>
                  </button>
                ))}
              </div>
              {truncated && (
                <div className="border-t border-border px-5 py-2 text-center text-xs text-muted-foreground">
                  Results limited to 200 items. Try a more specific search.
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        {/* Footer with count */}
        {results.length > 0 && (
          <div className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
