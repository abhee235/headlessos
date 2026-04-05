// AppWindow — Windows 11-style reusable window/dialog component
// Compound component with: TitleBar, Sidebar, Toolbar, Body, Footer zones
// Wraps Radix Dialog for modal overlay behavior + accessibility
//
// Usage:
//   <AppWindow open={open} onOpenChange={setOpen} size="lg" title="Settings" icon={Settings}>
//     <AppWindow.Sidebar>
//       <AppWindow.SidebarItem id="general" icon={Cog} label="General" active />
//     </AppWindow.Sidebar>
//     <AppWindow.Toolbar>
//       <Button size="sm">Action</Button>
//     </AppWindow.Toolbar>
//     <AppWindow.Body>
//       <p>Content here</p>
//     </AppWindow.Body>
//     <AppWindow.Footer>
//       <span className="text-xs">Status text</span>
//     </AppWindow.Footer>
//   </AppWindow>

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LucideIcon } from 'lucide-react';

// ── Size Presets ──────────────────────────────────────────────────
export type AppWindowSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PRESETS: Record<AppWindowSize, { width: number; height: number }> = {
  xs: { width: 380, height: 260 },
  sm: { width: 480, height: 400 },
  md: { width: 680, height: 520 },
  lg: { width: 900, height: 620 },
  xl: { width: 1100, height: 720 },
};

// ── Context ──────────────────────────────────────────────────────
interface AppWindowContextValue {
  size: AppWindowSize;
}

const AppWindowContext = React.createContext<AppWindowContextValue>({ size: 'md' });

// ── Sidebar Item ─────────────────────────────────────────────────
interface SidebarItemProps {
  id: string;
  icon?: LucideIcon;
  label: string;
  active?: boolean;
  badge?: string | number;
  disabled?: boolean;
  onClick?: () => void;
}

function SidebarItem({
  icon: Icon,
  label,
  active = false,
  badge,
  disabled = false,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-[7px] rounded-lg text-[13px] transition-colors text-left',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--ring))]',
        active
          ? 'bg-[rgb(var(--accent))] text-[rgb(var(--foreground))] font-medium'
          : 'text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))] hover:bg-[rgb(var(--accent))]/50',
        disabled && 'opacity-40 pointer-events-none',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && <Icon className="w-4 h-4 shrink-0 opacity-70" />}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] bg-[rgb(var(--muted))] text-[rgb(var(--muted-foreground))] px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </button>
  );
}
SidebarItem.displayName = 'AppWindow.SidebarItem';

// ── Sidebar Group ────────────────────────────────────────────────
interface SidebarGroupProps {
  label?: string;
  children: React.ReactNode;
}

function SidebarGroup({ label, children }: SidebarGroupProps) {
  return (
    <div className="space-y-0.5">
      {label && (
        <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted-foreground))]/60">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
SidebarGroup.displayName = 'AppWindow.SidebarGroup';

// ── Sidebar ──────────────────────────────────────────────────────
interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  width?: number;
}

function Sidebar({ children, className, width = 200 }: SidebarProps) {
  return (
    <div
      className={cn(
        'shrink-0 border-r border-[rgb(var(--border))]/60',
        'bg-[rgb(var(--sidebar))]/50',
        'overflow-y-auto py-2 px-2 space-y-0.5',
        className,
      )}
      style={{ width }}
    >
      {children}
    </div>
  );
}
Sidebar.displayName = 'AppWindow.Sidebar';

// ── Toolbar ──────────────────────────────────────────────────────
interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 shrink-0',
        'border-b border-[rgb(var(--border))]/60',
        'bg-[rgb(var(--background))]/50',
        className,
      )}
    >
      {children}
    </div>
  );
}
Toolbar.displayName = 'AppWindow.Toolbar';

// ── Body ─────────────────────────────────────────────────────────
interface BodyProps {
  children: React.ReactNode;
  className?: string;
  /** Remove default padding — for terminal, maps, etc. */
  noPadding?: boolean;
  /** Disable scroll area wrapper */
  noScroll?: boolean;
}

function Body({ children, className, noPadding = false, noScroll = false }: BodyProps) {
  const inner = (
    <div className={cn(!noPadding && 'p-4', 'h-full', className)}>
      {children}
    </div>
  );

  if (noScroll) {
    return <div className="flex-1 min-h-0 overflow-hidden">{inner}</div>;
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      {inner}
    </ScrollArea>
  );
}
Body.displayName = 'AppWindow.Body';

// ── Footer ───────────────────────────────────────────────────────
interface FooterProps {
  children: React.ReactNode;
  className?: string;
}

function Footer({ children, className }: FooterProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 shrink-0',
        'border-t border-[rgb(var(--border))]/60',
        'text-[11px] text-[rgb(var(--muted-foreground))]',
        'bg-[rgb(var(--background))]/30',
        className,
      )}
    >
      {children}
    </div>
  );
}
Footer.displayName = 'AppWindow.Footer';

