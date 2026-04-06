# HeadlessOS UI Design System

> **Purpose**: This document defines the visual design language, component patterns, and UI architecture for HeadlessOS. It serves as the single source of truth for AI assistants (Copilot, Cursor) and human developers when building any UI surface.

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

### Where Icons Come From
- **Lucide React** for all UI icons (buttons, menus, sidebar, toolbar)
- **Custom SVG components** in `client/src/components/ui/FileIcon.tsx` for:
  - Desktop shortcut icons (DashboardIcon, FileExplorerIcon, TerminalIcon, ThisPCIcon)
  - File/folder icons in File Explorer (FileIcon, FolderSVG, SymlinkSVG)

### Icon Sizing Convention

| Context | Size | Class |
|---------|------|-------|
| Sidebar nav item | 16px | `w-4 h-4` |
| Toolbar button icon | 14px | `w-3.5 h-3.5` |
| Title bar icon | 20px | `w-5 h-5` |
| Context menu item | 16px | `w-4 h-4 mr-2 opacity-60` |
| Empty state | 40px | `w-10 h-10 opacity-40` |
| Desktop shortcut | 42px | Pass via `size={42}` |

### Icon Opacity
- Title bar icon: `opacity-80` on primary color
- Context menu icon: `opacity-60`
- Sidebar active item icon: `opacity-70`
- Empty state: `opacity-40`

---

## 6. Color System (CSS Variables)

All colors are defined as space-separated RGB values in `client/src/styles.css`.
Use them via Tailwind: `text-[rgb(var(--foreground))]`, `bg-[rgb(var(--background))]`.

**NEVER hardcode color values** — always use CSS variables.

### Core Palette

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | white | zinc-950 | Page/window background |
| `--foreground` | near-black | zinc-100 | Primary text |
| `--card` | white | zinc-900 | Card/panel surfaces |
| `--chrome` | gray-100 | zinc-800 | Window title bars |
| `--primary` | blue-500 | blue-400 | Active/primary actions |
| `--muted-foreground` | gray-500 | zinc-400 | Secondary/disabled text |
| `--border` | gray-200 | zinc-600 | Borders & dividers |
| `--destructive` | red-500 | red-400 | Delete/error actions |
| `--success` | green-500 | green-400 | Success states |
| `--sidebar` | off-white | zinc-950 | Sidebar backgrounds |

---

## 7. Text Sizing Convention

| Context | Size | Class |
|---------|------|-------|
| Window title | 14px | `text-sm font-semibold` |
| Window description | 11px | `text-[11px]` |
| Sidebar nav label | 13px | `text-[13px]` |
| Sidebar group header | 10px | `text-[10px] font-semibold uppercase tracking-wider` |
| Toolbar text | 11px | `text-[11px]` |
| Body heading | 14px | `text-sm font-semibold` |
| Body text | 13px | `text-[13px]` |
| Footer/status | 11px | `text-[11px]` |
| Badge count | 10px | `text-[10px]` |
| Context menu item | 13px | Default Radix size |

---

## 8. Spacing Convention

| Zone | Padding | Class |
|------|---------|-------|
| Title bar | 16px horizontal, 12px vertical | `px-4 py-3` |
| Sidebar | 8px all sides | `px-2 py-2` |
| Toolbar | 12px horizontal, 6px vertical | `px-3 py-1.5` |
| Body (with padding) | 16px all | `p-4` |
| Footer | 12px horizontal, 6px vertical | `px-3 py-1.5` |
| Gap between toolbar items | 6px | `gap-1.5` |

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
