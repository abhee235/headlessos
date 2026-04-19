// EX1.2: ProgressBar Widget — progress bar with label and variant
// @see docs/phases/phase-ex1.md

import type { z } from 'zod';
import type { ProgressBarWidgetSchema } from 'headlessos-shared/schemas/dynamic-view';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ProgressBarWidget = z.infer<typeof ProgressBarWidgetSchema>;

const variantClasses: Record<string, string> = {
  default: '[&>div]:bg-primary',
  success: '[&>div]:bg-success',
  warning: '[&>div]:bg-warning',
  destructive: '[&>div]:bg-destructive',
};

export function ProgressBarWidget({ widget }: { widget: ProgressBarWidget }) {
  const { title, value, label, variant } = widget;

  return (
    <Card>
      {title && (
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={title ? 'pt-0' : 'pt-4'}>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            {label && <span className="text-muted-foreground">{label}</span>}
            <span className="font-medium">{value}%</span>
          </div>
          <Progress
            value={value}
            className={cn('h-2', variantClasses[variant] ?? variantClasses.default)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
