# HeadlessOS UI Design System

> **Purpose**: This document defines the visual design language, component patterns, and UI architecture for HeadlessOS. It serves as the single source of truth for AI assistants (Copilot, Cursor) and human developers when building any UI surface.

> **EX6 (Multi-Session Desktop)**: HeadlessOS now runs as a **multi-session workspace** in the Citrix style. Three top-level surfaces:
> 1. **LockScreen** — single unified unlock for the workspace.
> 2. **ControlCenter** (was: LoginScreen) — pre-desktop landing with three tabs: **Sessions** (server picker + connect), **Fleet** (multi-server overview), **Global Settings**. Open via `Ctrl/Cmd+Shift+Space` from any session.
> 3. **DesktopLayout** — per-session desktop. A hover-reveal `SessionSwitcher` at the top edge cycles between active sessions; a 3px accent strip identifies the active one. See [phase-ex6.md](phases/phase-ex6.md).

---

## 1. Design Philosophy

HeadlessOS mimics Windows 11 / macOS system UI patterns:
- **Frosted glass surfaces**: `backdrop-blur-xl` + semi-transparent backgrounds
- **Soft rounded corners**: `rounded-xl` for windows/cards, `rounded-lg` for controls
- **Subtle borders**: `border-white/60 dark:border-white/[0.08]` — never harsh outlines
- **Focus rings**: `ring-[rgb(var(--ring))]` for keyboard accessibility
- **Motion**: subtle 150-200ms ease transitions, scale on hover/active
- **Dark theme first**: most users run servers from dark environments

---

## 2. Layout Zones (Window Anatomy)

Every window/dialog in HeadlessOS follows this zone model:

```
┌──────────────────────────────────────────────────────────┐
│ [icon] Title            [description]        [✕ close]   │  ← Title Bar (ALWAYS)
├──────────┬───────────────────────────────────────────────┤
│          │  [action buttons]  [search]  [info text]      │  ← Toolbar (OPTIONAL)
│ Sidebar  ├───────────────────────────────────────────────┤
│ (opt.)   │                                               │
│          │   Body Content (scrollable)                    │  ← Body (ALWAYS)
│ grouped  │                                               │
│ nav      │                                               │
│          ├───────────────────────────────────────────────┤
│          │  [status text]          [action buttons]       │  ← Footer (OPTIONAL)
└──────────┴───────────────────────────────────────────────┘
```

### Zone Summary

| Zone | Required | Purpose | Example |
|------|----------|---------|---------|
| **Title Bar** | Always | Icon + title + close (X) | Every window |
| **Sidebar** | Optional | Vertical nav with icons + labels | Settings, Personalize |
| **Toolbar** | Optional | Contextual actions below header | File Explorer, Wallpaper Picker |
| **Body** | Always | Main scrollable content area | All content |
| **Footer** | Optional | Status info or action buttons | Status bar, OK/Cancel |

---

## 3. AppWindow Component (Compound)

**File**: `client/src/components/ui/app-window.tsx`

The `AppWindow` component is the **standard way** to create any overlay/dialog/window UI in HeadlessOS. It wraps Radix Dialog for accessibility (focus trap, Escape to close, overlay backdrop).

### Size Presets

| Size | Dimensions | Use Case |
|------|-----------|----------|
| `xs` | 380×260 | Single-input prompts: "New Folder", "Rename", "Confirm" |
| `sm` | 480×400 | Compact forms: "Properties", "Color Picker" |
| `md` | 680×520 | Medium single-pane: "About", "Preferences" |
| `lg` | 900×620 | Full app with sidebar: "Settings", "Personalize" |
| `xl` | 1100×720 | Wide multi-pane: "Task Manager" |

You can also pass explicit `width` and `height` to override presets.

### Basic Usage (small prompt)

```tsx
import { AppWindow } from '@/components/ui/app-window';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Folder } from 'lucide-react';

<AppWindow
  open={open}
  onOpenChange={setOpen}
  title="New Folder"
  icon={Folder}
  size="xs"
  width={400}
  height={220}
>
  <AppWindow.Body noPadding>
    <div className="px-4 pt-4 pb-2">
      <Input placeholder="folder-name" value={name} onChange={...} />
    </div>
  </AppWindow.Body>
  <AppWindow.Footer className="justify-end gap-2 py-3 px-4">
    <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
    <Button size="sm" onClick={onCreate}>Create</Button>
  </AppWindow.Footer>
</AppWindow>
```

### Full Usage (sidebar + toolbar + footer)

