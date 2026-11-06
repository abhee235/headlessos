# Phase 16 — Saved Secrets in the OS Keychain (M16)

> **Status: proposed.** The spec is written, and two decisions are the owner's (see below). No code
> until they're made. It adds protection, and replaces nothing that works: a backup taken before
> this phase must still restore.

## Why

Saved passwords, SSH keys and AI keys are encrypted, but `enc-key`, the secret that opens them, sits
beside them in `~/.headlessos` as plain text. Anyone with a copy of that folder can read everything:
an old backup, a synced folder, a disk image, another account on the computer. ADR-028 named the OS
keychain as the real fix.

## What it does and doesn't protect

- **Protects:** a copy of the folder on its own, which no longer opens anywhere else.
- **Doesn't protect:** code running as you. On Windows, any program running as your user can ask the
  OS to decrypt, and that isn't something an app can change. `SECURITY.md` must say so.

## Design

### Only `enc-key` moves

The keychain holds one thing: the install secret. Every `enc:v2:` value stays exactly as it is.

- Nothing needs re-encrypting, so there is no per-secret migration to get wrong.
- Rolling back means putting the plain `enc-key` back.
- The saved-secret stores don't change.

Electron's `safeStorage` does the work: DPAPI on Windows, Keychain on macOS, libsecret or KWallet on
Linux. It runs only in the main process, and the backend is a utility process, so the main process
opens the secret and hands it over.

### At startup, in the main process

1. **`enc-key` exists:** use it. If the keychain is usable, write `enc-key.keychain`, read it back to
   prove it opens, then remove `enc-key`. A restored backup takes this path, so `RESTORE.txt` stays
   true.
2. **Only `enc-key.keychain` exists:** open it with `safeStorage`.
3. **Neither exists:** a new install. Make the secret, and store it as in step 1.
4. **The keychain isn't usable:** stay on the plain `enc-key`, and say so in Settings. This covers
   Linux with no secret store, where `getSelectedStorageBackend()` returns `basic_text`. `safeStorage`
   then uses a hardcoded password, which would only look like protection.

The secret reaches the backend as `HEADLESSOS_INSTALL_SECRET`. `getInstallSecret()` reads it first
and removes it from `process.env`, so nothing the backend starts inherits it.

### A secret that can't be opened is kept, not dropped

M15.12 keeps the server but drops an unreadable secret at the next save. With a keychain, a refused
prompt must not cost anyone their logins. `ConfigStore` and the AI settings keep the stored value as
it is and write it back untouched, until it can be read again. The window shows that logins are
locked, with what to do, on a `ProblemCard`.

### The dev server

`npm run dev` has no Electron, so it can't reach the keychain, and today it shares `~/.headlessos`
with the desktop app. Once the desktop app removes `enc-key`, a dev server on the same computer
can't open anything. See decision 2.

## Decisions for the owner

### 1. macOS, while the build is unsigned

macOS ties Keychain access to an app's code signature. Reports suggest an unsigned Electron app is
asked for the Keychain password again after each update, and that "Always Allow" doesn't carry over.
That part is reported, not confirmed for our build, and needs testing on the Mac. Someone who clicks
Deny has locked logins until they allow it.

- **A. Windows and Linux now, macOS once the build is signed.** No prompts and nothing to go wrong on
  a Mac, but Macs stay on the plain file. Signing needs an Apple Developer account.
- **B. All three now.** Macs are protected too, and a Mac user may see a password prompt on every
  update, on top of Open Anyway.

**Recommended: A,** after a quick test on the Mac to see what actually happens.

### 2. The dev server's data

- **A. Separate folders.** A single `HEADLESSOS_HOME` setting replaces the 11 places that build the
  path, and `npm run dev` uses `~/.headlessos-dev`, with its own plain `enc-key`. The desktop app and
  the dev server stop sharing anything, which also rules out the M15.18 incident, where a dev server
  changed the desktop app's data. The first dev run starts empty, and the owner's servers can be
  copied in from the backup.
- **B. Keep sharing.** Dev opens nothing while the desktop app holds the secret.

**Recommended: A.**

## Tasks

| ID | Task | Status |
|----|------|--------|
| M16.1 | One setting for the data folder, and a separate one for dev | ⬜ |
| M16.2 | A secret that can't be opened is kept, not dropped | ⬜ |
| M16.3 | The main process keeps the install secret in the OS keychain | ⬜ |
| M16.4 | Locked logins say so, and Settings shows where the secret is held | ⬜ |
| M16.5 | `SECURITY.md`, the docs, `RESTORE.txt` and the changelog | ⬜ |

## Checks

- **Unit tests:** each startup path; `basic_text` stays on the plain file; a failed read-back keeps
  `enc-key`; a locked secret survives a save.
- **Packaged Windows build:** against a **copy** of the owner's backup, never the live folder. The
  logins still open after `enc-key` moves, a copy of the folder doesn't open on its own, and putting
  the plain `enc-key` back restores it.
- **macOS:** decision 1's test, and a refused prompt.
- **Linux:** a desktop with a secret store, and one without.
