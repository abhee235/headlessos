// EX1.7: Template barrel — exports all templates and registration helper
// @see docs/phases/phase-ex1.md

import type { UITemplate } from '../types.js';

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

/** All built-in templates in registration order. */
export const ALL_TEMPLATES: UITemplate[] = [
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
];

// Re-export individual templates for direct import
export {
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
};
