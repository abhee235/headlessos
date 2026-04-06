# Phase 6: Desktop UI Polish — Windows/macOS Quality

> **Objective:** Transform HeadlessOS desktop into a fully-fledged, high-quality desktop environment comparable to Windows 11 / macOS. Every interaction should feel polished — icons, menus, theming, animations, and micro-interactions.

## Milestone: M6 — Desktop UI System

### Design Principles
1. **Glassmorphism** — frosted glass backgrounds, subtle transparency, blur
2. **macOS-quality context menus** — rounded, backdrop-blur, smooth dividers, keyboard shortcuts shown
3. **Crisp iconography** — custom SVG icons for file types with shadows and depth
4. **Theme support** — dark (default) and light/white theme
5. **Branded wallpaper** — "HeadlessOS" watermark always visible, custom wallpaper system
6. **Smooth animations** — transitions on open/close, hover effects, menu appear/disappear

---

### M6.1: High-Quality Desktop & File Icons ✅
**Priority:** P0 — visual foundation

Replace Lucide line icons with rich multi-color SVG icons for desktop shortcuts and file types.

- Desktop shortcut icons: 48×48 with colored backgrounds, rounded corners, subtle shadows
- File type icons (in File Explorer): distinct icons per extension category
  - Folders: yellow filled folder with depth
  - Code files: green with `</>` or language logo
  - Images: purple with thumbnail preview frame
  - Archives: orange with zipper
  - Config/JSON/YAML: yellow with gear
  - Text/Markdown: gray with lines
  - Symlinks: cyan with link overlay
- Icon hover: lift + shadow animation
- Icon select: blue selection ring (like macOS Finder)

**Files:** `client/src/components/ui/FileIcon.tsx`, update `Desktop.tsx`, `FileListNew.tsx`

---

### M6.2: Glassmorphic Context Menus ✅
**Priority:** P0 — core interaction pattern

macOS-style context menus with frosted glass effect.

**Design Spec:**
- Background: `bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl`
- Border: `border border-white/20 dark:border-white/10`
- Shadow: `shadow-2xl shadow-black/20`
- Rounded: `rounded-xl`
- Items: 28px height, hover = `bg-black/5 dark:bg-white/10`
- Dividers: thin, `bg-black/10 dark:bg-white/10`, with `mx-2`
- Keyboard shortcuts: right-aligned, smaller muted text
- Submenu indicator: small chevron right
- Danger items (delete): red text on hover
- Animation: scale-in from 95% + fade

**Context menus needed:**
1. **Desktop right-click** → New Folder, New File, Paste, Refresh, View (icons/list), Sort by, Display settings, About HeadlessOS
2. **File Explorer item right-click** → Open, Open with Terminal, Cut, Copy, Paste, Rename, Delete, Properties
3. **File Explorer empty area** → New Folder, New File, Paste, View mode, Sort by, Refresh
4. **Taskbar right-click** → Task Manager (processes), Show Desktop, Taskbar settings
5. **Tab/Window right-click** → Close, Close All, Minimize, Maximize

**Files:** `client/src/components/ui/ContextMenu.tsx`, integrate into Desktop, FileExplorer, Taskbar

---

### M6.3: Branded Wallpaper System
**Priority:** P1

- Default wallpaper: gradient with embedded "HeadlessOS" logo watermark (always visible)
- Watermark: subtle, centered, `opacity-5` to `opacity-10`, crisp SVG logo
- Logo: stylized "H" monogram or "HeadlessOS" wordmark in a modern sans-serif
- Wallpaper overlays grid pattern at very low opacity
- Future: user-selectable wallpapers from preset gallery

**Files:** `client/src/components/Desktop/Wallpaper.tsx`, `client/src/assets/logo.tsx`

---

### M6.4: Light / White Theme
**Priority:** P1

Complete light theme with proper contrast ratios.

**Scope:**
- Theme store: `client/src/store/theme-store.ts` — `theme: 'dark' | 'light'`
- CSS custom properties or Tailwind `dark:` classes (already using dark by default)
- Light palette:
  - Background: white / zinc-50
  - Window chrome: zinc-100 / zinc-200
  - Text: zinc-900 / zinc-700
  - Borders: zinc-200 / zinc-300
  - Accent: blue-500
- Toggle in: system tray or settings
- Persist preference in localStorage
- Components to update: Desktop, Window, Taskbar, StartMenu, all views

**Files:** `client/src/store/theme-store.ts`, update all component files

---

### M6.5: Window Chrome Polish
**Priority:** P1

- Traffic light buttons (macOS style) option or Windows-style min/max/close
- Window shadow: larger, softer shadow when focused; dimmed when unfocused
- Title bar: subtle gradient, window icon matches app
- Snap to edges: drag to top = maximize, drag to corners = half-screen
- Minimize animation: shrink toward taskbar
- Window rounded corners: larger radius (12px)
- Content area: subtle inner shadow at top

**Files:** Update `Window.tsx`, `window-store.ts`

---

### M6.6: Taskbar & Start Menu Polish
**Priority:** P2

- Taskbar: frosted glass effect matching macOS dock
- Start menu: smooth slide-up animation, glassmorphic background
- App icons in taskbar: running indicator dot, hover preview tooltip
- System tray: battery (for laptops), volume, notification bell
- Start menu: recent files section, scrollable all-apps list

**Files:** Update `Taskbar.tsx`, `StartMenu.tsx`

---

### M6.7: File Operation UI Feedback
**Priority:** P2 — needed when file operations are triggered from context menus

