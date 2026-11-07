# Phase 16 — Saved Secrets in the OS Keychain (M16)

> Moves the install secret into the OS keychain on every platform. It adds protection and replaces
> nothing that works: a backup taken before this phase must still restore.

## Why

Saved passwords, SSH keys and AI keys are encrypted, but `enc-key`, the secret that opens them, sits
beside them in `~/.headlessos` as plain text. HeadlessOS is open source, so anyone can see where it
is. A program a user is tricked into installing can read both files and decrypt every login, and so
can anything holding a copy of the folder.

Being open source doesn't cause this, because a closed app can be taken apart too. It only means the
protection can't depend on the location being unknown. It has to come from something the file
doesn't contain.

## What it protects, by platform

| Threat | macOS | Windows | Linux, with a secret store | Linux, without one |
| --- | --- | --- | --- | --- |
| A copy of the folder alone | Protected | Protected | Protected | Not protected |
| Another account on the computer | Protected | Protected | Protected | Not protected |
| A program running as you | **Protected:** the Keychain asks, naming the program | **Not protected** | **Not protected** | Not protected |

The third row is the attack above. Electron's own documentation gives this split: Keychain access
keeps out other apps in the same userspace, while DPAPI and the Linux stores don't. On Windows and
Linux, a program running as you can ask the OS to decrypt, and no app can change that. `SECURITY.md`
must say so, and must not imply more.

A master password typed at startup would close that row on all three, because the secret would not
be on the computer at all. That is a separate decision for later, not part of this phase.

## Design

### Only the install secret moves

The keychain holds one thing. Every `enc:v2:` value stays as it is, so nothing is re-encrypted, there
is no per-secret migration to get wrong, and putting a plain `enc-key` back undoes the change.

`safeStorage` runs only in the main process, and the backend is a utility process, so
`electron/keychain.js` opens the secret and hands it over in `HEADLESSOS_INSTALL_SECRET`.
`getInstallSecret()` reads that first and removes it from `process.env`.

### At startup

1. **`enc-key` exists:** use it. If the keychain is usable, write `enc-key.keychain`, read it back to
   prove it opens, then remove `enc-key`. A plain file always wins, so a restored backup works and
   `RESTORE.txt` stays true.
2. **Only `enc-key.keychain` exists:** open it. If that fails, logins are **locked**.
3. **Neither exists:** a new install. Make a secret and store it as in step 1.
4. **The keychain isn't usable, with nothing stored in it:** stay on the plain file. On Linux,
   `basic_text` counts as not usable: `safeStorage` would use a hardcoded password, which only looks
   like protection.

### Locked is not lost

Nothing may turn a locked state into a real loss:

- **M16.1:** `getInstallSecret()` used to make a new secret when it found none. With
  `enc-key.keychain` present, that would orphan every saved login, and step 1 would then overwrite
  the keychain copy. It now throws `LoginsLockedError`.
- **M16.1:** `ConfigStore` keeps a stored value it can't open and writes it back untouched. M15.12
  dropped it at the next save. A new password can't be encrypted while locked, so that save fails
  and is rolled back.
- **M16.4:** a locked key server must not say "remove this server and add it again". The connect
  route checks for locked first, and `keyLost` stays false. Typing a password at sign-in still works.

### macOS explains the prompt first

The build is unsigned, so macOS can't tell that a new version is the same app, and the Keychain asks
again after each update. Electron's documentation confirms this. It's the cost of protecting Macs,
and the owner accepts it, provided the app explains itself.

Before opening the keychain, the first time and once after each new version, a dialog says why the
prompt is coming, to click **Always Allow**, and that it's normal after an update. It also says to
click **Deny** if any other app ever asks for the same item, because that is the attack this stops.

### The dev server

`npm run dev` has no Electron, so it can't reach the keychain, and it shares `~/.headlessos` with the
desktop app. Only someone running both on one computer is affected. They add
`HEADLESSOS_INSTALL_SECRET` to their private `.env`. Someone who only runs from source never gets a
keychain file, and nothing changes for them. The app's own data folder isn't split: 11 changes for
one person's setup isn't worth it.

### The app's name (M16.6)

Electron names the Keychain item after the app. `electron/package.json` had `productName` only under
`build`, which names the bundle, so inside the app the name was `headlessos-desktop`. The first Mac
run showed it: the item was `headlessos-desktop Safe Storage` and the notice said the same, while
`SECURITY.md` tells people to look for `HeadlessOS Safe Storage`. The notice asks people to deny any
other app, so the name has to be one they recognise.

- `productName` goes at the top level of `electron/package.json`. `name` stays: it names the Linux
  package.
- That name also picks the folder for the window's data: theme, preferences and sessions.
  `main.js` pins `userData` to `headlessos-desktop` so an update keeps them.
- It has to ship with M16. Later, a new name would mean a different Keychain item, and every Mac's
  logins would lock. No release has the keychain yet, so nobody is affected. A Mac that ran an
  earlier M16 build needs a plain `enc-key` put back once.

### A scratch profile holds everything (M16.9)

Pinning `userData` in M16.6 also overrode `--user-data-dir`, the flag phase 14 uses to keep a test run
away from real data, and only partly. Measured on Windows, `Local State` followed the flag while the
window's data went to the pinned folder, so a scratch profile split in two.

