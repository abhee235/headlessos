// M8.4: Packages Section — full package management (update, upgrade, install, remove, search)
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useState, useRef } from 'react';
import { RefreshCw, Loader2, AlertCircle, Package, Download, Trash2, ArrowUpCircle, Search, X, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  fetchPackageInfo,
  aptUpdate,
  aptUpgradeAll,
  installPackage,
  removePackage,
  upgradePackage,
  searchPackages,
} from '@/lib/api';
import type { PackageInfo, AptSearchResult } from '@/lib/api';
import { toast } from 'sonner';

export function PackagesSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AptSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPackageInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setError(res.error || 'Failed to fetch package info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch package info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  // ── Actions ──

  const handleAptUpdate = useCallback(async () => {
    setBusy('update');
    try {
      const res = await aptUpdate(serverId);
      if (res.success) {
        toast.success('Package lists updated');
        load();
      } else {
        toast.error(res.error || 'apt update failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'apt update failed');
    } finally {
      setBusy(null);
    }
  }, [serverId, load]);

  const handleUpgradeAll = useCallback(async () => {
    setBusy('upgrade-all');
    try {
      const res = await aptUpgradeAll(serverId);
      if (res.success) {
        toast.success('All packages upgraded');
        load();
      } else {
        toast.error(res.error || 'apt upgrade failed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'apt upgrade failed');
    } finally {
      setBusy(null);
    }
  }, [serverId, load]);

  const handleUpgradePackage = useCallback(async (pkg: string) => {
    setBusy(`upgrade:${pkg}`);
    try {
      const res = await upgradePackage(serverId, pkg);
      if (res.success) {
        toast.success(`${pkg} upgraded`);
        load();
      } else {
        toast.error(res.error || `Failed to upgrade ${pkg}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to upgrade ${pkg}`);
    } finally {
      setBusy(null);
    }
  }, [serverId, load]);

  const handleInstallPackage = useCallback(async (pkg: string) => {
    setBusy(`install:${pkg}`);
    try {
      const res = await installPackage(serverId, pkg);
      if (res.success) {
        toast.success(`${pkg} installed`);
        load();
        if (searchQuery) {
          const sr = await searchPackages(serverId, searchQuery);
          if (sr.success && sr.data) setSearchResults(sr.data);
        }
      } else {
        toast.error(res.error || `Failed to install ${pkg}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to install ${pkg}`);
    } finally {
      setBusy(null);
    }
  }, [serverId, load, searchQuery]);

  const handleRemovePackage = useCallback(async (pkg: string) => {
    setBusy(`remove:${pkg}`);
    try {
      const res = await removePackage(serverId, pkg);
      if (res.success) {
        toast.success(`${pkg} removed`);
        load();
        if (searchQuery) {
          const sr = await searchPackages(serverId, searchQuery);
          if (sr.success && sr.data) setSearchResults(sr.data);
        }
      } else {
        toast.error(res.error || `Failed to remove ${pkg}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to remove ${pkg}`);
    } finally {
      setBusy(null);
    }
  }, [serverId, load, searchQuery]);

  // ── Search ──

  const doSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchPackages(serverId, query);
      if (res.success && res.data) {
        setSearchResults(res.data);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [serverId]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(value), 500);
  }, [doSearch]);

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-foreground/40">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading package info…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <AlertCircle size={24} />
        <span className="text-sm">{error || 'No data'}</span>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <Package size={32} className="opacity-40" />
        <span className="text-sm">{data.message || 'APT package manager not available'}</span>
        <span className="text-xs">This section requires a Debian/Ubuntu-based system</span>
      </div>
    );
  }

  return (
    <div className="@container p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Packages</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border/50"
            onClick={handleAptUpdate}
            disabled={!!busy}
          >
            {busy === 'update' ? <Loader2 className="animate-spin mr-1" size={14} /> : <RotateCw size={14} className="mr-1" />}
            Update Lists
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/30 hover:text-foreground" onClick={load}>
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-muted/20 rounded-lg">
          <p className="text-xs text-foreground/40">Installed</p>
          <p className="text-2xl font-bold text-foreground">{data.totalInstalled.toLocaleString()}</p>
        </div>
        <div className="p-4 bg-muted/20 rounded-lg">
          <p className="text-xs text-foreground/40">Upgradable</p>
          <p className="text-2xl font-bold text-foreground">
            {data.upgradable.length}
            {data.upgradable.length > 0 && (
              <span className={cn('ml-2 text-xs align-middle px-2 py-0.5 rounded-full font-medium', 'bg-amber-500/10 text-amber-600')}>updates available</span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs: Upgradable / Search */}
      <Tabs defaultValue="upgradable">
        <TabsList className="h-auto p-1 bg-muted rounded-lg gap-1 w-auto inline-flex">
          <TabsTrigger value="upgradable" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            Upgradable
            {data.upgradable.length > 0 && (
              <span className="ml-1.5 text-[11px] tabular-nums opacity-50">{data.upgradable.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="search" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground/50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all hover:text-foreground/70">
            <Search size={14} className="mr-1.5" />
            Search &amp; Install
          </TabsTrigger>
        </TabsList>

        {/* Upgradable tab */}
        <TabsContent value="upgradable" className="mt-4 space-y-3">
          {data.upgradable.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="default"
                size="sm"
                onClick={() => setConfirmAction({
                  title: 'Upgrade All Packages',
                  description: `This will upgrade ${data.upgradable.length} package(s). This may take several minutes. Continue?`,
                  onConfirm: handleUpgradeAll,
                })}
                disabled={!!busy}
              >
                {busy === 'upgrade-all' ? <Loader2 className="animate-spin mr-1" size={14} /> : <ArrowUpCircle size={14} className="mr-1" />}
                Upgrade All ({data.upgradable.length})
              </Button>
            </div>
          )}

          {data.upgradable.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-foreground/30 py-12 text-sm">
              <Package size={32} className="opacity-40 mb-2" />
              <p>All packages are up to date</p>
              <p className="text-xs mt-1 opacity-70">Click &quot;Update Lists&quot; to check for new updates</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Package</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Current</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Available</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Arch</TableHead>
                  <TableHead className="w-24 text-right text-xs font-medium text-foreground/40 h-9">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.upgradable.map((pkg) => (
                  <TableRow key={`${pkg.name}-${pkg.architecture}`} className="border-0 hover:bg-muted/20 group">
                    <TableCell className="font-mono text-xs text-foreground/80">{pkg.name}</TableCell>
                    <TableCell className="text-xs text-foreground/50">{pkg.currentVersion}</TableCell>
                    <TableCell className="text-xs font-medium text-primary">{pkg.newVersion}</TableCell>
                    <TableCell className="text-xs text-foreground/50">{pkg.architecture}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-border/50"
                        disabled={!!busy}
                        onClick={() => handleUpgradePackage(pkg.name)}
                      >
                        {busy === `upgrade:${pkg.name}` ? (
                          <Loader2 className="animate-spin mr-1" size={12} />
                        ) : (
                          <ArrowUpCircle size={12} className="mr-1" />
                        )}
                        Upgrade
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Search & Install tab */}
        <TabsContent value="search" className="mt-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" />
            <Input
              placeholder="Search packages (e.g. nginx, python3, htop)…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-9 shadow-none h-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground"
                onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {searching && (
            <div className="flex items-center justify-center py-8 text-foreground/40">
              <Loader2 className="animate-spin mr-2" size={16} />
              Searching…
            </div>
          )}

          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center text-foreground/30 py-12 text-sm">
              <Search size={24} className="opacity-40 mb-2" />
              <p>No packages found for &quot;{searchQuery}&quot;</p>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-0">
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Package</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Version</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Description</TableHead>
                  <TableHead className="text-xs font-medium text-foreground/40 h-9">Status</TableHead>
                  <TableHead className="w-24 text-right text-xs font-medium text-foreground/40 h-9">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((pkg) => (
                  <TableRow key={`${pkg.name}-${pkg.architecture}`} className="border-0 hover:bg-muted/20 group">
                    <TableCell className="font-mono text-xs text-foreground/80">{pkg.name}</TableCell>
                    <TableCell className="text-xs text-foreground/50">{pkg.version}</TableCell>
                    <TableCell className="text-xs text-foreground/50 max-w-75 truncate">{pkg.description}</TableCell>
                    <TableCell>
                      {pkg.installed ? (
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', 'bg-emerald-500/10 text-emerald-600')}>Installed</span>
                      ) : (
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium', 'bg-foreground/5 text-foreground/50')}>Not installed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {pkg.installed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive border-border/50"
                          disabled={!!busy}
                          onClick={() => setConfirmAction({
                            title: `Remove ${pkg.name}?`,
                            description: `This will remove the package "${pkg.name}" from the server.`,
                            destructive: true,
                            onConfirm: () => handleRemovePackage(pkg.name),
                          })}
                        >
                          {busy === `remove:${pkg.name}` ? (
                            <Loader2 className="animate-spin mr-1" size={12} />
                          ) : (
                            <Trash2 size={12} className="mr-1" />
                          )}
                          Remove
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-border/50"
                          disabled={!!busy}
                          onClick={() => setConfirmAction({
                            title: `Install ${pkg.name}?`,
                            description: `This will install "${pkg.name}" (${pkg.version}) on the server.`,
                            onConfirm: () => handleInstallPackage(pkg.name),
                          })}
                        >
                          {busy === `install:${pkg.name}` ? (
                            <Loader2 className="animate-spin mr-1" size={12} />
                          ) : (
                            <Download size={12} className="mr-1" />
                          )}
                          Install
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {!searching && searchQuery.length < 2 && searchResults.length === 0 && (
            <div className="flex flex-col items-center justify-center text-foreground/30 py-12 text-sm">
              <Search size={32} className="opacity-40 mb-2" />
              <p>Search for packages to install or remove</p>
              <p className="text-xs mt-1 opacity-70">Type at least 2 characters to search</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel="Continue"
          variant={confirmAction.destructive ? 'destructive' : 'default'}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}
