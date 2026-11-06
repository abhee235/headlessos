# Phase 15 — Desktop Diagnostics (M15)

> Release 0.2.1. When the desktop app goes wrong, it should say what happened and leave a
> log that anyone can open. Linux joins the release builds. Tagging is the owner's
> decision (M15.7).

## Why

GitHub issue #9: on a Mac, Add Server showed only "Failed to fetch", and the reporter asked
"Are there logs to check?". The cause was the M14.11 fault, fixed in 0.2.0, but the report
showed what 0.2.0 still lacks:

- **The error says nothing useful.** `lib/api.ts` `request()` lets the browser's own
  "Failed to fetch" reach the screen. Nothing tells the owner that the app's own backend is
  the problem, or that nothing reached the server.
- **There are no logs.** The backend logs to stdout (`Fastify({ logger: true })` and
  `console.log`), and `electron/main.js` reads stdout only for the port and token, then
  throws it away. stderr goes to the main process's console, which only exists when the app
  is started from a terminal. The other things called logs are not the app's:
  - Server Admin → Logs reads the *remote* server's logs.
  - The LLM Observatory shows model calls.
  - `~/.headlessos/audit/` records agent actions.
- **A backend crash is silent.** `serverProcess.on('exit')` writes to that same console.
  Every window then fails with "Failed to fetch". If the backend dies before it is ready,
  the app waits out the full 20 seconds.
- **The Help menu is broken and partly unreachable.** Documentation and Report Issue open
  `github.com/headlessos/headlessos`, which does not exist. The window uses
  `titleBarStyle: 'hiddenInset'`, so only macOS shows the menu at all.
- **Linux is advertised but not built.** The home page says "Windows · macOS · Linux" and
  `electron/package.json` has AppImage and deb targets, but `release.yml` has no Linux job.

## Design

### M15.1 — A readable error when the backend can't be reached

`fetch` rejects only when no response came back, so a rejection inside `request()` means the
backend is unreachable. HTTP errors already carry the server's own message and don't change.

- `request()` catches the rejection and throws an error with this text, keeping the original
  as `cause`:
  - **Desktop app:** "HeadlessOS can't reach its own backend, so nothing was sent to your
    server. Restart the app. If it keeps happening, open the log from Global Settings."
  - **Browser (run from source):** "HeadlessOS can't reach its backend, so nothing was sent to
    your server. Check that the server from `npm run dev` is running."
- An `AbortError` is rethrown unchanged: an aborted request is not a failure.
- Add Server and sign-in show `err.message`, so they need no change.
- Direct `fetch` callers (wallpapers, Observatory, the session save) keep their own handling.
  None of them is on the path to connecting a server.

### M15.2 — The app notices when the backend stops

In `electron/main.js`, using a pure `backendExitAction({ stopping, ready })` from
`electron/diagnostics.js`:

| When the backend exits | What happens |
|---|---|
| The app is stopping it | Nothing |
| Before it was ready | `startServer()` rejects at once with the exit code, instead of after 20 s. The existing error box gains the log's path |
| While the app is running | A dialog with **Restart**, **Open Log** and **Quit** |

A process killed on Windows reports an exit code of about 1.8e19, so anything that isn't a
safe integer reads "was stopped" (`describeExit`).

**Restart** starts a new backend and reloads the window. Reloading runs the preload again, so
the window gets the new port and token. Restarting the backend alone avoids relaunching the
app, which needs special handling in the portable and AppImage builds. **Open Log** shows the
log and leaves the dialog up.

### M15.3 — A log file

The main process writes one file: `~/.headlessos/logs/headlessos.log`, next to the app's other
state, so the path is the same on every platform.

- **What goes in:**
  - one header line per launch: app version, platform, architecture, Electron version;
  - backend stdout and stderr;
  - backend start, exit code and restart;
  - from the window: `preload-error` (the M14.11 fault), `render-process-gone`,
    `did-fail-load`, and console errors.
