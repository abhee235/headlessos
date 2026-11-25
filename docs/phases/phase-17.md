# Phase 17 — One Command to Install, and a Mac App With Its Own Identity (M17)

> From GitHub issue #9. On macOS 27.2.1, 0.3.2 can't reach a Raspberry Pi on the reporter's local
> network, though HeadlessOS is switched on under Local Network and `ssh` from Terminal works. This
> phase gives the Mac app an identity of its own, and adds a one-command install for macOS and
> Windows that skips the first-launch warnings.

## Why

macOS and Windows put two different checks in the way, and only one depends on how the app got there.

| Check | What sets it off | Does a one-command install avoid it? |
| --- | --- | --- |
| Gatekeeper on macOS ("Open Anyway", "is damaged") | The browser marks the file as downloaded | Yes: files fetched with `curl` aren't marked |
| SmartScreen on Windows ("Windows protected your PC") | The browser adds the same mark | Yes: PowerShell's `Invoke-WebRequest` doesn't add it |
| Local Network on macOS (issue #9) | macOS checks the app's signature and its main executable's UUID | No: Apple's TN3179 never mentions how an app was installed |

TN3179 says local network privacy "tracks the identity of your program using its code signature", and
that a main executable that "shares a UUID with other programs" may make it "behave weirdly". Our
build has both problems:

- The release log says `skipped macOS application code signing`. The app keeps only the signatures
  its files came with from Electron, and no signature covers electron-builder's edits to the bundle.
  A signature that doesn't match the bundle is the usual reason macOS says an app "is damaged".
- The main executable is Electron's prebuilt binary, renamed. Every app built on Electron 33.4.11
  shares its UUID. TN3178 names this case: one executable used for several apps, after which "the
  network subsystem might apply constraints for one of your apps to the other app".

The log attached to the issue fits this. Each connect fails with `EHOSTUNREACH`, and Node adds
`- Local (…)` to the message only when `connect()` fails at once, so the Mac refused it before any
packet left. A restart didn't help.

**It doesn't happen on every Mac.** On the owner's Mac (macOS 26.5.2), 0.3.2 connected over the local
network to the dev SSH container on the owner's Windows PC with no trouble. So the build can be
granted the permission, and something about the reporter's Mac makes macOS refuse it. The likely
differences:

- **macOS 27:** the reporter is on 27.2.1. Apple's forums report a new Local Network entry for each
  build of an unsigned app on macOS 27, so the switch that is on may belong to an older HeadlessOS.
- **Another app with the same UUID:** an app on Electron 33.4.11 that was denied the local network
  could pass that decision to HeadlessOS (TN3178).
- **A firewall or VPN app** that blocks one app and not Terminal. The reply to the issue asks.

M17.2 is aimed at the first two.

## Design

### M17.1 — Checksums and provenance on every release

The release job renames each file to the name GitHub gives it (a space becomes a dot), writes
`SHA256SUMS` for all of them, attests their provenance with `actions/attest-build-provenance`
(pinned by commit, as in Kuchu), and uploads `SHA256SUMS` with the rest. The install scripts check a
file against `SHA256SUMS`, and against the attestation when GitHub's CLI is signed in.

### M17.2 — The Mac app gets its own identity

An electron-builder `afterPack` hook, `electron/scripts/mac-identity.js`, runs on the finished
universal app, before the DMG and zip are made. electron-builder 25 can't sign ad hoc by itself.

1. **Its own UUIDs.** Apple has no tool to change a built executable's UUID, and the signature
   covers it (TN3178), so the hook rewrites the 16 bytes of `LC_UUID` before signing. It does this
   for the main executable and each `HeadlessOS Helper` app, in every architecture slice.
   `electron/scripts/macho-uuid.js` reads thin and universal Mach-O files and changes nothing else.
   Each new UUID is a SHA-256 of the app ID, the version, the file's path in the bundle and the CPU
   type, so a build can be reproduced, and no other app or version gets the same UUID.
2. **Its own signature.** `codesign --force --deep --sign -` signs the whole bundle ad hoc, inside
   out, under the bundle's own identifier (`com.headlessos.app`). The signature then matches the
   bundle, so the "is damaged" message should stop. If an Apple certificate is set up later,
   electron-builder signs over this as before.

The hook does nothing for Windows and Linux, or for the single-architecture copies
electron-builder makes before merging (folders ending in `-temp`). A Mac build without `codesign`
stops with an error, rather than shipping an app half-changed.

The release workflow then checks the built app on the macOS runner, before any upload:

- `codesign --verify --deep --strict` passes;
- `codesign -dv` shows `Identifier=com.headlessos.app` and an ad hoc signature;
- the arm64 UUID of the main executable differs from Electron's own;
- the app starts as Node (`ELECTRON_RUN_AS_NODE=1`) and prints its Electron version, so the
  changed executable still loads.

### M17.3 — One command to install

Kuchu's scripts are the model: everything runs from one function called on the last line, so a
script cut off part-way runs nothing. Each file is checked against the release's `SHA256SUMS`, and
against its attestation when `gh` is signed in. The install is for the current account only, with no
administrator rights, and the script refuses to replace a copy that is running.

- **macOS,** `curl -fsSL https://raw.githubusercontent.com/abhee235/headlessos/main/install.sh | sh`:
  - finds the latest release from the redirect of `/releases/latest`, with no API call;
  - downloads `HeadlessOS-<version>-universal-mac.zip` and unpacks it with `ditto`, which keeps the
    framework links that `unzip` can break;
  - checks the signature with `codesign --verify`;
  - replaces the copy where it already is, in `/Applications` or `~/Applications`, or puts a new one
    in `/Applications` (or `~/Applications` when that isn't writable), then opens it.
- **Windows,** `irm https://raw.githubusercontent.com/abhee235/headlessos/main/install.ps1 | iex`:
  - finds the latest release from the same redirect: the GitHub API allows 60 calls an hour per
    address, and a shared network can use that up (it happened while testing this);
  - downloads `HeadlessOS.Setup.<version>.exe`, runs it with `/S`, which installs for the current
    account in `%LOCALAPPDATA%\Programs\headlessos-desktop`, then starts the app from there (the
    uninstall entry says where, if it isn't there);
  - with `iex`, a script that exits would close the window, so it reports errors instead of throwing.

Other systems are pointed to the installation page. A release without `SHA256SUMS`, which is every
release before this phase, is refused, so the commands work from the first release that has them.

### M17.7 — The app explains the Local Network prompt before macOS shows it

As M16.3 does for the Keychain, the desktop app says what is about to happen. On a Mac, the first time
in each version that the owner signs in to a server whose address is on a local network, the main
process shows a dialog before the connection starts. It says that macOS will ask to let HeadlessOS find
devices on the local network, to click **Allow**, and to connect again if the first try fails while
macOS asks.

- **What counts as local**, in `client/src/lib/local-network.ts`: a private IPv4 address (`10.`,
  `172.16`–`172.31`, `192.168.`), a link-local one (`169.254.`), an IPv6 unique-local or link-local
  address, and names ending in `.local`, `.lan`, `.home`, `.home.arpa` or `.internal`, or with no dot
  at all. It's a guess at what macOS will ask about, so it only decides whether to explain. Loopback
  is never local: macOS doesn't ask about it.
- **Once per version:** the version it was shown for is kept in `~/.headlessos/local-network-notice`,
  like `keychain-notice`, because an unsigned build can be asked about again after each update.
- **Not in a browser, and not on Windows or Linux:** the preload bridge offers it only on macOS.

### M17.8 — A blocked connection opens the setting

When a connection fails with `EHOSTUNREACH` on a Mac (the `local-network-access-on-macos` failure from
M15.8), the sign-in card and the **Server disconnected** panel get an **Open Privacy & Security**
button. The main process opens System Settings at
`x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork`. The renderer can only
ask for this one address, never pass one.

Apple doesn't document that address, and calls such schemes unsupported. The button is named for
Privacy & Security, which is still right if macOS doesn't know the Local Network part and opens one
level up, and the hint names Local Network. The owner's Mac test (M17.5) checks where it lands.

### M17.4 — The docs

- The README's Download section and the website's installation page lead with the one command, and
  keep the downloads below it.
- The first-launch steps stay for anyone who downloads from a browser.
- The Local Network section says that an unsigned app can look new after each update: if the switch
  is on and connections still fail, remove the old HeadlessOS entries with **−** (macOS 27.2 and
  later) and allow it again.
- The release notes and the changelog say the same.

The website goes live only when the owner deploys it, and the README changes when this is merged.
Both should wait for the release that carries `SHA256SUMS`, or the commands would fail on the
current one.

## What this can't promise

Only a run on a Mac against a device on the local network can show whether M17.2 fixes issue #9.
TN3179's advice is a signature from an Apple-issued identity, and an ad hoc signature is not that.
Eclectic Light's reading of the same rules is that tracking "may not be reliable" with ad hoc signed
code, while a Developer ID certificate "should work fine".
An ad hoc identity also changes with every version, so macOS can ask about the local network again
after each update. That's the same as the Keychain prompt today. If M17.2 isn't enough, the next
step is a Developer ID from the Apple Developer Program, which costs $99 a year: the owner's
decision.

## As built

- **The scripts, without their install step,** ran against the real release from this PC: the macOS
  one in Git Bash with its macOS check removed, the Windows one through `iex`. Both found v0.3.2 and
  stopped, as it has no `SHA256SUMS`. Neither has run on a release that has one yet.
- **The GitHub API answered 403** during that run (`X-RateLimit-Remaining: 0`), so the Windows script
  reads the redirect too.
- **`sha256sum` in Git Bash marks names with `*`** (binary mode). The release runner's doesn't, but
  both scripts accept either.
- **`--force-run` was dropped.** It would start the app from the installer, and `Start-Process -Wait`
  in Windows PowerShell waits for a process's children too, so the script would hang until the app
  closed.
- **M17.7 and M17.8** are tested in the client (the note comes before the connection, only for a
  local address, and a failed note doesn't stop it; the button only for that failure, only in the Mac
  app) and in the main process (once per version, Mac only, one fixed address, the note marked read
  only after it closes).
- **The release build's macOS checks passed** on a manual run of the branch (2026-11-25). The app is
  `com.headlessos.app`, `Signature=adhoc`, and verifies with `--deep --strict`. The hook gave the main
  program and its four helpers new UUIDs for both slices, the arm64 UUID differs from stock Electron's,
  and the app starts.
- **Not run yet:** the installer under `/S` on a real account (M17.6), and the M17.7 dialog and M17.8
  button on a Mac (M17.5).

## Tasks

| ID | Task | Status |
|----|------|--------|
| M17.1 | Checksums and provenance on every release | ✅ |
| M17.2 | The Mac app gets its own UUIDs and an ad hoc signature, checked in the release build | ✅ |
| M17.3 | One command to install, on macOS and Windows | ✅ |
| M17.4 | The README, the website, the release notes and the changelog | ✅ |
| M17.5 | The owner's Mac reaches a device on the local network with the new build | ⬜ |
| M17.6 | Version 0.3.3, tag it and check the release | ⬜ |
| M17.7 | The app explains the Local Network prompt before macOS shows it | ✅ |
| M17.8 | A blocked connection on a Mac opens the setting | ✅ |

## Checks

- **Unit tests:** the UUID rewrite on thin, universal and 64-bit universal Mach-O files, only those 16
  bytes changed; the hook's choices (platform, `-temp` folders, which files, the `codesign` call);
  the release workflow's sums, attestation and Mac checks; the scripts' guards. The macOS script runs
  on Linux and in Git Bash only to show it stops there.
- **The release build** runs the Mac checks above on the macOS runner.
- **The owner's Mac (M17.5):** install the build on macOS 26 and connect to a device on the local
  network (the dev SSH container on the owner's PC will do). Expect the M17.7 note, then the Local
  Network prompt, and a connection after **Allow**. Then turn HeadlessOS off under Local Network,
  connect again, and press M17.8's button: note whether it opens Local Network or Privacy & Security.
- **After the release (M17.6):** each command on a clean account, then again over an installed copy.