```tsx
import { AppWindow } from '@/components/ui/app-window';
import { Settings, Palette, Monitor, User } from 'lucide-react';

<AppWindow
  open={open}
  onOpenChange={setOpen}
  title="Settings"
  icon={Settings}
  description="Manage your preferences"
  size="lg"
>
  <AppWindow.Sidebar width={200}>
    <AppWindow.SidebarGroup label="Appearance">
      <AppWindow.SidebarItem id="themes" icon={Palette} label="Themes" active onClick={...} />
      <AppWindow.SidebarItem id="display" icon={Monitor} label="Display" onClick={...} />
    </AppWindow.SidebarGroup>
    <AppWindow.SidebarGroup label="Account">
      <AppWindow.SidebarItem id="profile" icon={User} label="Profile" onClick={...} />
    </AppWindow.SidebarGroup>
  </AppWindow.Sidebar>

  <AppWindow.Toolbar>
    <Button size="sm" variant="outline">Reset</Button>
    <div className="flex-1" />
    <span className="text-xs text-muted-foreground">3 settings modified</span>
  </AppWindow.Toolbar>

  <AppWindow.Body>
    {/* Main content, automatically scrollable */}
    <h3>Theme Settings</h3>
    ...
  </AppWindow.Body>

  <AppWindow.Footer>
    <span className="text-xs">Changes saved automatically</span>
  </AppWindow.Footer>
</AppWindow>
```

### Sub-Component Props

| Sub-Component | Key Props | Notes |
|--------------|-----------|-------|
| `AppWindow.Sidebar` | `width?` (default 200), `className?` | Left column nav |
| `AppWindow.SidebarGroup` | `label?` | Groups nav items under a heading |
| `AppWindow.SidebarItem` | `id`, `label`, `icon?`, `active?`, `badge?`, `disabled?`, `onClick?` | Individual nav entry |
| `AppWindow.Toolbar` | `className?` | Horizontal action bar below title |
| `AppWindow.Body` | `noPadding?`, `noScroll?`, `className?` | Main content area |
| `AppWindow.Footer` | `className?` | Bottom status/actions bar |

### Choosing a Size

```
User action                → Size → Has Sidebar? → Has Toolbar?
────────────────────────────────────────────────────────────────
"New Folder" prompt        → xs   → No            → No
File properties            → sm   → No            → No
About HeadlessOS           → sm   → No            → No
Preferences page           → md   → Yes (3 items) → No
Personalize (wallpapers)   → lg   → Yes           → Yes
Settings (full)            → lg   → Yes           → Yes
Task Manager               → xl   → No            → Yes
```

---

## 4. When to Use AppWindow vs. Other Components

| Scenario | Component | Why |
|----------|-----------|-----|
| Overlay dialog (confirm, prompt, form) | `AppWindow` | Consistent window chrome, zones, accessibility |
| Destructive confirmation ("Delete file?") | `ConfirmDialog` | Pre-built destructive prompt with AlertTriangle |
| Toast notification | `toast()` from sonner | Non-blocking, auto-dismiss feedback |
| Embedded panel within a window | Raw `Card` or divs | Not an overlay — lives inside existing content |
| Window manager desktop windows | `WindowFrame` | Managed by window-store, drag/resize, minimize/maximize |

### Rule of Thumb
**If it's a modal overlay triggered by user action → use `AppWindow`.**
**If it's a non-modal desktop window → use `WindowFrame` via `useDesktopStore.openWindow()`.**

---

## 5. Icon Guidelines

> EX8 (LumenOS v3). Spec: `docs/phases/phase-ex8.md`.

### Where Icons Come From
- **Fluent SVGs** in `client/public/icons/fluent/` (see `LICENSE.txt` there — the
  vinceliuice theme is GPL-3.0, the Microsoft Fluent System icons are MIT) for app
  icons, folders and common file types. Render them with `AppIcon` (by app id),
  `FluentIcon` (by icon name), `FolderSVG` or `FileIcon` from
  `client/src/components/ui/FileIcon.tsx`.
- **Lucide React** for every UI glyph (buttons, menus, sidebar, toolbar), at
  17–18px with `strokeWidth={1.75}`.

### Icon Sizing Convention

| Context | Size |
|---------|------|
| Title bar app icon | 20px (`AppIcon size={20}`) |
| Sidebar item | 18px Lucide |
| Menu item | 17px at 80% opacity (normalised by `ui/menu-styles`) |
| Dock tile | 32px icon on a 50px `.lumen-plate` |
| Launcher tile | 32px icon on a 52px `.lumen-plate` |
| Desktop icon | 44px (32 / 44 / 52 for small / medium / large) |

---

## 6. Color System (CSS Variables)

Defined in `client/src/styles.css` as two layers: the raw `--lumen-*` glass layer,
and the shadcn semantic tokens mapped onto it. Both are registered with Tailwind, so
use utilities (`bg-fill`, `text-label-2`, `border-edge`, `bg-accent-soft`…), never
`rgb(var(--x))` (the variables hold full colours, not RGB triplets).

**NEVER hardcode color values** — always use tokens.

### Presets (attributes on `<html>`, written by `useLumenAppearance`)

