// AppWindow — LumenOS v3 reusable window/dialog component (EX8.3)
// Same chrome as desktop windows: .glass, 24px radius, 44px title bar, round
// 28px close control, 12px gap above the content. Sidebar = PaneSidebar.
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
import { PaneSidebar, PaneSidebarGroup, PaneSidebarItem } from '@/components/ui/pane-sidebar';
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
  icon,
  label,
  active = false,
  badge,
  disabled = false,
  onClick,
}: SidebarItemProps) {
  return (
    <PaneSidebarItem
      icon={icon}
      label={label}
      active={active}
      badge={badge}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
SidebarItem.displayName = 'AppWindow.SidebarItem';

// ── Sidebar Group ────────────────────────────────────────────────
interface SidebarGroupProps {
  label?: string;
  children: React.ReactNode;
}

function SidebarGroup({ label, children }: SidebarGroupProps) {
  return <PaneSidebarGroup label={label}>{children}</PaneSidebarGroup>;
}
SidebarGroup.displayName = 'AppWindow.SidebarGroup';

// ── Sidebar ──────────────────────────────────────────────────────
interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  width?: number;
}

function Sidebar({ children, className, width = 220 }: SidebarProps) {
  return (
    <PaneSidebar width={width} className={className}>
      {children}
    </PaneSidebar>
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
        'flex h-10 shrink-0 items-center gap-1.5 px-3',
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
        'flex min-h-9 shrink-0 items-center gap-2 px-4 py-1.5',
        'border-t border-border',
        'text-xs text-muted-foreground',
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
            className="fixed inset-0 z-9998 bg-overlay backdrop-blur-[2px] animate-fadeIn"
          />

          {/* Window */}
          <DialogPrimitive.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2',
              'glass shadow-window flex flex-col overflow-hidden rounded-[24px]',
              'animate-dialogIn',
              'focus-visible:outline-none',
              className,
            )}
            style={{ width: w, height: h }}
          >
            {/* ── Title Bar: 44px, on the window glass ── */}
            <div className="flex h-11 shrink-0 items-center gap-2.5 pl-3.5 pr-2">
              {TitleIcon && (
                <TitleIcon className="h-5 w-5 shrink-0 text-accent-solid" strokeWidth={1.75} />
              )}
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="truncate text-[13px] font-semibold leading-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>

              <DialogPrimitive.Close
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fill text-foreground transition-colors duration-150',
                  'hover:bg-[#D2483F] hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {/* ── Content Area (sidebar + main) ── */}
            <div className="flex flex-1 min-h-0 pt-3">
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
