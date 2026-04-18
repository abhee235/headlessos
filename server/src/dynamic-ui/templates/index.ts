// EX1.7 + EX3-B.3: Template barrel — exports all templates and registration helper
// @see docs/phases/phase-ex3.md

import type { UITemplate } from '../types.js';

// Original 15 templates
import { systemOverviewTemplate } from './system-overview.js';
import { packageListTemplate } from './package-list.js';
import { portTableTemplate } from './port-table.js';
import { logViewerTemplate } from './log-viewer.js';
import { configFileTemplate } from './config-file.js';
import { userListTemplate } from './user-list.js';
import { diskUsageTemplate } from './disk-usage.js';
import { dockerOverviewTemplate } from './docker-overview.js';
import { networkInfoTemplate } from './network-info.js';
import { serviceStatusTemplate } from './service-status.js';
import { gitStatusTemplate } from './git-status.js';
import { processTopTemplate } from './process-top.js';
import { securityAuditTemplate } from './security-audit.js';
import { cronScheduleTemplate } from './cron-schedule.js';
import { databaseInfoTemplate } from './database-info.js';

// EX3-B.3: 12 new templates
import { dockerImagesTemplate } from './docker-images.js';
import { dockerComposeTemplate } from './docker-compose.js';
import { memoryAnalysisTemplate } from './memory-analysis.js';
import { networkInterfacesTemplate } from './network-interfaces.js';
import { systemLogsJournalTemplate } from './system-logs-journal.js';
import { sslCertificatesTemplate } from './ssl-certificates.js';
import { environmentVariablesTemplate } from './environment-variables.js';
import { gitRepositoriesTemplate } from './git-repositories.js';
import { databaseStatusTemplate } from './database-status.js';
import { backupStatusTemplate } from './backup-status.js';
import { kernelModulesTemplate } from './kernel-modules.js';
import { portScanTemplate } from './port-scan.js';

/** All built-in templates in registration order. */
export const ALL_TEMPLATES: UITemplate[] = [
  // Original 15
  systemOverviewTemplate,
  packageListTemplate,
  portTableTemplate,
  logViewerTemplate,
  configFileTemplate,
  userListTemplate,
  diskUsageTemplate,
  dockerOverviewTemplate,
  networkInfoTemplate,
  serviceStatusTemplate,
  gitStatusTemplate,
  processTopTemplate,
  securityAuditTemplate,
  cronScheduleTemplate,
  databaseInfoTemplate,
  // EX3-B.3: 12 new templates
  dockerImagesTemplate,
  dockerComposeTemplate,
  memoryAnalysisTemplate,
  networkInterfacesTemplate,
  systemLogsJournalTemplate,
  sslCertificatesTemplate,
  environmentVariablesTemplate,
  gitRepositoriesTemplate,
  databaseStatusTemplate,
  backupStatusTemplate,
  kernelModulesTemplate,
  portScanTemplate,
];

// Re-export individual templates for direct import
export {
  // Original 15
  systemOverviewTemplate,
  packageListTemplate,
  portTableTemplate,
  logViewerTemplate,
  configFileTemplate,
  userListTemplate,
  diskUsageTemplate,
  dockerOverviewTemplate,
  networkInfoTemplate,
  serviceStatusTemplate,
  gitStatusTemplate,
  processTopTemplate,
  securityAuditTemplate,
  cronScheduleTemplate,
  databaseInfoTemplate,
  // EX3-B.3: 12 new templates
  dockerImagesTemplate,
  dockerComposeTemplate,
  memoryAnalysisTemplate,
  networkInterfacesTemplate,
  systemLogsJournalTemplate,
  sslCertificatesTemplate,
  environmentVariablesTemplate,
  gitRepositoriesTemplate,
  databaseStatusTemplate,
  backupStatusTemplate,
  kernelModulesTemplate,
  portScanTemplate,
};
