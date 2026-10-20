// M8.3: Web Server Section — nginx sites, config test, SSL certificates + site management
// EX8.6: LumenOS v3 — section header with glass pill actions, sites/SSL table cards, empty states.
// @see docs/phases/phase-8.md, docs/phases/phase-ex8.md

import { useCallback, useEffect, useState } from 'react';
import { Globe, CheckCircle2, XCircle, Lock, Power, RotateCw, Eye, FileText, Ban, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableHeader,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  fetchWebServerInfo,
  enableNginxSite,
  disableNginxSite,
  reloadNginx,
  restartNginx,
  fetchNginxSiteConfig,
  testNginxConfig,
} from '@/lib/api';
import type { WebServerInfo } from '@/lib/api';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { LoadingView } from '@/components/ui/loading-view';
import {
  SectionBody, SectionHeader, RefreshButton, TableCard, CardHeading, HeadRow, Th, Tr, Td,
  EmptyRow, EmptyState, ErrorState,
} from './admin-ui';

export function WebServerSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<WebServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // M8.3 — Config viewer state
  const [configSite, setConfigSite] = useState<string | null>(null);
  const [configContent, setConfigContent] = useState('');
  const [configLoading, setConfigLoading] = useState(false);

  // M8.3 — Config test inline state
  const [testResult, setTestResult] = useState<{ success: boolean; output: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWebServerInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
        // Use pre-fetched config test from main fetch
        if (res.data.configTest) {
          setTestResult(res.data.configTest);
        }
      } else {
        setError(res.error || 'Failed to fetch web server info');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch web server info');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  // M8.3 — Enable/disable a site
  const handleToggleSite = async (site: string, currentlyEnabled: boolean) => {
    setBusy(true);
    try {
      const res = currentlyEnabled
        ? await disableNginxSite(serverId, site)
        : await enableNginxSite(serverId, site);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || `Failed to ${currentlyEnabled ? 'disable' : 'enable'} site`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  // M8.3 — Reload nginx
  const handleReload = async () => {
    setBusy(true);
    try {
      const res = await reloadNginx(serverId);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || 'Failed to reload nginx');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reload nginx');
    } finally {
      setBusy(false);
    }
  };

  // M8.3 — Restart nginx
  const handleRestart = async () => {
    setBusy(true);
    try {
      const res = await restartNginx(serverId);
      if (res.success) {
        toast.success(res.message);
        await load();
      } else {
        toast.error(res.error || 'Failed to restart nginx');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restart nginx');
    } finally {
      setBusy(false);
    }
  };

  // M8.3 — Test config
  const handleTestConfig = async () => {
    setTesting(true);
    try {
      const res = await testNginxConfig(serverId);
      if (res.success && res.data) {
        setTestResult(res.data);
        if (res.data.success) {
          toast.success('Config test passed');
        } else {
          toast.error('Config test failed');
        }
      } else {
        toast.error(res.error || 'Failed to test config');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to test config');
    } finally {
      setTesting(false);
    }
  };

  // M8.3 — View site config
  const handleViewConfig = async (site: string) => {
    setConfigSite(site);
    setConfigContent('');
    setConfigLoading(true);
    try {
      const res = await fetchNginxSiteConfig(serverId, site);
      if (res.success && res.data) {
        setConfigContent(res.data.config);
      } else {
        setConfigContent(`# Error: ${res.error || 'Failed to read config'}`);
      }
    } catch (err) {
      setConfigContent(`# Error: ${err instanceof Error ? err.message : 'Failed to read config'}`);
    } finally {
      setConfigLoading(false);
    }
  };

  if (loading) {
    return <LoadingView label="Loading web server info…" fullHeight={false} />;
  }

  if (error || !data) {
    return <ErrorState message={error || 'No data'} onRetry={load} />;
  }

  if (!data.available) {
    return (
      <SectionBody>
        <SectionHeader icon={Globe} title="Web server" badge={<Badge variant="secondary">Not installed</Badge>} />
        <EmptyState
          icon={Globe}
          title={data.message || 'Nginx is not installed'}
          description="Install with:"
          code="sudo apt install nginx"
        />
      </SectionBody>
    );
  }

  const enabledCount = data.sites.filter((s) => s.enabled).length;

  return (
    <SectionBody>
      {/* Header + Actions */}
      <SectionHeader
        icon={Globe}
        title="Web server"
        badge={testResult && (
          <Badge variant={testResult.success ? 'success' : 'destructive'}>
            {testResult.success ? 'Config OK' : 'Config Error'}
          </Badge>
        )}
        subtitle={`nginx · ${enabledCount} of ${data.sites.length} sites enabled`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={handleTestConfig}
              disabled={busy || testing}
              title="Test configuration"
            >
              {testing ? <Spinner size={14} /> : <FileText strokeWidth={1.75} />}
              Test
            </Button>
            <Button
              variant="secondary"
              onClick={handleReload}
              disabled={busy}
              title="Reload nginx"
            >
              <RotateCw strokeWidth={1.75} />
              Reload
            </Button>
            <Button
              variant="secondary"
              onClick={handleRestart}
              disabled={busy}
              title="Restart nginx"
            >
              <Power strokeWidth={1.75} />
              Restart
            </Button>
            <RefreshButton onClick={load} disabled={busy} spinning={busy} />
          </>
        }
      />

      {/* Config Test Error Output */}
      {testResult && !testResult.success && (
        <div className="rounded-[16px] border border-danger/30 bg-danger/10 p-4 text-[13px]">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-danger">
            <XCircle size={15} strokeWidth={1.75} />
            Config Test Failed
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[12px] text-label-2">{testResult.output}</pre>
        </div>
      )}

      {/* Sites */}
      <TableCard>
        <CardHeading title="Sites" count={data.sites.length} />
        <Table>
          <TableHeader>
            <HeadRow>
              <Th>Site name</Th>
              <Th className="w-32">Status</Th>
              <Th className="w-56 text-right">Actions</Th>
            </HeadRow>
          </TableHeader>
          <TableBody>
            {data.sites.map((s) => (
              <Tr key={s.name}>
                <Td className="font-mono font-semibold text-foreground">{s.name}</Td>
                <Td>
                  {s.enabled ? (
                    <Badge variant="success">
                      <CheckCircle2 size={12} strokeWidth={2} />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleViewConfig(s.name)}
                      title="View config"
                    >
                      <Eye strokeWidth={1.75} />
                      Config
                    </Button>
                    <Button
                      variant={s.enabled ? 'destructive' : 'secondary'}
                      size="sm"
                      onClick={() => handleToggleSite(s.name, s.enabled)}
                      disabled={busy}
                    >
                      {s.enabled ? <Ban strokeWidth={1.75} /> : <CheckCircle2 strokeWidth={1.75} />}
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
            {data.sites.length === 0 && (
              <EmptyRow colSpan={3}>No sites found</EmptyRow>
            )}
          </TableBody>
        </Table>
      </TableCard>

      {/* SSL Certificates */}
      {data.sslCertificates.length > 0 ? (
        <TableCard>
          <CardHeading title="SSL certificates" icon={Lock} count={data.sslCertificates.length} />
          <Table>
            <TableHeader>
              <HeadRow>
                <Th>Domain</Th>
                <Th>Issuer</Th>
                <Th>Expiry</Th>
                <Th className="w-28">Days left</Th>
              </HeadRow>
            </TableHeader>
            <TableBody>
              {data.sslCertificates.map((cert) => (
                <Tr key={cert.domain}>
                  <Td className="font-mono font-semibold text-foreground">{cert.domain}</Td>
                  <Td className="text-label-2">{cert.issuer}</Td>
                  <Td className="text-label-2">{cert.expiry}</Td>
                  <Td>
                    <Badge
                      variant={
                        cert.daysRemaining > 30
                          ? 'success'
                          : cert.daysRemaining > 7
                            ? 'warning'
                            : 'destructive'
                      }
                      className="tabular-nums"
                    >
                      {cert.daysRemaining}d
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No SSL certificates found"
          description="certbot not installed or no certs issued"
        />
      )}

      {/* Config Viewer Dialog */}
      <Dialog open={configSite !== null} onOpenChange={(open) => { if (!open) setConfigSite(null); }}>
        <DialogContent className="max-h-[70vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{configSite}</DialogTitle>
            <DialogDescription>Nginx site configuration (read-only)</DialogDescription>
          </DialogHeader>
          {configLoading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-[13px] text-label-3">
              <Spinner size={16} />
              Loading config…
            </div>
          ) : (
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-[14px] border border-edge bg-paper p-4 font-mono text-[12px] text-foreground">
              {configContent}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </SectionBody>
  );
}
