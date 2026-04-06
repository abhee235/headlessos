// M8.3: Web Server Section — nginx sites, config test, SSL certificates + site management
// @see docs/phases/phase-8.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Globe, CheckCircle2, XCircle, Lock, Power, RotateCw, Eye, FileText } from 'lucide-react';
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
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} />
        Loading web server info…
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
        <Globe size={32} className="opacity-40" />
        <p className="text-sm">{data.message || 'Nginx is not installed'}</p>
        <p className="text-xs">Install with: <code className="bg-muted px-1.5 py-0.5 rounded">sudo apt install nginx</code></p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Web Server (Nginx)</h2>
          {testResult && (
            <Badge variant={testResult.success ? 'success' : 'destructive'} className="text-xs">
              {testResult.success ? 'Config OK' : 'Config Error'}
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConfig}
            disabled={busy || testing}
            title="Test configuration"
          >
            {testing ? <Loader2 size={14} className="animate-spin mr-1" /> : <FileText size={14} className="mr-1" />}
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReload}
            disabled={busy}
            title="Reload nginx"
          >
            <RotateCw size={14} className="mr-1" />
            Reload
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestart}
            disabled={busy}
            title="Restart nginx"
          >
            <Power size={14} className="mr-1" />
            Restart
          </Button>
          <Button variant="ghost" size="icon" onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      {/* Config Test Error Output */}
      {testResult && !testResult.success && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm">
          <div className="flex items-center gap-1.5 mb-1 text-destructive font-medium">
            <XCircle size={14} />
            Config Test Failed
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{testResult.output}</pre>
        </div>
      )}

      {/* Sites */}
      <div>
        <h3 className="text-sm font-medium mb-2">
          Sites <Badge variant="secondary" className="ml-1.5 text-xs">{data.sites.length}</Badge>
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site Name</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sites.map((s) => (
              <TableRow key={s.name}>
                <TableCell className="font-mono text-xs">{s.name}</TableCell>
                <TableCell>
                  {s.enabled ? (
                    <Badge variant="success" className="text-xs">
                      <CheckCircle2 size={12} className="mr-1" />
                      Enabled
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewConfig(s.name)}
                      title="View config"
                      className="text-xs"
                    >
                      <Eye size={14} className="mr-1" />
                      Config
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleSite(s.name, s.enabled)}
                      disabled={busy}
                      className="text-xs"
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data.sites.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No sites found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* SSL Certificates */}
      <div>
        <h3 className="text-sm font-medium mb-2">
          <Lock size={14} className="inline mr-1" />
          SSL Certificates
        </h3>
        {data.sslCertificates.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Issuer</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="w-28">Days Left</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sslCertificates.map((cert) => (
                <TableRow key={cert.domain}>
                  <TableCell className="font-mono text-xs">{cert.domain}</TableCell>
                  <TableCell className="text-xs">{cert.issuer}</TableCell>
                  <TableCell className="text-xs">{cert.expiry}</TableCell>
                  <TableCell>
                    <Badge
                      variant={cert.daysRemaining > 30 ? 'success' : cert.daysRemaining > 7 ? 'warning' : 'destructive'}
                      className="text-xs"
                    >
                      {cert.daysRemaining}d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No SSL certificates found (certbot not installed or no certs issued)</p>
        )}
      </div>

      {/* Config Viewer Dialog */}
      <Dialog open={configSite !== null} onOpenChange={(open) => { if (!open) setConfigSite(null); }}>
        <DialogContent className="max-w-2xl max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{configSite}</DialogTitle>
            <DialogDescription>Nginx site configuration (read-only)</DialogDescription>
          </DialogHeader>
          {configLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <Loader2 className="animate-spin mr-2" size={16} />
              Loading config…
            </div>
          ) : (
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 p-4 rounded-md border border-border overflow-auto max-h-[50vh]">
              {configContent}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
