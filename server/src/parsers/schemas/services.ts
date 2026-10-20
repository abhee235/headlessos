// M4.6: Zod schemas for systemd service parsing
// @see docs/phases/phase-4.md

import { z } from 'zod';

/** EX8.9: boot behaviour of a service (systemd unit file state / SysV rc2.d link) */
export const ServiceStartupSchema = z.enum(['automatic', 'manual', 'disabled']);

export type ServiceStartup = z.infer<typeof ServiceStartupSchema>;

export const ServiceInfoSchema = z.object({
  name: z.string().min(1),
  loadState: z.enum(['loaded', 'not-found', 'masked']),
  activeState: z.enum(['active', 'inactive', 'failed', 'activating', 'deactivating']),
  subState: z.string(),
  description: z.string(),
  // EX8.9 (additive): null when unknown
  startup: ServiceStartupSchema.nullable().optional(),
  pid: z.number().int().positive().nullable().optional(),
});

export type ServiceInfoParsed = z.infer<typeof ServiceInfoSchema>;

export const ServiceListSchema = z.array(ServiceInfoSchema);

export type ServiceListParsed = z.infer<typeof ServiceListSchema>;
