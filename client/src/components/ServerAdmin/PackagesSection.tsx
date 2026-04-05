// M7.2: Packages Section — installed count, upgradable packages
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchPackageInfo } from '@/lib/api';
import type { PackageInfo } from '@/lib/api';

export function PackagesSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading package info…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertCircle size={24} />
        <p className="text-sm">{error || 'No data'}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  if (!data.available) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Package size={32} className="opacity-40" />
        <p className="text-sm">{data.message || 'APT package manager not available'}</p>
        <p className="text-xs">This section requires a Debian/Ubuntu-based system</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Packages</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Installed</p>
          <p className="text-2xl font-bold">{data.totalInstalled.toLocaleString()}</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <p className="text-sm text-muted-foreground">Upgradable</p>
          <p className="text-2xl font-bold">
            {data.upgradable.length}
            {data.upgradable.length > 0 && (
              <Badge variant="warning" className="ml-2 text-xs align-middle">updates available</Badge>
            )}
          </p>
        </div>
      </div>

      {/* Upgradable packages table */}
      {data.upgradable.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Upgradable Packages</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Arch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.upgradable.map((pkg) => (
                <TableRow key={`${pkg.name}-${pkg.architecture}`}>
                  <TableCell className="font-mono text-xs">{pkg.name}</TableCell>
                  <TableCell className="text-xs">{pkg.currentVersion}</TableCell>
                  <TableCell className="text-xs font-medium text-primary">{pkg.newVersion}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{pkg.architecture}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
