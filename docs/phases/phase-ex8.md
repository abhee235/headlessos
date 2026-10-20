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
  - Dock utility well = Launcher (9-dot grid), Home hub (EX8.10), Search
    (CommandPalette), as in the prototype. Show desktop stays on its keyboard
    shortcut, the Quick Settings tile, the Launcher quick action and the dock's
    context menu.
  - Tray (top menu bar since EX8.11; was a bottom-right pill) = server connection + notifications glyphs + clock. Clicking the glyphs
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
| EX8.4 | Shell: floating dock + tray pill (`Taskbar`), launcher (`StartMenu`), `QuickSettings`, `NotificationCenter`, `CommandPalette`, desktop icons, `Wallpaper` | ✅ |
| EX8.5 | Login + lock: `LockScreen`, `LoginScreen`, `ControlCenter` screen | ✅ |
| EX8.6 | Apps: FileExplorer, SettingsView, TaskManager, Dashboard, Terminal, Docker, Services, ServerAdmin, DynamicUI widgets — fix what steps 1–4 didn't cover | ✅ |
| EX8.7 | Verify (light/dark, 4 accents, 3 glass levels, transparency off, 1440×900 + 1024×768), tests, docs | ✅ |
| EX8.8 | Code editor (requested): Monaco in Files and container Files — syntax colouring, Lumen themes, Ctrl/⌘+S | ✅ |
| EX8.9 | Task Manager: App history, Startup apps, Users, Services pages (prototype `Activity`) | ✅ |
| EX8.10 | HomeHub (requested): the prototype's smart-home overlay as React, opened from the dock's Home button; 9-dot Launcher glyph | ✅ |
| EX8.11 | Top menu bar (updated design): the bottom-right tray pill moves to a 28px strip; Quick Settings and notifications hang from the top-right | ✅ |
| EX8.12 | Dock position setting (requested): bottom-centre (default) or right-middle; only the dock moves | ✅ |
| EX8.13 | Task Manager process detail card re-ported from `Activity.dc.html`: same flex-wrap reflow at every width | ✅ |
| EX8.14 | One segmented/tab look everywhere (requested): the Settings control | ✅ |
| EX8.15 | HomeHub as a real glance (requested): same layout, cards bound to server and local data | ✅ |
| EX8.16 | Colour dock tiles (requested experiment): per-app tile colour with a contrasting glyph; Glass kept as a setting | ✅ |
| EX8.17 | Idle glance (requested): after N idle minutes the Home hub covers the desktop as a privacy screen (1-minute test build; Settings timer next) | ✅ |

## Additions beyond the handoff

Found or asked for during the work; each has tests.

- **Task Manager process detail card** (requested): clicking a process opens a
  card above the table — name + status, PID · user, command, Suspend/Resume and
  End task, "CPU · last 60 s" sparkline, Memory (RSS) / Threads / Started /
  Priority — plus an All / Running / Idle / My processes filter. Backend:
  `GET /api/servers/:id/taskmanager/process/:pid` (`ps -o nlwp=,ni=,lstart= -p PID`,
  exact allowlist pattern) and SIGSTOP (19) / SIGCONT (18) in `killProcess`.
- **System dashboard** shows Processor (arc gauge + per-core tiles) and live
  network throughput by reusing the existing `fetchTaskManager` call, on the
  dashboard's own refresh timer plus two early seed samples.
- **Bug fixes:** the command palette never opened apps (legacy `openTab`);
  terminal resize frames were typed into the shell (`ws` delivers Buffers —
  `terminal/control.ts`); lock / Control Center ignored the saved theme; surface
  recipes beat Tailwind utilities (now `@layer components`); toasts were opaque.
- **Terminal default font** is Geist Mono 13px; only the exact old default is
  upgraded for existing users.
