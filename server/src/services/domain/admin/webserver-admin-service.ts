// M12.4: WebServerAdminService — Nginx site/cert management
// @see docs/phases/phase-12.md

import { DomainService, ok, fail, type ServiceResult } from '../base.js';
import { validateNginxSiteName } from '../../../security/validators.js';
import {
  parseNginxSites,
  parseNginxConfigTest,
  parseCertbotCertificates,
} from '../../../parsers/deterministic/nginx.js';
import {
  WebServerInfoSchema,
  NginxSiteConfigSchema,
  type WebServerInfo,
} from '../../../parsers/schemas/serveradmin.js';
import { z } from 'zod';

export class WebServerAdminService extends DomainService {
  async getWebServerInfo(
    serverId: string,
  ): Promise<ServiceResult<WebServerInfo>> {
    this.requireConnected(serverId);

    // Detect nginx — check config file first, fall back to `which`
    let isInstalled = false;
    const confCheck = await this.exec(serverId, 'ls /etc/nginx/nginx.conf', 5_000);
    if (confCheck.exitCode === 0) {
      isInstalled = true;
    } else {
      const binCheck = await this.exec(serverId, 'sudo which nginx', 5_000);
      if (binCheck.exitCode === 0 && binCheck.stdout.trim().length > 0) {
        isInstalled = true;
      }
    }

    if (!isInstalled) {
      return ok({
        available: false,
        sites: [],
        sslCertificates: [],
        message: 'Nginx is not installed',
      });
    }

    const [available, enabled, configTest, certbot] = await Promise.all([
      this.safeExec(serverId, 'ls -1 /etc/nginx/sites-available/ 2>/dev/null'),
      this.safeExec(serverId, 'ls -1 /etc/nginx/sites-enabled/ 2>/dev/null'),
      this.safeExec(serverId, 'sudo nginx -t 2>&1'),
      this.safeExec(serverId, 'sudo certbot certificates 2>/dev/null'),
    ]);

    const data = WebServerInfoSchema.parse({
      available: true,
      sites: parseNginxSites(`${available}---ENABLED---${enabled}`),
      configTest: parseNginxConfigTest(configTest),
      sslCertificates: parseCertbotCertificates(certbot),
    });
    return ok(data);
  }

  async enableSite(
    serverId: string,
    site: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateNginxSiteName(site)) return fail('Invalid site name', 400);
    return this.execAction(
      serverId,
      `sudo ln -sf /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}`,
      `Site '${site}' enabled`,
    );
  }

  async disableSite(
    serverId: string,
    site: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    if (!validateNginxSiteName(site)) return fail('Invalid site name', 400);
    return this.execAction(
      serverId,
      `sudo rm /etc/nginx/sites-enabled/${site}`,
      `Site '${site}' disabled`,
    );
  }

  async reloadNginx(
    serverId: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    return this.execAction(serverId, 'sudo nginx -s reload', 'Nginx reloaded');
  }

  async restartNginx(
    serverId: string,
  ): Promise<ServiceResult<{ message: string }>> {
    this.requireConnected(serverId);
    return this.execAction(
      serverId,
      'sudo systemctl restart nginx',
      'Nginx restarted',
    );
  }

  async readSiteConfig(
    serverId: string,
    site: string,
  ): Promise<ServiceResult<z.infer<typeof NginxSiteConfigSchema>>> {
    this.requireConnected(serverId);
    if (!validateNginxSiteName(site)) return fail('Invalid site name', 400);

    const r = await this.exec(
      serverId,
      `sudo cat /etc/nginx/sites-available/${site}`,
      10_000,
    );
    if (r.exitCode !== 0) return fail('Site config not found', 404);
    return ok(NginxSiteConfigSchema.parse({ site, config: r.stdout }));
  }

  async testNginxConfig(
    serverId: string,
  ): Promise<ServiceResult<ReturnType<typeof parseNginxConfigTest>>> {
    this.requireConnected(serverId);
    const r = await this.exec(serverId, 'sudo nginx -t 2>&1', 10_000);
    return ok(parseNginxConfigTest(r.stdout || r.stderr));
  }
}
