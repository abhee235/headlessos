// EX8.2: PaneSidebar — the LumenOS left navigation pane shared by every app
// with a sidebar (Files, Settings, Task Manager, Server Admin, Docker, Dynamic
// UI tabs) and by AppWindow.Sidebar.
//   Pane:  .glass-subtle, radius 14px, padding 8px, margin 0 0 8px 8px, 2px gap
//   Item:  34px, radius 10px, padding 0 10px, gap 10px, 18px icon, 13px/500 label
//   Active: bg-accent-soft + text-accent-text, icon tinted with the accent
//   Group label: 11px/700 uppercase, .06em tracking, text-label-3
// @see docs/phases/phase-ex8.md

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Pane ─────────────────────────────────────────────────────────

interface PaneSidebarProps {
  children: React.ReactNode;
  /** Pinned below the scrolling item list (meters, host card, …) */
  footer?: React.ReactNode;
  /** Optional header above the items (account card, title, …) */
  header?: React.ReactNode;
  width?: number;
  className?: string;
  'aria-label'?: string;
}

export function PaneSidebar({ children, footer, header, width = 220, className, ...rest }: PaneSidebarProps) {
  return (
    <nav
      className={cn(
        'glass-subtle mb-2 ml-2 flex shrink-0 flex-col overflow-hidden rounded-[14px] p-2',
        className,
      )}
      style={{ width }}
      aria-label={rest['aria-label']}
    >
      {header}
      <div className="scrollbar-on-hover flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">{children}</div>
      {footer && <div className="shrink-0 border-t border-border px-1.5 pt-2.5 mt-2">{footer}</div>}
    </nav>
  );
}

// ── Group ────────────────────────────────────────────────────────

interface PaneSidebarGroupProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

export function PaneSidebarGroup({ label, children, className }: PaneSidebarGroupProps) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {label && (
        <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-[.06em] text-label-3">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Item ─────────────────────────────────────────────────────────

export interface PaneSidebarItemProps {
  /** A Lucide icon component, or any element (e.g. a Fluent <img>) */
  icon?: LucideIcon | React.ReactElement;
  label: string;
  active?: boolean;
  /** Count or short text shown on the right */
  badge?: string | number;
  /** Arbitrary trailing content (status dot, …) */
  trailing?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export function PaneSidebarItem({
  icon,
  label,
  active = false,
  badge,
  trailing,
  disabled = false,
  onClick,
  title,
  className,
}: PaneSidebarItemProps) {
  let iconNode: React.ReactNode = null;
  if (React.isValidElement(icon)) {
    iconNode = icon;
  } else if (icon) {
    const Icon = icon as LucideIcon;
    iconNode = (
      <Icon
        // Every glyph carries the accent (LumenOS sidebars), stronger when active
        className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-accent-solid' : 'text-accent-text')}
        strokeWidth={1.75}
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        'flex h-[34px] w-full shrink-0 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent-soft text-accent-text'
          : 'text-foreground hover:bg-fill active:bg-fill-2',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-current={active ? 'page' : undefined}
    >
      {iconNode}
      <span className="flex-1 truncate">{label}</span>
      {trailing}
      {badge !== undefined && (
        <span
          className={cn(
            'min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-5',
            active ? 'bg-accent-solid/20 text-accent-text' : 'bg-fill text-label-2',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