- **Blank metrics fixed (live monitoring):** closed terminals leaked their SSH
  channel (`end()` only sends EOF), so connections hit sshd's `MaxSessions` and
  every parallel command failed → zeros. Terminals now `close()` the channel;
  `ConnectionManager.exec` caps 4 concurrent command channels per connection
  (`HEADLESS_MAX_EXEC_CHANNELS`) with one retry on "Channel open failure"; CPU %
  comes from `/proc/stat` deltas (all cores; `top -bn1` averaged since boot and
  can print only even cores). Task Manager and the Dashboard's CPU/network poll
  every 2 s; HeadlessOS's own probe commands are hidden from the process list,
  and a selected process that exits stays on its card marked Exited.
- **Branded loading in every window:** the lazy-chunk fallback in
  `WindowManager` was a grey skeleton (what a Docker container shell showed
  first); it is now the H-ring `LoadingView`, as is the container Files listing.
  The terminal keeps its spinner until the shell prints its first byte (5 s
  fallback) instead of hiding it when the socket opens. Container shells run
  `docker exec -it <id> sh -c '…bash || sh'` as the pty command
  (`getShell({ command })`), so no login banner or echoed `exec docker exec`
  line, and bash is used when the image has it.

- **Monaco code editor (EX8.8, requested):** `ui/code-editor.tsx` replaces the
  plain textarea in `FileExplorer/FileViewer` and the container Files editor.
  Monaco 0.57 is bundled (no CDN; Electron runs offline) and lazy-loaded: the
  editor chunk (~4 MB, ~1 MB gzip) loads the first time a file opens, behind the
  H spinner. Language comes from the file name (`lib/code-language.ts`: source,
  config formats, Dockerfile/.bashrc/.env/sshd_config…; unknown → plain text),
  shown as a chip in the toolbar ("Config" for `.conf`-style files). Lumen
  light/dark themes (`lib/monaco-setup.ts`) use the viz hues, a transparent
  background on the paper pane, accent cursor/selection, and follow theme and
  accent changes live. Workers: editor + JSON/CSS/HTML/TS, each its own file
  fetched on first use (TS ≈ 7 MB, only for JS/TS files). TS/JS semantic and
  suggestion diagnostics are off (a lone server file has no project); syntax
  errors still show.

## EX8.9 — Task Manager: App history, Startup apps, Users, Services

The prototype's Activity app has four pages HeadlessOS lacked. What a Linux
server can actually report shapes each one:

| Page | Linux source | What is not available |
|------|--------------|-----------------------|
| Services | systemd (`systemctl`), else SysV (`service --status-all`, `/etc/rc2.d`) | — |
| Startup apps | enabled/disabled systemd unit files + `systemd-analyze` (boot time, per-unit delay); SysV `rc2.d` start links; `@reboot` cron lines | per-app "publisher" (would need a package lookup per binary) |
| Users | `getent passwd` (accounts, uid, shell), `who` (sessions; fallback: processes with a tty), per-user CPU / memory / process count aggregated from the existing `ps aux` poll | — |
| App history | per-command totals for **running** processes since boot: CPU time (`ps cputimes`), memory, instances, disk I/O (`/proc/<pid>/io`, readable for the SSH user's own processes, or all as root) | Linux keeps no per-app history of exited programs (only with process accounting, `acct`); per-app network bytes need root tools (nethogs), so there is no Network column |

### API (all `GET` unless noted; under `/api/servers/:id`)

- `taskmanager/users` → `{ accounts: { name, uid, shell, kind: 'admin'|'standard'|'service' }[], sessions: { user, tty, from: string|null, loginAt: string|null }[], currentUser }`.
  `kind`: uid 0 → admin; uid ≥ 1000 (not 65534) with a login shell → standard; else service.
- `taskmanager/app-history` → `{ since: ISO (boot time), ioReadable: boolean, apps: { name, cpuSeconds, rssKb, instances, readBytes: number|null, writeBytes: number|null, users: string[] }[] }`,
  sorted by `cpuSeconds` desc. HeadlessOS's own probe commands (`ps`, `grep`, `cat` run by the SSH user) are left out.
- `taskmanager/startup` → `{ init: 'systemd'|'sysv'|'none', pid1: string, bootedAt: ISO, boot: { totalMs, firmwareMs|null, loaderMs|null, kernelMs|null, userspaceMs|null } | null, items: StartupItem[] }`;
  `StartupItem = { id, name, command: string|null, source: 'systemd'|'sysv'|'cron', enabled, delayMs: number|null, impact: 'high'|'medium'|'low'|null, toggleable }`.
  Impact from the unit's `systemd-analyze blame` time: ≥ 1 s high, ≥ 300 ms medium, else low. systemd items are `enabled`/`disabled` `.service` unit files (no static, masked or template units).
- `POST taskmanager/startup/:id/:action` (`enable`|`disable`) → `sudo systemctl enable|disable <unit>` or `sudo update-rc.d <name> enable|disable`. cron items are read-only.
- `services` (existing) gains per service `startup: 'automatic'|'manual'|'disabled'|null` and `pid: number|null`, and the response gains `init: 'systemd'|'sysv'|'none'`.
  systemd: `enabled*` → automatic, `disabled`/`static`/`indirect` → manual, `masked` → disabled. SysV: an `S??name` link in `/etc/rc2.d` → automatic, else manual; `[ + ]` → active, `[ - ]` → inactive.
  `POST services/:name/:action` uses `sudo service <name> start|stop|restart` on SysV hosts.

All commands are read-only except the two `POST`s, which already require sudo and are
confirmed in the UI. Each command is an exact allowlist pattern in `security/validators.ts`.

### UI

Four new `PaneSidebar` items after Performance (prototype order): App history, Startup apps,
Users, Services. Stat tiles + one table card per page, as in the prototype.
- **App history:** tiles "Tracking since" (boot), "CPU time" (total across apps), "Disk I/O", "Running apps"; table App · CPU time · Memory · Disk · Instances with inline bars; footnote on what Linux can and cannot report.
- **Startup apps:** tiles "Last boot time" (systemd-analyze, or "Up since" without systemd), "Enabled n of m", "High impact"; table Name (+ command) · Source · Impact · Delay · On (switch, confirmed).
- **Users:** a card per user with processes: avatar, name, kind ("Administrator", "Standard user · you", "Service account"), Active/Idle/Service badge, CPU and memory bars, "n processes · pts/0 since 14:02". No Sign out (it would kill the user's sessions, including HeadlessOS's own).
- **Services:** search + All / Running / Stopped; table Service (+ description) · PID · Status · Startup · Action. Stop and Start are confirmed; stopping `ssh`/`sshd` warns that it can cut this connection.

### Backend notes

- **Accounts** are read from `/etc/passwd` over SFTP, not `getent passwd`: `BLOCKED_COMMANDS` rejects any command containing `passwd` in every policy mode. NSS/LDAP accounts are therefore not listed.
- **cron** lines come from `grep -sh '^[[:space:]]*@' /etc/crontab /etc/cron.d/*` plus `crontab -l` (the SSH user's), filtered to `@reboot` in the parser; the blocklist also rejects the word `reboot`.
- **Startup ids:** systemd → unit name (`ssh.service`), SysV → script name (`ssh`), cron → `@reboot#<n>`. `POST startup/:item/:action` picks `systemctl` for `*.service`, `update-rc.d` otherwise, and returns 400 for `@reboot#…`. `name` is the unit Description / SysV `Short-Description`, falling back to the id without `.service`.
- **init detection:** `systemd` when `/run/systemd/system` exists (sd_booted) or PID 1 is `systemd`; else `sysv` when `/etc/init.d` has scripts; else `none`. `systemctl list-unit-files` works without systemd as PID 1, so it is not used as the signal. `services` falls back to SysV only when systemctl reports it cannot run (not booted with systemd, no bus, not installed); `POST services/:name/:action` tries `sudo systemctl` first and retries with `sudo service` / `sudo update-rc.d` on the same signal.
- **SysV startup items** are the scripts linked into `/etc/rc2.d` (`S??` enabled, `K??` only disabled); rcS-only scripts (procps, hwclock.sh) are not startup apps. SysV services report `pid: null`.
- **Boot:** `bootedAt`/`since` come from `btime` in `/proc/stat` (the server's clock). `systemd-analyze time` `(initrd)` is folded into `kernelMs`. systemd items get `delayMs` from `blame` (null if the unit did not start this boot); `enabled-runtime` units are shown as enabled but not toggleable.
- **Sessions:** `loginAt` is now − the age of the oldest process on that tty (`who` prints a zone-less wall-clock time); null when no process is on it. With an empty utmp (containers), each terminal with processes is one session.
- **ioReadable** is true when the SSH user is root or `/proc/<pid>/io` was readable for at least one process it does not own. Kernel threads (pid 2 and its children) are left out of App history, as are `ps`/`grep`/`cat`/`id` run by the SSH user.

## EX8.10 — HomeHub

A client-only sample of controlling home devices: nothing comes from or goes to a
server. `components/HomeHub/` ports `HomeHub.dc.html` to React: `HomeHub.tsx` (the
overlay, top nav, greeting + members, room bar), `cards.tsx` (camera, weather, air
conditioner with a draggable gauge, TV, ambient LED hue slider, Alexa, WiFi, music
player) and `hub-ui.tsx` (card glass, LED, power button, white glyphs).
- Same 1536×1150 canvas and coordinates, scaled by `min(vw/1600, (vh−24)/1170, 0.82)`;
  frosted brown backdrop above the dock (z 10050); `hub-in` / `hub-rise` keyframes.
- Escape, or a click on the backdrop, closes it. State `homeHubOpen` lives in the
  desktop store; opening it closes the launcher.
- Assets: 34 Fluent hub glyphs (MIT, C2PA metadata stripped, 34 KB) in
  `client/public/icons/hub/`; the sample photos in `client/public/hub/`.
- The root resets `font-variant-numeric` to normal: the app's body sets tabular
  digits, which made the prototype's numbers wider.
- Verified against the prototype at 1440×900: every card region matches pixel for
  pixel (0.00% of pixels differ by more than 60/255) except the TV app marks (0.4%,
  sub-pixel weight rendering). The prototype's image slots are empty when served
  locally; HomeHub shows the photos, as Claude Design does.

## EX8.11 — Top menu bar

The updated Claude Design moves the bottom-right tray pill into a thin strip along
the top. The local handoff predates it, so it was measured from the Claude Design
screen (2954×771 at DPR 1.5) and HeadlessOS was captured at the same viewport and
DPR to compare position for position.
- `Desktop/MenuBar.tsx`: 28px `.lumen-menubar` strip (translucent, ~14% darker
  than the wallpaper in dark mode, 1px light edge), "HeadlessOS" bold 13px at 14px
  from the left; on the right a 92×22px glyph pill (three 14px glyphs on a 28px
  pitch: connection, notifications, theme) that opens Quick Settings, then an
  accent dot (unread notifications) and "Wed Oct 21 · 01:40 AM" (13px semibold,
  proportional digits) that open the notification centre, ending 18px from the edge.
- Quick Settings is 380px wide (the prototype's `min(380, vw − 28)`; it was 360),
  8px from the right and 37px from the top; the notification centre hangs from the
  same corner. Both drop in (`lu-panel-down`).
- `TOP_RESERVE = 29` (strip + edge) in `window-store`: new, moved, restored and
  snapped windows stay below it; maximized windows and the snap preview start there.
  Desktop icons start 40px down. The session switcher's accent line and hover zone
  sit above the strip; its bar drops in below it.
- Measured against the design: strip height, label start, glyph pitch, pill width,
  pill-to-dot gap, date start, time end and the panel's edges all within 1px (the
  clock's width varies with the time shown).

## EX8.12 — Dock position

`dockPosition: 'bottom' | 'right'` (global preference, default `bottom`), set in
Settings → Appearance → Dock Position. Only the dock moves: on the right it is a
72px-wide vertical dock, 14px from the edge and centred in the space below the menu
bar; the utility well stacks vertically, tooltips open to the left and tiles lift
leftwards. The Launcher, Home hub, Search, Quick Settings and notifications open
where they always do. `dockInsets()` / `useDockInsets()` in `window-store` give the
space windows keep clear (`{ bottom: 98, right: 0 }` or `{ bottom: 0, right: 98 }`),
used by new/moved/restored/snapped windows, maximized windows and the snap preview.

## EX8.13 — Process detail card (re-port)

The EX8.6 card used a single 820px container breakpoint (stack ↔ 3-column grid);
the prototype reflows continuously. `ProcessDetailCard` now copies it: one
`flex-wrap` row (18px gap, padding 16×18, radius 22, violet `#9C8BFF` tint and
border) with columns `flex 1 1 220px` (name 17px + status, PID · user 13px, a
wrapped 12px mono command, 38px Suspend / End task pills), `1 1 228px` (CPU · last
60 s in a chip well, the prototype's own SVG sparkline via `sparkPaths`), and
`1 1 180px` (31px fact rows). The prototype has no `box-sizing` reset, so its sizes
exclude padding and borders; the 228px basis, 24px badge and 31px rows are those
sizes in border-box terms. Measured at card widths 1180, 740 and 500px against the
prototype: every column's x, y, width and height match, including the wrap at
500px (details on top, chart + facts below). The toolbar → card → table gaps are
14px, as in the prototype.

## EX8.14 — One segmented / tab control

The user preferred Settings' segmented control: a `bg-fill` well with 3px padding,
32px rounded-full options in 14px regular text, and the selected option raised on
`bg-mat-thick` (the theme surface). Other tab groups differed: Server Admin's lit
accent pills in a 40px bordered well, Task Manager's lit filters, Files' accent-tinted
view-mode circles, and 12–13px semibold pills elsewhere. `ui/segmented.tsx` now
holds the classes and a `Segmented` component; `ui/tabs.tsx`, Settings, Server Admin
(`SegmentTabs`, `SegmentButtons`), Task Manager (processes, services), Files view
mode, Quick Settings glass strength, Observatory filters, Control Center sections
and the Add server auth switch use it. Measured live: every one has a 38px well,
32px options, 14px / 400 text and the same selected background and colours as
Settings.

## EX8.15 — HomeHub as a glance

The layout, sizes and styling of EX8.10 stay; each card is re-bound (user's choices:
Open-Meteo weather for a city set in Settings, a server health dial, a photo frame
from the server; the music card stays a sample for now).

| Card | Bound to |
|------|----------|
| Greeting | "Good morning/afternoon/evening, <local user>!" (`GET /api/host`: `os.userInfo().username`, hostname). Headline: "All calm on / <server>", "<n> things need / attention", "Not connected to / <server>", "No server / connected yet" |
| Members → Users | accounts on the selected server with a session or processes (`GET taskmanager/users`), initials on the design's gradient discs; ＋ opens Server Admin → Security |
| Room bar → Servers | saved servers, each with its name (the selected one has the pressed background); picking one re-points the hub; ＋ goes to the Control Center to add one |
| Camera → Photo frame | images in a folder on the server (default `~/Pictures`, fallback: HeadlessOS wallpapers) via `files/download`; chip = folder, "Live" → "Slideshow", buttons prev / play-pause / full screen / open in Files; 8 s per photo |
| Weather | `GET /api/weather?lat&lon&units` → Open-Meteo forecast (current temperature, humidity, wind, 4 next days), cached 30 min; city via `GET /api/weather/geocode?q`; °C/°F toggles units. The card shows the condition only — the city stays in Settings (privacy). No city → "Set a city" prompt |
| Air conditioner → Server health | arc = Memory % by default (Task Manager poll, 2 s); Fan/Timer/Mode → CPU / Memory / Disk; LED green < 75 %, amber < 90 %, red above |
| TV → Recent apps | last 4 distinct apps (`recentApps`) on dark tiles; ＋ opens the Launcher; power → show desktop |
| Ambient LED → Display | `displayLevel` 0–100 with **50 = the normal look**: below dims (to 0.4 at 0), above brightens (to 1.35 at 100) through one full-screen `backdrop-filter: brightness()` layer that exists only off 50 (`lib/display-level.ts`); the bar is the design's colour ramp without its cyan/blue stops; LED + power = Night light (warm tint, `nightLight`) |
| Alexa → Assistant | opens the AI agent; LED/power reflect whether an LLM provider is configured (power opens Settings → AI / LLM when not) |
| WiFi → Connection | selected server's connection; power connects / disconnects; command latency underneath |
| Music player | unchanged sample (decided later) |
| Top nav | Search → command palette · Overview → hub · Calendar → notification centre · Scenes → Launcher · Bell → notifications on/off · Pie → Task Manager |

Outbound calls: only the weather routes, server-side, to `geocoding-api.open-meteo.com`
and `api.open-meteo.com` (no key; only the chosen city's coordinates leave the machine).

The dock's Recycle Bin shows the full bin (`trashfull`) while the active server's
trash has items (`useTrashHasItems`: every 15 s and on window focus).

Built as `routes/glance.ts` (host + weather, 30-minute cache, stale fallback),
`HomeHub/glance.tsx` (the re-bound cards, `useServerPulse`, `useServerUsers`),
`Desktop/WeatherCityPicker.tsx` (Settings → General → Weather) and a `DisplayFilter`
layer in `DesktopLayout`. Verified live: greeting with the local user, headline from
the server state (shrinks for long names), users, Delhi weather with a day-first
date, live CPU / memory / disk dial, recent apps, brightness + night light layers,
latency, both saved servers, and the photo frame from `~/Pictures` (falls back to the
wallpapers when the folder is missing).

## EX8.16 — Colour dock tiles

Every dock app sat on the same neutral glass plate. `Desktop/dock-tiles.tsx` gives
each its own tile, macOS-style, with a glyph that contrasts with it: Files white +
blue folder, Dashboard dark slate + gauge, Terminal near-black + white `>_`, Docker
Docker-blue + white whale, Task Manager white + violet chart, Settings grey + white
gear, Server Admin white + shield, Fleet blue + white globe; apps whose icon is
already a coloured squircle (Services, AI Agent, UI Agent, Observatory) fill the
tile; the Recycle Bin has no tile. Apps without a tile keep the glass plate.
`dockIconStyle: 'color' | 'glass'` (Settings → Appearance → Dock Icons, default
Colour) switches back to the EX8.4 plates.

## EX8.17 — Idle glance (privacy screen)

After `idleGlanceMinutes` (preference; 1 minute while the user tests it, 0 = off)
with no pointer, key, wheel or touch input on the desktop, the Home hub opens in
**away** mode. It sits above everything with its 34px backdrop blur, so windows
behind it are unreadable. A key press or a click outside the cards returns to the
desktop; moving the mouse does not, so the glance stays readable. Screen output
(terminals, agents) is not activity, as with an OS screensaver. It is a privacy
screen, not a lock: anyone at the machine can dismiss it. A Settings timer comes
after the test.

Verified live: no hub after 50 s idle; the away hub (with an "Away · press any key
to return" pill) at ~60 s over an open Terminal; a mouse move keeps it, a key press
returns to the desktop. `hooks/useIdleGlance.ts` checks every 5 s; tests use fake timers.

## Deviations from the handoff text (prototype wins where they differ)

- **Settings row type and light-theme contrast (user review):** the prototype's
  15px label over a 14px description was too close a step; descriptions are now
  13px. Light labels are darker than the tokens' `.9 / .72 / .5` (now
  `.95 / .82 / .74`): measured from rendered pixels, light Heavy glass sits
  mid-grey over the wallpaper and `.72` gave 4.2:1, below WCAG AA; now ≈ 5:1.
  Dark labels already measured 8–14:1 and are unchanged.

- **Control height (user review):** every Button size (`default`, `sm`, `icon`), Input and Select trigger is `h-9` (36px); call-site overrides below 36px were removed. Window title-bar controls stay 28px, as specified.
- **Button:** `default`/`primary` stay the lit call-to-action (84 call sites rely on
  it); `secondary`/`outline` are the neutral glass pill.
- **Dock tiles** use the prototype's 50px plates / 32px icons / 5px hover lift.
- **Launcher search** is the prototype's recessed 46px well; server chip instead of
  the weather chip.
- **Maximized windows:** radius 0, no border, ending `DOCK_RESERVE` (98px) above the
  bottom, as the handoff says.
- **Terminal pane** is always dark (`--lumen-term-bg`), as in the prototype, not
  `bg-paper`.
- **Sidebar icons, scrollbars, hover radius (user review):** every `PaneSidebarItem` glyph is `text-accent-text` (the selected one `text-accent-solid`), as in the prototype's sidebars. The sidebar list scrolls with `.scrollbar-on-hover`: the thumb is hidden until the pointer is over the list or focus is inside it (Chromium ignores `:hover::-webkit-scrollbar-thumb`, so the thumb paints the scroller's inherited `border-color`). Menu rows and select options use `rounded-sm` (10px, `--radius-sm`) instead of the handoff's 4px, like sidebar and palette rows; desktop icon hover boxes and Dynamic UI log/tree rows too. Menu glyphs keep the label colour, as in the prototype.
- **Dock indicator (user review):** no focus ring and no underline; a running app gets a 7px accent dot 5px inside its tile's top-left corner (glowing when focused, 55% when in the background). Glyphs are grid-centred in the plate and tiles are centred in the 72px bar (11px above and below; the tile wrappers are `flex` so no baseline gap pushes them up).
- **Docker icon (user review):** the Docker app icon is the real Docker whale (`client/public/icons/brands/docker.svg`, Simple Icons path, CC0; Docker blue `#1D63ED`), not the Fluent `package` box, which is now only the archive-file icon. Containers keep the cube glyph. The whale also marks the not-installed state and docker/containerd rows in Task Manager.
- **Tray glyphs** are icon-only (server name in their tooltip); since EX8.11 they live in the top menu bar.

## Verification

- `npx tsc --noEmit` clean for client and server.
- Client 564 tests, server 2010 tests (+1 skipped) passing at EX8.7; after EX8.9,
  client 593 and server 2154 (+1 skipped).
- EX8.9 Playwright on the SysV dev box: all four pages render live data (App history
  totals, 3 SysV start links + container notice, user cards, 5 SysV services); the
  systemd paths are covered by parser and route tests only. No start/stop/enable/
  disable was run against the box.
- Playwright side-by-side: 13 screens × dark/light, Claude Design prototype vs
  localhost at 1440×900 (lock, sign-in, desktop, launcher, quick settings,
  notifications, context menu, Files, Settings, Terminal, System, Activity,
  Server Admin), plus 1024×768 for desktop / launcher / quick settings / Files.
- Known gaps (no data in HeadlessOS): firewall warning dot in the Server Admin
  sidebar, OS/uptime on its host card, storage usage bars, per-core lines in the
  Performance chart are neutral.

## Not in scope

- The prototype's Browser, Notepad, Calculator and Photos apps.
- Wi-Fi, Bluetooth, volume and brightness controls (no local hardware to drive).