- **Format:** `<ISO time> [source] <line>`, one line each.
- **Secrets stay out.**
  - The `HEADLESSOS_TOKEN:` line is dropped.
  - `token=` in URLs (`withToken` puts the API token in image and WebSocket URLs, and Fastify
    logs request URLs) is masked.
  - Passwords, API keys and bearer tokens are masked with the same patterns as
    `agent/actions/redact.ts`. `main.js` is not bundled with the server, so
    `electron/diagnostics.js` has its own short copy, and a test feeds both the same samples.
- **Names stay out too,** because people paste logs into public issues. The packaged run
  showed Fastify putting the computer's name on every line, so `hostname` is removed, and the
  home folder is shown as `~`, including the forms it takes in URLs and JSON.
- **Size:** at 5 MB the file moves to `headlessos.1.log`, replacing the older one, so the logs
  never pass 10 MB.
- **Permissions:** the folder is `0700`, the files `0600`.
- **It never breaks the app.** A failed write is ignored.
- **Lines are whole.** Chunks of backend output are held until their newline, so a token
  split across two chunks can't get past the filter.
- **Writes are synchronous,** so the last lines before a crash reach the disk.
- **Nothing leaves the machine.** The log is only opened when the owner asks.

### M15.4 — Opening the log, and working Help links

- Main answers `ipcMain.handle('open-logs')` by showing the log in Finder or Explorer
  (`shell.showItemInFolder`). The preload exposes it as `electronAPI.openLogs()`.
- **Global Settings** gets an "Open log" row. It is the one place reachable without a server
  connection, which is when the log matters most, and it works on every platform.
- **Settings → About** gets the same row. Both show only in the desktop app.
- **Help menu:** Open Logs, Documentation (`https://headlessos.com/docs/introduction`)
  and Report Issue (`https://github.com/abhee235/headlessos/issues`).
- The README gets a "Logs" section. The website's docs follow after the release.

### M15.8 — macOS local network access

Issue #9's reporter connects from a Mac to a Raspberry Pi on their local network, and SSH from
Terminal works. Since macOS 15, an app needs the owner's permission to reach a device on the
local network. Apple's TN3179 says command-line tools run from Terminal are exempt, and that a
helper process counts as its app, so the backend's SSH connection is covered and a Terminal test
says nothing about it. 0.2.0 reaches its backend, so this is the next thing that can stop that
reporter. It can't be seen on Windows, or on a Mac connecting to a public server.

- `electron/package.json` adds `mac.extendInfo.NSLocalNetworkUsageDescription`, which Apple asks
  apps that use the local network to declare, so the prompt says why.
- When a connection fails with `EHOSTUNREACH` on macOS, the error adds where the permission
  lives: System Settings → Privacy & Security → Local Network. The wording says "may", because
  Apple names no error code for this and a Pi that is really offline gives the same one
  (forum reports show `EHOSTUNREACH`).

**Open risk.** TN3179 tracks permission by code signature and main executable UUID, and warns
that a UUID shared with other programs "may behave weirdly". Our build is unsigned, and an
Electron app's main executable comes from Electron's own binary, so this may not be enough on its
own. Only a run on a Mac, against a device on the local network, can tell.

### M15.9 — Refreshes and view buttons may only read

Writing the docs against the code found an approval bypass. A widget's `dataSource.command` can
be written by a model, nothing on the server removes it, and `useWidgetRefresh` posts it on a
timer with no click, as often as every 5 seconds. `/dynamic-ui/refresh` only called
`validateCommand`, and the allowlist also holds commands that change a server: `systemctl stop`,
`docker rm`, `apt remove -y`, `ufw disable`, `docker run`. `/dynamic-ui/execute-action` already
refused those; the refresh route was missed. Output from a server reaches the model, so a
crafted log line could steer it. This breaks the promise that changes wait for approval.

Two more gaps showed up while checking it. Both passed as low risk:
- `find /etc -maxdepth 1 -delete`, because the `find` rule stops matching after `-maxdepth`.
- `docker ps > /root/.bashrc`, because a redirect can follow any rule with an open end.

**Fix:**
- `isReadOnlyCommand()` in `security/validators.ts`: allowlisted, not medium or high risk, and no
  redirect to a file (`2>&1` and `/dev/null` are fine). Both routes use it, so they can't drift.
