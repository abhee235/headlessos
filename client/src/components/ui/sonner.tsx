// shadcn/ui: Sonner Toast — notification system for HeadlessOS
// Windows 11 style notifications

import { Toaster as Sonner } from "sonner";
import { useThemeStore } from "@/store/theme-store";
import { usePreferencesStore } from "@/store/preferences-store";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const toastPosition = usePreferencesStore((s) => s.toastPosition);
  const showToasts = usePreferencesStore((s) => s.showToasts);

  // When user disables notifications, don't render the toast container at all
  if (!showToasts) return null;

  const bottomOffset = toastPosition === 'bottom-right' ? 56 : 12;

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position={toastPosition}
      offset={{ right: 12, bottom: bottomOffset }}
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
