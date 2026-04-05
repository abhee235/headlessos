// shadcn/ui: Popover — floating content panel (Radix)
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-[9999] w-72 rounded-xl p-4 text-[rgb(var(--popover-foreground))] outline-none",
        "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl backdrop-saturate-[1.8]",
        "border border-white/60 dark:border-white/[0.12]",
        "shadow-xl shadow-black/[0.08] dark:shadow-black/40",
        "ring-1 ring-black/[0.04] dark:ring-white/[0.05]",
        "animate-contextMenuIn",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
