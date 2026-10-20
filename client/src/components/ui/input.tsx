// shadcn/ui: Input — LumenOS v3 pill field (EX8.2)
// 34px pill on bg-field with a border-edge hairline.
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-full border border-edge bg-field px-3.5 py-1 text-[13px] text-foreground transition-[box-shadow,border-color]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-label-3",
          "focus-visible:outline-none focus-visible:border-accent-solid/60 focus-visible:ring-[3px] focus-visible:ring-accent-soft",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
