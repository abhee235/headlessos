// shadcn/ui: Switch — LumenOS v3 (EX8.2): 46×28 pill, accent gradient when on, 22px white knob
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-7 w-[46px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-[background] duration-200",
      "shadow-[inset_0_1px_2px_rgba(0,0,0,.15)]",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[linear-gradient(180deg,var(--lumen-accent-hi),var(--lumen-accent))] data-[state=unchecked]:bg-fill-2",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] ring-0 transition-transform duration-200",
        "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
