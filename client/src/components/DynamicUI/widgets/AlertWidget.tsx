// EX1.2: Alert Widget — informational alert banner
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { AlertWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type AlertWidget = z.infer<typeof AlertWidgetSchema>;

const variantConfig: Record<string, {
  shadcnVariant: 'default' | 'destructive';
  icon: LucideIcon;
  className: string;
}> = {
  default: { shadcnVariant: 'default', icon: Info, className: '' },
  destructive: { shadcnVariant: 'destructive', icon: AlertCircle, className: '' },
  success: { shadcnVariant: 'default', icon: CheckCircle2, className: 'border-success/50 text-success [&>svg]:text-success' },
  warning: { shadcnVariant: 'default', icon: AlertTriangle, className: 'border-warning/50 text-warning [&>svg]:text-warning' },
};

export function AlertWidget({ widget }: { widget: AlertWidget }) {
  const { title, message, variant } = widget;
  const config = variantConfig[variant] ?? variantConfig.default;
  const Icon = config.icon;

  return (
    <Alert variant={config.shadcnVariant} className={config.className}>
      <Icon className="h-4 w-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
