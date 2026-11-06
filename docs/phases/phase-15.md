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
- **Help menu (macOS):** Open Logs, Documentation (`https://headlessos.com/docs/introduction`)
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
| M15.7 | Tag v0.2.1 and check the release | ⬜ |
| M15.8 | macOS local network access | ✅ |
| M15.9 | Refreshes and view buttons may only read | ⬜ |
| M15.10 | Sign-in shows the real error | ⬜ |
| M15.11 | A wrong password is tried once | ⬜ |
| M15.12 | SSH keys are encrypted, and a failed decrypt keeps the server list | ⬜ |
| M15.13 | Output is redacted before the parsing fallback | ⬜ |

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

**Not tested:** anything on macOS, including the Help menu's Open Logs, the local network
prompt (M15.8) and the 0.2.0 fix for issue #9. The Windows installer has not been run either.
