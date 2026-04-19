// File Search Dialog — Ctrl+F search across server filesystem
// Uses `find` command via SSH with -iname glob matching

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
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="w-4 h-4" />
            Search Files
          </DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by filename... (e.g., *.log, config, nginx)"
              className="pl-10 h-9 text-sm"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearched(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
            <span>Searching in: <span className="text-foreground/60 font-mono">{currentPath}</span></span>
          </div>
        </div>

        {/* Results */}
        <div className="border-t border-border/30">
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Spinner className="w-4 h-4" />
              <span className="text-xs">Searching...</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {!loading && !error && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="w-6 h-6 mb-2 opacity-40" />
              <span className="text-xs">No files found matching &quot;{query}&quot;</span>
            </div>
          )}

          {!loading && !error && !searched && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="w-6 h-6 mb-2 opacity-30" />
              <span className="text-xs">Type at least 2 characters to search</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            <ScrollArea className="max-h-75">
              <div className="py-1">
                {results.map((result, idx) => (
                  <button
                    key={`${result.path}-${idx}`}
                    onClick={() => handleResultClick(result)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                      {result.type === 'directory' ? (
                        <FolderSVG size={20} className="w-5 h-5" />
                      ) : (
                        <FileIcon name={result.name} size="sm" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{result.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {getParentDir(result.path)}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {result.type === 'directory' ? 'folder' : 'file'}
                    </Badge>
                  </button>
                ))}
              </div>
              {truncated && (
                <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/20 text-center">
                  Results limited to 200 items. Try a more specific search.
                </div>
              )}
            </ScrollArea>
          )}
        </div>

        {/* Footer with count */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border/20 text-[11px] text-muted-foreground">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
