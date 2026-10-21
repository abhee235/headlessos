// shadcn/ui: Textarea — multi-line text input
// EX8.6: LumenOS v3 — bg-field + border-edge, 14px radius, accent focus glow
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-[14px] border border-edge bg-field px-3.5 py-2.5 text-[13px] text-foreground transition-[box-shadow,border-color] placeholder:text-label-3 focus-visible:outline-none focus-visible:border-accent-solid/60 focus-visible:ring-[3px] focus-visible:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
