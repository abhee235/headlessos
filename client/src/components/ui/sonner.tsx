// shadcn/ui: Sonner Toast — notification system for HeadlessOS
// EX8.4: LumenOS v3 toasts — 360px glass-heavy cards, radius 28px, stacked
// 14px apart above the tray pill.

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

  // Clear the 64px tray pill (+14px margin) at the bottom-right
  const bottomOffset = toastPosition === 'bottom-right' ? 92 : 14;

  return (
    <Sonner
      theme={resolvedTheme}
      // Sonner paints toasts from these variables in its own (unlayered) CSS,
      // so they are overridden here rather than with background utilities.
      className="toaster group ![--normal-bg:var(--lumen-panel)] ![--normal-border:var(--lumen-edge2)] ![--normal-text:var(--lumen-label)]"
      position={toastPosition}
      offset={{ right: 14, bottom: bottomOffset, top: 14 }}
      gap={14}
      toastOptions={{
        classNames: {
          toast:
            "group toast glass-heavy !w-[360px] !gap-3.5 !rounded-[28px] !py-3.5 !pr-3.5 !pl-4 !font-sans !text-foreground",
          title: "!text-[15px] !font-semibold",
          description:
            "!text-[14px] !leading-5 !text-label-2",
          actionButton:
            "lumen-lit !rounded-full !px-3 !text-xs !font-semibold",
          cancelButton:
            "!rounded-full !bg-fill !px-3 !text-xs !text-foreground",
          closeButton: "!border-edge !bg-mat !text-label-2",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
