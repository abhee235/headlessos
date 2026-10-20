// shadcn/ui: Button — LumenOS v3 pill buttons (EX8.2)
// 34px pills, radius 999px. Variants map by meaning:
//   default / primary → lit accent pill (the call to action)
//   secondary / outline → neutral glass pill (bg-mat + border-edge)
//   ghost → transparent, bg-fill on hover
//   destructive → danger text on bg-fill (inline delete/abort)
//   danger → solid red, for confirmations only
// @see docs/phases/phase-ex8.md

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-[13px] font-semibold transition-[background,box-shadow,transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "lumen-lit hover:brightness-105",
        primary: "lumen-lit hover:brightness-105",
        destructive: "bg-fill text-danger hover:bg-fill-2",
        danger: "bg-[#D2483F] text-white shadow-[0_6px_18px_-6px_rgba(210,72,63,.55),inset_0_1px_0_rgba(255,255,255,.25)] hover:bg-[#C43F37]",
        outline: "bg-mat border border-edge text-foreground shadow-[var(--lumen-spec)] hover:bg-mat-thick",
        secondary: "bg-mat border border-edge text-foreground shadow-[var(--lumen-spec)] hover:bg-mat-thick",
        ghost: "text-foreground hover:bg-fill active:bg-fill-2",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[34px] px-4",
        sm: "h-[30px] px-3 text-xs",
        lg: "h-10 px-6 text-sm",
        icon: "h-[34px] w-[34px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
