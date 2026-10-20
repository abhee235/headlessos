// M8.4: Packages Section — full package management (update, upgrade, install, remove, search)
// EX8.6: LumenOS v3 — section header, stat cards, lit segmented tabs, glass table cards.
// @see docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState, useRef } from 'react';
import { Package, PackageCheck, Download, Trash2, ArrowUpCircle, Search, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, SegmentTabs, SearchField, TableCard, HeadRow, Th, Tr, Td,
  MonoChip, StatCard, EmptyState, ErrorState,
} from './admin-ui';

export function PackagesSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Active sub-tab (controlled so the active pill can be lit)
  const [tab, setTab] = useState('upgradable');

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
    return <LoadingView label="Loading package info…" fullHeight={false} />;
  }

  if (error || !data) {
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  if (!data.available) {
    return (
      <SectionBody>
        <SectionHeader icon={Package} title="Packages" badge={<Badge variant="secondary">Unavailable</Badge>} />
        <EmptyState
          icon={Package}
          title={data.message || 'APT package manager not available'}
          description="This section requires a Debian/Ubuntu-based system"
        />
      </SectionBody>
    );
  }

  return (
    <SectionBody>
      {/* Header */}
      <SectionHeader
        icon={Package}
        title="Packages"
        subtitle={`apt · ${data.totalInstalled.toLocaleString()} installed`}
        actions={
          <>
            <Button
              variant="default"
              onClick={handleAptUpdate}
              disabled={!!busy}
            >
              {busy === 'update' ? <Spinner size={14} /> : <RotateCw strokeWidth={1.75} />}
              Update lists
            </Button>
            <RefreshButton onClick={load} />
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Installed" value={data.totalInstalled.toLocaleString()} caption="apt packages" />
        <StatCard
          label="Upgradable"
          value={
            <>
              {data.upgradable.length}
              {data.upgradable.length > 0 && (
                <Badge variant="warning" className="tracking-normal">updates available</Badge>
              )}
            </>
          }
        />
      </div>

      {/* Tabs: Upgradable / Search */}
      <Tabs value={tab} onValueChange={setTab}>
        <SegmentTabs
          value={tab}
          items={[
            { value: 'upgradable', label: 'Upgradable', count: data.upgradable.length > 0 ? data.upgradable.length : undefined },
            { value: 'search', label: 'Search & install' },
          ]}
        />

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
                {busy === 'upgrade-all' ? <Spinner size={14} /> : <ArrowUpCircle strokeWidth={1.75} />}
                Upgrade All ({data.upgradable.length})
              </Button>
            </div>
          )}

          {data.upgradable.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="All packages are up to date"
              description={'Click "Update lists" to check for new updates'}
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <HeadRow>
                    <Th>Package</Th>
                    <Th>Current</Th>
                    <Th>Available</Th>
                    <Th>Arch</Th>
                    <Th className="w-32 text-right">Action</Th>
                  </HeadRow>
                </TableHeader>
                <TableBody>
                  {data.upgradable.map((pkg) => (
                    <Tr key={`${pkg.name}-${pkg.architecture}`}>
                      <Td className="font-mono font-semibold text-foreground">{pkg.name}</Td>
                      <Td className="font-mono text-[13px] text-label-2">{pkg.currentVersion}</Td>
                      <Td className="font-mono text-[13px] font-medium text-accent-text">{pkg.newVersion}</Td>
                      <Td>
                        <MonoChip>{pkg.architecture}</MonoChip>
                      </Td>
                      <Td className="text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!!busy}
                          onClick={() => handleUpgradePackage(pkg.name)}
                        >
                          {busy === `upgrade:${pkg.name}` ? (
                            <Spinner size={12} />
                          ) : (
                            <ArrowUpCircle strokeWidth={1.75} />
                          )}
                          Upgrade
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </TabsContent>

        {/* Search & Install tab */}
        <TabsContent value="search" className="mt-4 space-y-3">
          <SearchField
            wrapperClassName="w-full max-w-xl"
            placeholder="Search packages (e.g. nginx, python3, htop)…"
            value={searchQuery}
            onValueChange={handleSearchChange}
            onClear={() => { setSearchQuery(''); setSearchResults([]); }}
          />

          {searching && (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-label-3">
              <Spinner size={16} />
              Searching…
            </div>
          )}

          {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <EmptyState icon={Search} title={<>No packages found for &quot;{searchQuery}&quot;</>} />
          )}

          {!searching && searchResults.length > 0 && (
            <TableCard>
              <Table>
                <TableHeader>
                  <HeadRow>
                    <Th>Package</Th>
                    <Th>Version</Th>
                    <Th>Description</Th>
                    <Th>Status</Th>
                    <Th className="w-32 text-right">Action</Th>
                  </HeadRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((pkg) => (
                    <Tr key={`${pkg.name}-${pkg.architecture}`}>
                      <Td className="font-mono font-semibold text-foreground">{pkg.name}</Td>
                      <Td className="font-mono text-[13px] text-label-2">{pkg.version}</Td>
                      <Td className="text-label-2"><div className="max-w-75 truncate">{pkg.description}</div></Td>
                      <Td>
                        {pkg.installed ? (
                          <Badge variant="success">Installed</Badge>
                        ) : (
                          <Badge variant="secondary">Not installed</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        {pkg.installed ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => setConfirmAction({
                              title: `Remove ${pkg.name}?`,
                              description: `This will remove the package "${pkg.name}" from the server.`,
                              destructive: true,
                              onConfirm: () => handleRemovePackage(pkg.name),
                            })}
                          >
                            {busy === `remove:${pkg.name}` ? (
                              <Spinner size={12} />
                            ) : (
                              <Trash2 strokeWidth={1.75} />
                            )}
                            Remove
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!!busy}
                            onClick={() => setConfirmAction({
                              title: `Install ${pkg.name}?`,
                              description: `This will install "${pkg.name}" (${pkg.version}) on the server.`,
                              onConfirm: () => handleInstallPackage(pkg.name),
                            })}
                          >
                            {busy === `install:${pkg.name}` ? (
                              <Spinner size={12} />
                            ) : (
                              <Download strokeWidth={1.75} />
                            )}
                            Install
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}

          {!searching && searchQuery.length < 2 && searchResults.length === 0 && (
            <EmptyState
              icon={Search}
              title="Search for packages to install or remove"
              description="Type at least 2 characters to search"
            />
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
    </SectionBody>
  );
}
