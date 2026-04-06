// M4.6: Zod schemas for systemd service parsing
// @see docs/phases/phase-4.md

import { z } from 'zod';

export const ServiceInfoSchema = z.object({
  name: z.string().min(1),
  loadState: z.enum(['loaded', 'not-found', 'masked']),
  activeState: z.enum(['active', 'inactive', 'failed', 'activating', 'deactivating']),
  subState: z.string(),
  description: z.string(),
});

export type ServiceInfoParsed = z.infer<typeof ServiceInfoSchema>;

export const ServiceListSchema = z.array(ServiceInfoSchema);

export type ServiceListParsed = z.infer<typeof ServiceListSchema>;
