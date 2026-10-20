# Phase EX8 — LumenOS v3 Design System (Experimental)

> Restyle the client to the LumenOS v3 glass design: frosted multi-level glass
> surfaces, Manrope type, 24px windows, a floating dock + tray pill, a launcher,
> and accent colours that follow the wallpaper. Behaviour, stores and APIs stay
> the same except for the three additive preferences listed below.

## Source of truth

The design handoff lives outside the repo tree in `Custom OS UI Design/handoff/`
(untracked design input, not app code):

- `HANDOFF.md` — the component-by-component spec (radii, sizes, surfaces).
- `lumen-tokens.css` — the token layer merged into `client/src/styles.css`.
- `reference/LumenOS v3.dc.html` — the clickable prototype. Serve the
  `reference/` folder over HTTP and open it to compare screens side by side.
  `Activity`, `SystemDash` and `ServerAdmin` `.dc.html` files are per-app references.

## Decisions

- **Fonts are bundled, not loaded from Google.** The handoff `@import`s Google
  Fonts; HeadlessOS ships as an Electron app that must work offline, so Manrope and
  Geist Mono come from `@fontsource` packages imported in `main.tsx`.
- **Accent, glass and transparency are `<html>` attributes.** `data-accent`
  (`iris | teal | blue | moss`), `data-glass` (`heavy | balanced | subtle`) and
  `data-transparency="off"` switch token presets in `styles.css`. The old inline
  `--primary`/`--ring` writes from `applyAccentColor()` are removed: they would
  override the token layer. `ACCENT_PRESETS` stays, because sessions still hash into
  it for their per-session colour.
- **Accent reuses `accentColorIndex`.** It is already per-session overridable
  (ADR-022), so it now indexes `LUMEN_ACCENTS` in `lib/lumen-theme.ts`:
  `0 = auto (follow wallpaper)`, `1 iris`, `2 teal`, `3 blue`, `4 moss`. Indices left
  over from the old 8-colour picker fall back to `auto`. No schema change needed.
- **New global preferences (additive):** `glassStrength: 'heavy' | 'balanced' | 'subtle'`
  (default `heavy`) and `transparency: boolean` (default `true`).
  `hooks/useLumenAppearance.ts` (mounted in `App`) writes the attributes.
- **Dark wallpaper tone:** builtin gradients and `northern-lights.jpg` set
  `data-wall-tone="dark"`, which raises light-mode glass opacity by .2 (as LumenOS does).
- **Accent follows wallpaper:** alpine→blue, highlands→moss, lake→teal, mist→teal,
  dusk→iris, aurora→moss. Any other wallpaper → iris.
- **Wallpapers:** the six Lumen photos ship as system wallpapers in
  `server/assets/wallpapers/system/` (served by the existing route as
  `system:<file>.jpg`): `alpine`, `highlands`, `still-lake`, `mist`, `dusk` and
  `northern-lights` (the prototype's "aurora", renamed because `aurora.svg` exists).
  Thumbnails are not copied, because the route would list them as wallpapers.
  Default wallpaper becomes `system:dusk.jpg`; stored choices are kept.
- **Icons:** Fluent app icons from the handoff are copied to `client/public/icons/`
  with their `LICENSE.txt` files. Note the licences: the vinceliuice Fluent theme is
  **GPL-3.0**; the Microsoft Fluent System icons are MIT.
- **One sidebar primitive.** Six apps hand-rolled their own left nav. They now share
  `ui/pane-sidebar.tsx` (`PaneSidebar`, `PaneSidebarGroup`, `PaneSidebarItem`), which
  `AppWindow.Sidebar` also uses.
- **Shell mapping where HeadlessOS differs from the prototype:**
  - Dock utility well = Launcher, Search (CommandPalette), Show desktop. HeadlessOS
    has no "Home hub".
  - Tray pill = server connection + notifications glyphs + clock. Clicking the glyphs
    opens **Quick Settings** (`Desktop/QuickSettings.tsx`), the prototype's "Control
    Center". It is named differently because `ControlCenter/` is already the
    server-picker screen. Its tiles are HeadlessOS's real controls: server connection,
    notifications, dark mode, transparency, glass strength, Settings and Lock.
    Clicking the clock opens the notification centre.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| EX8.1 | Tokens: merge `lumen-tokens.css` into `styles.css`; bundle fonts; `data-accent`/`data-glass`/`data-transparency` plumbing + new prefs; Lumen wallpapers + icons | ✅ |
| EX8.2 | `ui/` primitives: button, input, select, badge, card, separator, progress/slider/switch, tabs, scroll-area, tooltip, context/dropdown menus (+ `formatShortcut`), dialogs, command, FileIcon; new `pane-sidebar` | ✅ |
| EX8.3 | Window chrome: `Desktop/Window.tsx` (WindowFrame) and `ui/app-window.tsx` — 24px glass frame, 44px title bar, 28px round controls, 12px body top padding | ✅ |
| EX8.4 | Shell: floating dock + tray pill (`Taskbar`), launcher (`StartMenu`), `QuickSettings`, `NotificationCenter`, `CommandPalette`, desktop icons, `Wallpaper` | ⬜ |
| EX8.5 | Login + lock: `LockScreen`, `LoginScreen`, `ControlCenter` screen | ⬜ |
| EX8.6 | Apps: FileExplorer, SettingsView, TaskManager, Dashboard, Terminal, Docker, Services, ServerAdmin, DynamicUI widgets — fix what steps 1–4 didn't cover | ⬜ |
| EX8.7 | Verify (light/dark, 4 accents, 3 glass levels, transparency off, 1440×900 + 1024×768), tests, docs | ⬜ |

## Verification plan

- Screenshot each screen at 1440×900 and 1024×768 next to the prototype.
- Light and dark, all four accents, all three glass levels, transparency on and off.
- `npx tsc --noEmit -p client` and `npm run test:client` pass; snapshot changes reviewed.

## Not in scope

- The prototype's Home hub, Browser, Notepad, Calculator and Photos apps.
- Wi-Fi, Bluetooth, volume and brightness controls (no local hardware to drive).