- The blocklist refuses `find` with `-delete`, `-ok`, `-okdir`, `-fprint`, `-fprint0`, `-fprintf`
  or `-fls`, next to the existing `-exec` rule.

### M15.10 — Sign-in shows the real error

`connectServer` in `store/app-store.ts` catches the error and drops it, so `LoginScreen` always
says "Connection failed. Check server credentials." The M15.1 and M15.8 messages never reach that
screen, and it blames the password for every failure, which is the wrong advice for issue #9.

**Fix:** the store's `connectServer` returns the error message, or `null` on success. It doesn't
throw, because several callers don't wait for it. `LoginScreen` shows the message. A refused
login reads "The server refused this login. Check the username and password, or the key."

### M15.11 — A wrong password is tried once

`connect()` skips retries when the message includes `Authentication`, but ssh2 says "All
configured authentication methods failed", in lower case. One wrong password makes four
attempts, which can trip fail2ban and lock the owner out. **Fix:** `isAuthFailure()` ignores case.

### M15.12 — SSH keys are encrypted, and a failed decrypt keeps the server list

`AddServerForm` puts the key text in `privateKeyPath`, and `ConfigStore.save()` encrypted only
`password`, so keys and passphrases sat in `servers.json` in plain text, while `SECURITY.md` said
keys are "referenced by path, never copied". `GET /api/servers` also sent the key text to the
window.

`ConfigStore.load()` also treated any failure as "no file yet". If one password couldn't be
decrypted, the list came up empty and the next save overwrote `servers.json`, losing every server.

**Fix:**
- `save()` encrypts `password`, `privateKeyPath` and `passphrase`. Existing plain text is
  encrypted at the next start, the way plain passwords already were.
- The server routes strip all three.
- A secret that can't be decrypted is dropped and its server stays, so the owner signs in again.
- Only a missing file means an empty list. A file that can't be parsed moves to
  `servers.json.broken`, so it is not overwritten.
- `SECURITY.md` is corrected, and gains a note that SSH host keys are not checked yet.

### M15.13 — Output is redacted before the parsing fallback

`SECURITY.md` says redacted output goes to the model, but only agent runs were redacted.
`pipeline.parse()` and `DynamicUIGenerator` sent output with ANSI codes stripped and nothing else.
**Fix:** both pass it through `redactSecrets` first. Cached results keep their keys, which come
from the raw output.

### M15.14 — A failed sign-in explains itself

M15.10 put the real error on the sign-in screen, but the real error is raw: `connect ECONNREFUSED
[ip]:2222`. It doesn't say what to do, nothing on the screen leads to the log or the docs, and
`[ip]` hides an address the same screen shows two lines higher.

**Fix:** a card replaces the red pill. `describeConnectFailure()` in `ssh/connect-failure.ts`
turns the raw error into a `ConnectFailure`, the route returns it, and `ProblemCard` shows it:

- `title`: one plain sentence.
- `hint`: what to try. Optional.
- `detail`: the exact error, with a Copy button, so it can be searched for. The address the owner
  typed is put back; everything else stays sanitized. A failure with no raw error has none.
- `help`: the section of the docs Troubleshooting page. **How to fix this** opens it in the
  default browser.
- **Open log** appears in the desktop app only, as M15.4 does elsewhere.

| Raw error | Title | Section |
| --- | --- | --- |
| `ECONNREFUSED` | Nothing is answering at host:port | `connection-refused` |
| `Timed out`, `ETIMEDOUT` | host:port didn't answer | `connection-timed-out` |
| `ENOTFOUND`, `EAI_AGAIN` | Can't find host | `host-not-found` |
| `EHOSTUNREACH`, `ENETUNREACH` on macOS | Can't reach host, with the M15.8 hint | `local-network-access-on-macos` |
| `EHOSTUNREACH`, `ENETUNREACH` elsewhere | Can't reach host | `no-route-to-host` |
| authentication failed | The server refused this login | `login-rejected` |
| `no passphrase given` | This key needs its passphrase | `ssh-key-problems` |
| `Bad passphrase` | That passphrase is wrong | `ssh-key-problems` |
| `Cannot parse privateKey` | This SSH key can't be read | `ssh-key-problems` |
| anything else | Couldn't connect to this server | `a-server-wont-connect` |
| no response from the backend (client side) | the M15.1 message | `backend-errors` |

