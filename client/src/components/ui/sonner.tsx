// shadcn/ui: Sonner Toast — notification system for HeadlessOS
// Windows 11 style notifications

import { Toaster as Sonner } from "sonner";
import { useThemeStore } from "@/store/theme-store";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  const theme = useThemeStore((s) => s.theme);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={{ right: 12, bottom: 56 }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl",
          description:
            "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