// ── Slot extraction helpers ──────────────────────────────────────
function extractSlot(
  children: React.ReactNode,
  slotComponent: React.FC<Record<string, unknown>>,
): { slot: React.ReactNode; rest: React.ReactNode[] } {
  const rest: React.ReactNode[] = [];
  let slot: React.ReactNode = null;

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === slotComponent) {
      slot = child;
    } else {
      rest.push(child);
    }
  });

  return { slot, rest };
}

function extractSlots(children: React.ReactNode) {
  const sidebar: React.ReactNode[] = [];
  const toolbar: React.ReactNode[] = [];
  const body: React.ReactNode[] = [];
  const footer: React.ReactNode[] = [];
  const other: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      other.push(child);
      return;
    }
    if (child.type === Sidebar) sidebar.push(child);
    else if (child.type === Toolbar) toolbar.push(child);
    else if (child.type === Body) body.push(child);
    else if (child.type === Footer) footer.push(child);
    else other.push(child);
  });

  return {
    sidebar: sidebar[0] ?? null,
    toolbar: toolbar[0] ?? null,
    body: body[0] ?? null,
    footer: footer[0] ?? null,
    other,
  };
}

// ── AppWindow (main component) ───────────────────────────────────
export interface AppWindowProps {
  /** Control visibility */
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Window title displayed in the header */
  title: string;
  /** Optional icon next to title */
  icon?: LucideIcon;
  /** Optional subtitle/description below the title */
  description?: string;

  /** Size preset (default: 'md') */
  size?: AppWindowSize;
  /** Override width (px) */
  width?: number;
  /** Override height (px) */
  height?: number;

  /** Extra className on the root dialog content */
  className?: string;

  /**
   * Children slots: use AppWindow.Sidebar, AppWindow.Toolbar,
   * AppWindow.Body, AppWindow.Footer as direct children.
   * Unrecognized children are placed in the body area.
   */
  children: React.ReactNode;
}

function AppWindowRoot({
  open,
  onOpenChange,
  title,
  icon: TitleIcon,
  description,
  size = 'md',
  width,
  height,
  className,
  children,
}: AppWindowProps) {
  const preset = SIZE_PRESETS[size];
  const w = width ?? preset.width;
  const h = height ?? preset.height;

  const { sidebar, toolbar, body, footer, other } = extractSlots(children);

  // If no explicit <AppWindow.Body> was provided, wrap other children in Body
  const bodyContent = body ?? (other.length > 0 ? <Body>{other}</Body> : null);

  return (
    <AppWindowContext.Provider value={{ size }}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          {/* Overlay */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[9998] bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-fadeIn"
          />

          {/* Window */}
          <DialogPrimitive.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2',
              'flex flex-col overflow-hidden',
              'rounded-xl',
              'bg-[rgb(var(--background))]/95 dark:bg-[rgb(var(--card))]/95',
              'backdrop-blur-2xl backdrop-saturate-150',
              'border border-white/60 dark:border-white/[0.08]',
              'ring-1 ring-black/[0.04] dark:ring-white/[0.05]',
              'shadow-2xl shadow-black/[0.12] dark:shadow-black/50',
              'animate-dialogIn',
              'focus-visible:outline-none',
              className,
            )}
            style={{ width: w, height: h }}
          >
            {/* ── Title Bar ── */}
            <div className="flex items-center gap-2.5 px-4 py-3 shrink-0 border-b border-[rgb(var(--border))]/60">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                {TitleIcon && (
                  <TitleIcon className="w-5 h-5 shrink-0 text-[rgb(var(--primary))] opacity-80" />
                )}
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-sm font-semibold text-[rgb(var(--foreground))] leading-tight truncate">
                    {title}
                  </DialogPrimitive.Title>
                  {description && (
                    <DialogPrimitive.Description className="text-[11px] text-[rgb(var(--muted-foreground))] leading-tight mt-0.5 truncate">
                      {description}
                    </DialogPrimitive.Description>
                  )}
                </div>
              </div>

              {/* Close button */}
              <DialogPrimitive.Close
                className={cn(
                  'shrink-0 rounded-lg p-1.5 transition-colors',
                  'text-[rgb(var(--muted-foreground))] hover:text-[rgb(var(--foreground))]',
                  'hover:bg-[rgb(var(--accent))] active:bg-[rgb(var(--destructive))] active:text-[rgb(var(--destructive-foreground))]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgb(var(--ring))]',
                )}
              >
                <X className="w-4 h-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {/* ── Content Area (sidebar + main) ── */}
            <div className="flex flex-1 min-h-0">
              {/* Sidebar (optional) */}
              {sidebar}

              {/* Main column: toolbar + body + footer */}
              <div className="flex flex-col flex-1 min-w-0">
                {/* Toolbar (optional) */}
                {toolbar}

                {/* Body (required) */}
                {bodyContent}

                {/* Footer (optional) */}
                {footer}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AppWindowContext.Provider>
  );
}
AppWindowRoot.displayName = 'AppWindow';

// ── Compound Export ──────────────────────────────────────────────
export const AppWindow = Object.assign(AppWindowRoot, {
  Sidebar,
  SidebarGroup,
  SidebarItem,
  Toolbar,
  Body,
  Footer,
});

export type {
  SidebarItemProps,
  SidebarGroupProps,
  SidebarProps,
  ToolbarProps,
  BodyProps,
  FooterProps,
};
