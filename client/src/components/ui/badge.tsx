// shadcn/ui: Badge — LumenOS v3 status labels (EX8.2)
// Muted rounded rectangles (radius 6px): ~14% tinted fill + ~30% border of the same hue.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold leading-4 transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
  {
    variants: {
      variant: {
        default: "border-accent-solid/30 bg-accent-solid/14 text-accent-text",
        secondary: "border-edge bg-fill text-label-2",
        destructive: "border-danger/30 bg-danger/14 text-danger",
        outline: "border-edge bg-transparent text-label-2",
        success: "border-success/30 bg-success/14 text-success",
        warning: "border-warning/30 bg-warning/14 text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