`main.js` now pins the folder only when the flag isn't given. Skipping the pin also skips
`app.getPath('appData')`, which throws on a scratch `USERPROFILE` with no `AppData\Roaming`. There the
app stopped at its first lines behind an error dialog, and a test run could only hang. Real accounts
always have that folder, and a new install isn't affected: `setPath` accepts a folder that doesn't
exist yet, and Electron creates it.

### Version 0.3.0 (M16.7)

0.3.0, because this adds a feature people will notice: a Mac asks for a password, once after each
update, until the build is signed. The version goes in every `package.json`, `server/src/index.ts`,
the About page, `Desktop.tsx` and both lockfiles' own entries, and `CHANGELOG.md` gets a dated entry.
The README and the release notes say what to click when macOS asks, because neither did. The README
also stops saying Linux has no build: 0.2.1 shipped one.

### Version 0.3.1 (M16.10)

0.3.1 ships what came after the 0.3.0 tag: EX8.32, EX8.33 and M16.9. None of it changes stored data,
so a patch version fits. The version goes where M16.7 lists, and only our own entries in the lockfiles.

### Backups after this phase

On Windows the key that opens `enc-key.keychain` lives in the app's user data folder, not in
`~/.headlessos`, so a copy of `~/.headlessos` alone won't open. That is the point. It also means
removing the app's data can lock logins for good, with only retyping them as the way back, unless a
plain `enc-key` was kept. The docs say so.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M16.1 | Locked is not lost: no new secret, and stored values are kept | ✅ |
| M16.2 | The desktop app keeps the install secret in the OS keychain | ✅ |
| M16.3 | macOS explains the prompt before it appears | ✅ |
| M16.4 | Locked logins say so, and Settings shows where the secret is held | ✅ |
| M16.5 | `SECURITY.md`, the docs and the changelog | ✅ |
| M16.6 | The app is named HeadlessOS, and its data stays put | ✅ |
| M16.7 | Version 0.3.0, the changelog and the Mac notes | ✅ |
| M16.8 | Tag v0.3.0 and check the release | ✅ |
| M16.9 | `--user-data-dir` holds all of the app's data again | ✅ |
| M16.10 | Version 0.3.1 and the changelog | ⬜ |
| M16.11 | Tag v0.3.1 and check the release | ⬜ |

## Checks

- **Unit tests:** each startup path; `basic_text` stays on the plain file; a failed read-back keeps
  `enc-key`; a plain file wins over a stored one; a locked secret survives a save; no new secret is
  made while locked; the prompt note appears once per version, on macOS only.
- **Packaged Windows build,** on a **copy** of `servers.json` and `enc-key` from the owner's backup,
  never the live folder, and never connecting to a real server. The logins still open after
  `enc-key` moves, the folder alone doesn't open with another app profile, nothing is lost while
  locked, and a plain `enc-key` put back restores everything.
- **macOS, by the owner:** the dialog, the prompt, Always Allow, and Deny.
- **Linux:** a desktop with a secret store, and one without.

## As built

**Packaged Windows build** on the real OS keychain, with a copy of `servers.json` and `enc-key` from
the owner's backup, in a test home that was deleted afterwards. No real server was contacted.

1. **Upgrade:** `enc-key` moved to `enc-key.keychain` and was removed. The new file doesn't contain
   the secret, `servers.json` didn't change by a byte, and the SSH key server opened (`keyLost` false).
2. **Restart:** a saved password signed in with the field left blank.
3. **The folder with another app profile,** which is what a stolen copy looks like: logins locked,
   with the card. All three servers listed, a typed password still signed in, and a new saved one
   was refused with the list unchanged. `servers.json` was byte-identical, and no new secret was made.
4. **Restore:** a plain `enc-key` put back won. It moved into the keychain, and everything opened.

The secret never reached the log. The log's filter masked the first wording of the status line
(`install secret: ...`), so it now reads `saved logins: keychain`.

**macOS 26.5.2 on Apple Silicon,** with a local unsigned arm64 build on the owner's real folder,
after a verified backup:

1. **Upgrade:** the notice appeared, `enc-key` moved to `enc-key.keychain` and was removed, and
   `servers.json` stayed byte-identical. The key is in neither the new file nor the log.
2. **Restart:** three restarts in a row read `saved logins: keychain`, with nothing locked.
3. **The name:** the first run made `headlessos-desktop Safe Storage`, which is M16.6. After the fix
   the item is `HeadlessOS Safe Storage`, no new data folder appears, and saved preferences load.
4. **Restore:** the fix can't open a secret stored under the old name, so a plain `enc-key` from the
   backup was put back. It won and moved into the new item.

The second launch changes the item's account from `HeadlessOS` to `HeadlessOS Key`, once. Logins kept
opening, and other Electron apps on the same Mac show the same `Key` account.

**The 0.3.0 draft,** the universal DMG, over that build on the same Mac: the notice appeared again for
the new version, the owner clicked Always Allow, and a restart opened in a second with no prompt.
`cognito-web` signed in with its saved key and no connect failures. Servers and preferences carried
over. The owner reports the Mac tests working; the log can't confirm Deny, so that rests on the report.

**Not run:** Linux, and Gatekeeper on the 0.3.0 file, because `gh` downloads carry no quarantine flag.

v0.3.0 was published on 2026-11-07 from the DMG that was tested, and all six files are there.