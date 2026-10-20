// EX8.2: Shared LumenOS menu recipes — context-menu, dropdown-menu and menubar
// all render the same glass-heavy menu, so their class strings live here once.
// @see docs/phases/phase-ex8.md

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatShortcut } from "@/lib/format-shortcut";

/** Menu panel: 240px, padding 6px, radius 18px, glass-heavy, lu-pop. */
export const menuContentClass =
  "glass-heavy z-[9999] min-w-[240px] overflow-hidden rounded-[18px] p-1.5 animate-contextMenuIn";

/** Submenu panel: same surface, a little narrower. */
export const menuSubContentClass =
  "glass-heavy z-[9999] min-w-[200px] overflow-hidden rounded-[18px] p-1.5 animate-contextMenuIn";

/**
 * Item row: 30px, padding 0 10px, gap 10px, radius 4px, 13px text.
 * Leading Lucide icons are normalised to 17px at 80% opacity, overriding the
 * `w-4 h-4 mr-2 opacity-60` classes call sites still pass.
 */
export const menuItemBase =
  "relative flex h-[30px] cursor-default select-none items-center gap-2.5 rounded-[4px] px-2.5 text-[13px] outline-none transition-colors " +
  "[&>svg]:size-[17px] [&>svg]:shrink-0 [&>svg]:mr-0 [&>svg]:opacity-80 " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

export const menuItemTone = (danger?: boolean) =>
  danger
    ? "text-danger focus:bg-danger/12 data-[highlighted]:bg-danger/12"
    : "text-foreground focus:bg-accent-soft data-[highlighted]:bg-accent-soft";

/** Checkbox / radio rows reserve a 36px gutter for the indicator. */
export const menuIndicatorItemClass = cn(menuItemBase, menuItemTone(), "pl-9");

export const menuSubTriggerClass = cn(
  menuItemBase,
  menuItemTone(),
  "data-[state=open]:bg-accent-soft"
);

export const menuLabelClass =
  "px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-[.06em] text-label-3";

export const menuSeparatorClass = "mx-2.5 my-1.5 h-px bg-border";

/**
 * Right-aligned shortcut glyphs, one span per key with a 1px gap.
 * Strings are run through formatShortcut(); other children render as-is.
 */
export function MenuShortcut({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  const keys = typeof children === "string" ? formatShortcut(children) : null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex items-center gap-px pl-4 text-sm leading-none text-muted-foreground opacity-70",
        "[font-family:-apple-system,'SF_Pro_Text','Segoe_UI_Symbol',system-ui]",
        className
      )}
      {...props}
    >
      {keys ? keys.map((k, i) => <span key={i}>{k}</span>) : children}
    </span>
  );
}