- Copy/Cut/Paste: clipboard state in store
- Progress toast for long operations
- Drag & drop files between folders (future)
- File selection: click to select (blue highlight), Ctrl+click multi-select
- Shift+click range select
- "Properties" dialog: file size, permissions, modified date

**Files:** `client/src/store/clipboard-store.ts`, `client/src/components/ui/Toast.tsx`, `client/src/components/FileExplorer/PropertiesDialog.tsx`

---

### M6.8: Notification / Toast System
**Priority:** P2

- Toast notifications: bottom-right corner, slide-in
- Types: info (blue), success (green), warning (amber), error (red)
- Auto-dismiss after 4s, manual close
- Stack up to 3 visible

**Files:** `client/src/components/ui/Toast.tsx`, `client/src/store/toast-store.ts`

---

### M6.9: Keyboard Shortcuts
**Priority:** P3

- `Ctrl+C` / `Ctrl+V` / `Ctrl+X` — copy/paste/cut in File Explorer
- `Delete` / `Backspace` — delete selected files
- `F2` — rename
- `F5` — refresh
- `Alt+F4` — close window
- `Super` (Cmd) — toggle start menu
- `Ctrl+Tab` — next window
- `Ctrl+`` — open terminal

**Files:** `client/src/hooks/useKeyboardShortcuts.ts`

---

### M6.10: Selection & Multi-Select
**Priority:** P3

- Click file: select (blue highlight ring)
- Ctrl+Click: toggle selection
- Shift+Click: range select
- Rubber-band selection (drag on empty area to draw rectangle)
- Selection count in status bar

**Files:** Update `FileListNew.tsx`, add `client/src/hooks/useSelection.ts`

---

### M6.11: Login Flow — Windows 11-style Authentication
**Priority:** P0 — core UX for server connection

Replace the current "Start Menu connect" flow with a proper Windows 11-inspired lock/login screen.

**UX Flow:**
1. **Lock Screen** — Full-screen wallpaper + centered clock + date + "Click anywhere or press a key"
2. **Login Screen** — Shows saved servers as avatar cards (like Win 11 user selection). Click a server → credential form (username, password, auth method). "Connect" button. "Add Server" button for new servers.
3. **Desktop** — Full desktop environment (current UI), only accessible after successful SSH connect
4. **Lock** — From Start Menu, returns to Lock Screen (SSH stays alive)
5. **Switch User** — From Start Menu, returns to Login Screen (disconnects SSH)
6. **Sign Out** — Disconnects SSH, returns to Login Screen

**Multi-Tab:** Each browser tab independently manages its own session. Tab 1 → Server A, Tab 2 → Server B.

**Design Spec:**
- Lock Screen: Full wallpaper with subtle vignette, large clock (72px), date below, "Click anywhere" hint fading in/out
- Login Screen: Frosted glass card centered on screen, server list with colored avatars, status dots (green=connected, gray=disconnected)
- Add Server Form: inline card (not a dialog), fields: name, host, port, username, auth method (password/key/agent), password/key field
- Animations: Lock → Login slide-up transition, Login → Desktop fade-in
- Error state: shake animation on auth failure, red error message

**App State Machine:**
```
lock → login → connecting → desktop
                    ↑              ↓
                    └── signOut ←──┘
desktop → lock (session stays alive)
desktop → login (disconnect + switch server)
```

**Store Changes:**
- Add `appScreen: 'lock' | 'login' | 'desktop'` to app-store
- Add `loginError: string | null` to app-store
- Add `lockScreen()`, `signOut()`, `switchUser()` actions
- Remove auto-connect-on-load behavior

**Files:**
- `client/src/components/Login/LockScreen.tsx` — Lock screen with clock
- `client/src/components/Login/LoginScreen.tsx` — Server selection + credential entry
- `client/src/components/Login/AddServerForm.tsx` — Add new server inline form
- `client/src/components/Login/ServerAvatar.tsx` — Server avatar card component
- Update `client/src/App.tsx` — Route between lock/login/desktop based on appScreen
- Update `client/src/store/app-store.ts` — Add screen state, lock/signOut actions
- Update `client/src/components/Desktop/StartMenu.tsx` — Add Lock/Switch User/Sign Out

---

## Implementation Order

Tasks are ordered by visual impact and dependency:

| Order | Task | Reason |
|-------|------|--------|
| 1 | M6.1 High-Quality Icons | Visual foundation — everything looks better immediately |
| 2 | M6.2 Context Menus | Core interaction — right-click is expected desktop behavior |
| 3 | M6.3 Branded Wallpaper | Identity — makes it feel like a real OS |
| 4 | M6.4 Light Theme | Usability — some users prefer light mode |
| 5 | M6.5 Window Chrome | Polish — subtle but impactful |
| 6 | M6.6 Taskbar/Start Polish | Polish — glassmorphism everywhere |
| 7 | M6.7 File Operations UI | Functional — copy/paste/drag |
| 8 | M6.8 Toasts | Feedback — user knows what happened |
| 9 | M6.9 Keyboard Shortcuts | Power users — faster workflow |
| 10 | M6.10 Selection | Advanced — multi-select for batch operations |
| 11 | M6.11 Login Flow | Core UX — server auth like Windows 11 login |

---

## Dependency Notes

- M6.2 (Context Menus) is needed before M6.7 (File Operations) — context menu triggers copy/cut/paste
- M6.4 (Themes) should come before heavy polish work so colors can be themed from the start
- M6.8 (Toasts) is needed for M6.7 (File Operations) — toast feedback on copy/delete
- M6.9 (Shortcuts) works best after M6.7 (File Operations) — shortcuts trigger operations
