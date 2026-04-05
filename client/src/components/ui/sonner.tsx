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
            "group toast group-[.toaster]:bg-white dark:group-[.toaster]:bg-zinc-900 group-[.toaster]:text-zinc-900 dark:group-[.toaster]:text-zinc-100 group-[.toaster]:border group-[.toaster]:border-zinc-200 dark:group-[.toaster]:border-zinc-700 group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl",
          description:
            "group-[.toast]:text-zinc-500 dark:group-[.toast]:text-zinc-400",
          actionButton:
            "group-[.toast]:bg-[rgb(var(--primary))] group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-zinc-100 dark:group-[.toast]:bg-zinc-800 group-[.toast]:text-zinc-600 dark:group-[.toast]:text-zinc-400",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