| Attribute | Values | Source |
|-----------|--------|--------|
| class `dark` | — | theme store |
| `data-accent` | `iris` (default), `teal`, `blue`, `moss` | `accentColorIndex` → `LUMEN_ACCENTS` (0 = follow wallpaper) |
| `data-glass` | `heavy` (default), `balanced`, `subtle` | `glassStrength` pref |
| `data-transparency="off"` | — | `transparency` pref |
| `data-wall-tone="dark"` | — | dark wallpaper in light mode (+.2 glass opacity) |

### Token cheat sheet

| Purpose | Utilities |
|---------|-----------|
| Text | `text-foreground`, `text-label-2` / `text-muted-foreground`, `text-label-3` |
| Accent | `text-accent-text`, `bg-accent-soft`, `bg-accent-solid`, `ring-accent-glow` |
| Fills | `bg-fill` (hover), `bg-fill-2` (pressed), `bg-chip` (recessed track) |
| Glass mats | `bg-mat-thin`, `bg-mat`, `bg-mat-thick`, `bg-field`, `bg-paper` |
| Edges | `border-edge`, `border-edge-2`, `border-border` (hairline) |
| Semantic | `success`, `warning`, `danger` (tint at /14, border at /30) |

### Surfaces (in `@layer components`, so utilities can still override them)

| Class | Use |
|-------|-----|
| `.glass` | Window body |
| `.glass-subtle` | Inset pane in a window (sidebars) |
| `.glass-heavy` | Floating shell panel: dock, launcher, quick settings, menus, toasts |
| `.lumen-card` | Card in a panel or dashboard (radius 20–22px) |
| `.lumen-section` | Settings-style section in a window (radius 20px, padding 22px 24px) |
| `.lumen-well` | Recessed group / segmented control well |
| `.lumen-lit` | On-state tile, primary pill, active bar fill |
| `.lumen-plate` | App icon plate |

A backdrop-filter stops blurring inside an element whose ancestor animates
opacity/transform, so put entrance animations on the glass element itself.

---

## 7. Text Sizing Convention

Manrope for UI (bundled via `@fontsource-variable/manrope`), Geist Mono (`font-mono`)
for code, paths, PIDs, IPs and the terminal.

| Context | Size |
|---------|------|
| Menus, title bars, list rows | 13px |
| Body text, settings rows | 14px (settings row labels 15px) |
| Captions, footers | 12px |
| Group labels | 11px, weight 700, uppercase, `tracking-[.06em]`, `text-label-3` |
| Section headings | 15–17px, weight 700 |
| Page titles | 30px, weight 600, `tracking-[-0.022em]` |
| Big numbers | 28–40px, weight 700, `tracking-[-0.02em]` |

---

## 8. Spacing & Radius Convention

| Zone | Value |
|------|-------|
| Title bar | 44px tall, padding `0 8px 0 14px`, 28px round controls with a 6px gap |
| Below title bar | 12px (`pt-3`, applied by the frame — apps add none) |
| Sidebar (`PaneSidebar`) | `.glass-subtle`, margin `0 0 8px 8px`, padding 8px, radius 14px |
| Sidebar item | 34px tall, radius 10px, padding `0 10px`, gap 10px |
| Toolbar | transparent, 40px, pill buttons |

| Radius | Use |
|--------|-----|
| 4px | Menu items |
| 6px | Inline inputs, rename fields, badges |
| 10px | Chips, sidebar items |
| 14px | Panes |
| 18px | Menus, app tiles |
| 20–22px | Cards |
| 24px | Windows (`rounded-2xl`) |
| 28–30px | Dock, launcher, quick settings, toasts (`rounded-3xl` = 30px) |
| 999px | Buttons, search fields, title-bar controls |

---

## 9. Existing Dialog Migration Guide

All overlay UI should migrate to `AppWindow`. Current status:

| Dialog | File | Status | Target Size |
|--------|------|--------|-------------|
| Wallpaper Picker | `Desktop/WallpaperPicker.tsx` | ✅ Migrated | `lg` (sidebar) |
| New Folder/File | `Desktop/Desktop.tsx` | ✅ Migrated | `xs` |
| File delete confirm | `FileExplorer/FileListNew.tsx` | Uses ConfirmDialog (keep as-is) | N/A |
| About HeadlessOS | TODO | Not yet built | `sm` |
| Server Settings | TODO | Not yet built | `lg` (sidebar) |
| SSH Key Manager | TODO | Not yet built | `md` |

---

## 10. Building a New Window (Checklist)

1. **Choose size**: xs/sm/md/lg/xl based on content (see §3 table)
2. **Decide zones**: Does it need sidebar? toolbar? footer?
3. **Pick title icon**: Use Lucide icon matching the action
4. **Use `AppWindow`**: Import from `@/components/ui/app-window`
5. **Fill slots**: Use `AppWindow.Sidebar`, `.Toolbar`, `.Body`, `.Footer` as children
6. **Handle loading/empty/error states** inside `AppWindow.Body` (see §2 pattern in frontend.md)
7. **Test**: Verify keyboard nav (Tab, Escape), screen reader labels, dark mode
