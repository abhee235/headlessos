// EX1.2: Alert Widget — informational alert banner
// EX8.6: .lumen-section (radius 20px) with a tinted round icon
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { AlertWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { LumenAlert, type AlertTone } from './widget-card';

type AlertWidget = z.infer<typeof AlertWidgetSchema>;

const TONES: Record<string, AlertTone> = {
  default: 'default',
  destructive: 'destructive',
  success: 'success',
  warning: 'warning',
};

export function AlertWidget({ widget }: { widget: AlertWidget }) {
  const { title, message, variant } = widget;

  return (
    <LumenAlert tone={TONES[variant] ?? 'default'} title={title}>
      {message}
    </LumenAlert>
  );
}