The screen must still fit at the window's minimum size, so below 640px of height it tightens up:
smaller gaps, a smaller avatar, and it scrolls if a long hint still doesn't fit.

`connectErrorMessage()` goes. The store's `connectServer` returns a `ConnectFailure` or `null`.
`loginError` leaves the store: only `LoginScreen` used it, and it now keeps the failure itself.

### M15.15 — Help in Control Center

The log is in Global Settings and the app's Help menu, and the docs are only in that menu, which a
browser doesn't have. Neither is where someone stuck at sign-in is looking.

**Fix:** a Help button at the top right of Control Center, on every tab, with Documentation,
Troubleshooting, Report an issue and, in the desktop app, Open log.

### M15.16 — A saved secret that's gone says so

The packaged run of M15.12 showed the gap. Once a saved key can't be decrypted, the sign-in screen
still says "SSH key configured", the app connects with nothing to offer, and the owner reads "The
server refused this login" about a server that never saw a key. An empty password field on a
server with no saved password reads the same way.

**Fix:**
- `GET /api/servers` adds `keyLost: true` to a key server with no key. The window still gets no
  secret. The sign-in screen shows "Saved key can't be read" in place of "SSH key configured".
- Signing in to such a server connects to nothing and returns "This server's saved key can't be
  read", with what to do: go back, remove the server, add it again.
- A refused login with no password saved and none typed reads "No password was sent".

### M15.17 — A damaged server list says so

M15.12 moves an unreadable `servers.json` to `servers.json.broken`, but the screen then says "No
servers configured yet", as if nothing had happened, and nothing is logged. A file that is valid
JSON but not a list still stops the backend from starting.

**Fix:** `ConfigStore` logs it, and `GET /api/servers/notice` reports `servers.json.broken` for as
long as that file exists. The empty sign-in screen shows a `ProblemCard` naming the kept file in
place of "No servers configured yet". Anything that isn't a list counts as damaged.

### M15.18 — Saved secrets survive a change of computer name

The encryption key mixes in `os.hostname()`. On a Mac that name can follow the network, so
changing networks could make every saved password, key and AI key unreadable. M15.12 keeps the
servers, but the secrets are dropped at the next save. The random `enc-key` is what protects the
secrets; the hostname adds nothing an attacker can't read. See ADR-028.

**Fix:**
- New values are `enc:v2:<iv>:<tag>:<ciphertext>`, with a key from `enc-key` and the OS user ID.
- Older values still open, with the two older keys.
- `ConfigStore` and `loadLLMSettings` re-encrypt older values they can read, at startup, so the
  move happens while the old name still works.
- A secret that can't be read doesn't trigger a save, so a start on the wrong name loses nothing.

### M15.19 — Release notes name the real files

The notes in `release.yml` list `HeadlessOS Setup *.exe` and `HeadlessOS *.exe`, but GitHub
replaces spaces with dots, and say the installer goes to Program Files. It installs per user: the
build has no `nsis` setting, so it uses electron-builder's default. **Fix:** correct the template.

### M15.20 — The built app keeps its glass

In a built app, windows, panels and the top bar have no blur, so desktop icons show through a
window. The dev server looks right, and the Windows, Mac and Linux builds are all wrong, so this
isn't a platform difference: every build is Chromium, and they share one stylesheet.

`styles.css` declares `backdrop-filter` and then `-webkit-backdrop-filter` on `.glass`,
`.glass-heavy` and `.lumen-menubar`. Tailwind's build runs Lightning CSS, which treats the two as
one property and keeps the last, and Chromium ignores the prefixed one. The dev server doesn't
minify, so it keeps both. Tailwind's own `backdrop-blur-*` classes are unaffected, which is why the
sign-in screen still blurred.

