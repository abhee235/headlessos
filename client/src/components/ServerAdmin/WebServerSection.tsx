// M7.2: Web Server Section — nginx sites, config test, SSL certificates
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertCircle, Globe, CheckCircle2, XCircle, Lock } from 'lucide-react';
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
import { fetchWebServerInfo } from '@/lib/api';
import type { WebServerInfo } from '@/lib/api';

export function WebServerSection({ serverId }: { serverId: string }) {
  const [data, setData] = useState<WebServerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWebServerInfo(serverId);
      if (res.success && res.data) {
        setData(res.data);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          <h2 className="text-lg font-semibold">Web Server (Nginx)</h2>
          {data.configTest && (
            <Badge variant={data.configTest.success ? 'success' : 'destructive'} className="text-xs">
              {data.configTest.success ? 'Config OK' : 'Config Error'}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Config Test Output */}
      {data.configTest && !data.configTest.success && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm">
          <div className="flex items-center gap-1.5 mb-1 text-destructive font-medium">
            <XCircle size={14} />
            Config Test Failed
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{data.configTest.output}</pre>
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
              </TableRow>
            ))}
            {data.sites.length === 0 && (
              <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No sites found</TableCell></TableRow>
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
    </div>
  );
}