**Fix:** remove the three prefixed lines, so Lightning CSS keeps `backdrop-filter`. No per-platform
theme is needed. A test runs the stylesheet through Lightning CSS and checks all three rules.
### M15.21 — First launch on a Mac, with a screenshot

The README offered right-click → Open, which macOS 15 removed, and didn't show what the block
looks like. Opening the draft 0.2.1 DMG on a Mac (macOS 26.5.2, Apple Silicon) gave the real
screen, and the way past it.

- `README.md` gets a "First launch on a Mac" section: the steps, the screenshot, and the
  "is damaged" fallback that the release notes already give.
- `docs/images/macos-open-anyway.png` is that screenshot. The FileVault row below the block is
  painted out, because this repository is public and that row describes the owner's laptop.
- The approval belongs to the installed copy. Each new version is a new download, so users do it
  again once per version until the build is signed and notarized.

### M15.5 — Linux in the release

- `release.yml` gets a `build-linux` job on `ubuntu-latest`, built like the Windows job, that
  uploads `*.AppImage` and `*.deb`. The release job waits for it and attaches them.
- deb packages need a maintainer: `electron/package.json` sets
  `linux.maintainer` to a project address, never a personal one, and adds `homepage`.
- The release notes get Linux rows. The site's Linux card already looks for these files.
- `workflow_dispatch` lets the owner build every platform from a branch without a tag. Only a
  tag creates a release, so a test build can't publish anything by accident.

### M15.6 — Version 0.2.1 and changelog

The version in every `package.json`, `server/src/index.ts`, the About page and `Desktop.tsx`,
and a dated `CHANGELOG.md` entry.

### M15.7 — Tag v0.2.1 and check the release (owner's decision)

Push `v0.2.1`, then check that all six files are there and that the app starts on each
platform the owner can reach. Publishing stays manual.

The README, the release notes and the repository's website field now link to headlessos.com, so
someone landing on GitHub can reach the docs and the blog.

## Not in this phase

- A log viewer window: the file opens in the system's own tools.
- Sending logs anywhere. The site promises no telemetry.
- Replacing the raw message in every direct `fetch` caller.
- Code signing.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| M15.1 | A readable error when the backend can't be reached | ✅ |
| M15.2 | The app notices when the backend stops | ✅ |
| M15.3 | A log file with secrets kept out | ✅ |
| M15.4 | Opening the log, and working Help links | ✅ |
| M15.5 | Linux in the release | ✅ |
| M15.6 | Version 0.2.1 and changelog | ✅ |
| M15.7 | Tag v0.2.1 and check the release | ✅ |
| M15.8 | macOS local network access | ✅ |
| M15.9 | Refreshes and view buttons may only read | ✅ |
| M15.10 | Sign-in shows the real error | ✅ |
| M15.11 | A wrong password is tried once | ✅ |
| M15.12 | SSH keys are encrypted, and a failed decrypt keeps the server list | ✅ |
| M15.13 | Output is redacted before the parsing fallback | ✅ |
| M15.14 | A failed sign-in explains itself | ✅ |
| M15.15 | Help in Control Center | ✅ |
| M15.16 | A saved secret that's gone says so | ✅ |
| M15.17 | A damaged server list says so | ✅ |
| M15.18 | Saved secrets survive a change of computer name | ✅ |
| M15.19 | Release notes name the real files | ✅ |
| M15.20 | The built app keeps its glass | ✅ |
| M15.21 | First launch on a Mac, with a screenshot | ✅ |

## Checks

- **Unit tests:** the error text and `AbortError` in `request()`; `backendExitAction`; the log's
  filtering, line assembly and rotation; every local `require` in `main.js` is packaged (a
  missing one stops the app starting); the preload's new channel is answered.
- **Packaged Windows build, driven with an isolated home:**
  - Add Server with the backend killed shows the new message, not "Failed to fetch".
  - Killing the backend brings up the dialog, and Restart gives a working window.
  - The log has the session in it, and no token, password or `HEADLESSOS_TOKEN:` line.
  - Open log shows the file from Global Settings.
- **Linux:** a package build in WSL, then the real job through `workflow_dispatch` or the tag.

## As built

All checks above ran. These are the results, and what the packaged run changed.

**Packaged Windows build,** driven over CDP with an isolated home and a local `ssh2` stand-in:

- Add Server with the backend killed shows the new message after about 2.3 s, which is how long
  Windows takes to give up on a closed port. It fits the form and "Failed to fetch" is gone.
- Killing the backend brings up the dialog. Open Log shows the folder and leaves the dialog up.
  Restart gives a new port, and the reloaded window reaches it.
- With `server.mjs` missing, the error box appears in about a second, where it took 20 s.
- After a real sign-in the log has no API token, no password, no `HEADLESSOS_TOKEN:` line, no
  computer name and no home path. A wallpaper request shows `?token=[redacted]`.
- Open log works from Global Settings. Settings → About shows the row and version 0.2.1.
- Ctrl+Shift+I opens DevTools on Windows, even with no menu bar.

**What the packaged run changed.** The first run put the computer's name in every backend line
and would have shown a killed process's exit code as 18446744073709552000. The unit tests
could not have caught either, and both are fixed in the spec above. DevTools adds a few lines of
Chromium's own CSS notices to the log while it is open; they are harmless and left in.

**Linux:** `electron-builder --linux --x64` in WSL Ubuntu made `HeadlessOS-0.2.1.AppImage` and
`headlessos-desktop_0.2.1_amd64.deb`, with the right maintainer and homepage, `diagnostics.js`
in the asar and `server.mjs` in resources. **The packages have not been started:** that WSL
install lacks libnss3 and libasound, so the first run on a Linux desktop is still to come. The
workflow job itself first runs at the tag.

**M15.14 to M15.20,** packaged Windows build from the branch, driven over CDP with an isolated home
and a local `ssh2` stand-in that logs every login attempt:

- Glass, in the 0.2.1 draft and the fixed build, with the same steps and home: window blur `none`
  against `blur(44px) saturate(1.9)`, top bar `none` against `blur(30px) saturate(1.6)`, and the
  same colours. With the window maximized over the desktop icons, the draft shows them sharp, as
  in the owner's screenshot, and the fixed build doesn't.
- The test on Lightning CSS fails on the old stylesheet in all three rules and passes on the new.
- A closed port shows the card, with the real address in the exact error. Copy puts that text on
  the clipboard. The card is 380 × 171 with a 24 px gap, and its buttons are 36 px.
- At 800 × 540, the window's smallest content area, the first version ran 2 px off the bottom and
  put the avatar 6 px under the header. That is why the short layout exists. All four cards now
  fit, with no scrolling.
- A lost key shows "Saved key can't be read" and doesn't connect at all. A blank password connects
  and sends none, and says so. A wrong password makes one attempt.
- A `servers.json` written by the 0.2.1 draft moves to the new format at startup, before any click.
- A damaged file shows its card at every start, names `servers.json.broken`, and logs one line.
- Passwords, key text and the computer name stay out of the log.
- Every section the code can link to exists on the built Troubleshooting page.

**What the run changed:** the short layout. Separately, the owner's dev server picked up M15.18 from
the main checkout and moved the real `servers.json` and `llm.json` to the new format, which the
installed draft can't read. Both were converted back and the work moved to a worktree. Installing
the rebuilt draft moves them again, and from then on older builds can't read them.

**Not clicked in a packaged app:** How to fix this and the Help menu's links, which open the owner's
browser, and whose pages aren't live until the docs are deployed. Their addresses are checked.

**Published** on 2026-11-06 from `e963a4a`, with all six files. On the downloaded Windows portable
build: glass, the sign-in card, one attempt on a wrong password, an encrypted key that signs in, a
clean log, and the dock in both positions, including a real scrollbar drag with it on the right.

**macOS:** the owner ran the release build on macOS 26.5.2 (Apple Silicon) and reports it works.
The first-launch block and Open Anyway are confirmed (M15.21). The local network prompt (M15.8) and
the 0.2.0 fix for issue #9 aren't recorded in detail, and issue #9 stays open until the reporter
confirms.

**Not recorded as run:** the Windows installer, and the Linux packages, which have not been started.
