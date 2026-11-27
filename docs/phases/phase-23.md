# Phase 23 — Files for Config Work (M23)

> Release 0.9.0. See `docs/ROADMAP.md`. HeadlessOS began as a way to change a file on a server
> without `nano`. Most config files are owned by root, though, and Files can't save them yet. This
> phase edits root-owned files safely (a diff, a backup and a check before anything is saved) and
> adds the file tools people still use a terminal for.

## Why

Editing config files is the task people say they still do in a terminal, even with Cockpit, whose
file browser can't move files or select several. HeadlessOS's editor saves through SFTP as the
signed-in user, so `/etc/nginx/...` or `/etc/ssh/sshd_config.d/...` can't be saved. The agents'
write-back (`agent/writeback.ts`) already does backup, check and rollback, but the editor doesn't use
it.

## Design

### M23.1 — Edit as root, safely

- Opening a file the user can't write offers **Edit with sudo**. It reads with `sudo cat`, and on
  save:
  1. shows a diff of the changes,
  2. writes a temporary file over SFTP,
  3. backs up the original next to it with a timestamp, or under `~/.headlessos-backups/` on the
     server when the folder isn't writable,
  4. moves the new file into place with `sudo install`, keeping the owner, group and mode,
  5. runs the check for that kind of file, and restores the backup if it fails.
- **Checks by path:** nginx `nginx -t`, sshd `sshd -t`, sudoers `visudo -cf`, systemd units
  `systemd-analyze verify`, crontabs, JSON and YAML parsed locally, `config.txt` (M21.6).
- After a change to a service's config, it offers to reload that service.
- All of this goes through `writeback.ts`, so the agents and the editor share one path.

### M23.2 — History and undo

- Each server keeps a list of the edits made from HeadlessOS: file, time, diff, and **Restore**
  from its backup.
- Old backups are cleaned up after 30 days, or when the owner clears them.

### M23.3 — Permissions and owners

- A **Permissions** panel: owner, group and mode, as checkboxes and as octal.
- `chmod` and `chown` are typed actions, with recursive changes confirmed separately.

### M23.4 — Archives

- Compress to `.tar.gz` or `.zip`, and extract either, using `tar`, `zip` and `unzip` when they're
  on the server. Files says which tool is missing instead of failing.
- Extracting refuses entries with absolute paths or `..` before it starts.

### M23.5 — Working with many files

- Multi-select, move, copy and delete across folders. Drag and drop between two Files windows on
  the same server.
- **Open a terminal here** opens the Terminal in the current folder.
- Large copies show progress and can be cancelled.

## Security

- Paths go through `validateAndSanitizePath`. Edits to files the write-back denylist covers
  (`.ssh/`, `authorized_keys`, shell rc files, `sudoers`) need a second confirmation, and SSH files
  are left to M25's guarded flow.
- sudo is asked per save, never stored.

## What this can't do

- It can't check every file type. An unknown file is saved with a backup, and the diff says no check
  ran.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M23.1 | Edit as root: diff, backup, install, check by path, rollback, reload | ⬜ |
| M23.2 | Edit history with restore, and backup cleanup | ⬜ |
| M23.3 | Permissions and owners | ⬜ |
| M23.4 | Archives: compress and extract safely | ⬜ |
| M23.5 | Multi-select, move and copy, open a terminal here, progress | ⬜ |
| M23.6 | Version 0.9.0, the docs and the release | ⬜ |

## Checks

- Tests: each check by path, a failed check restoring the original, mode and owner kept, an archive
  with `..` refused.
- On the dev container: break an nginx config on purpose and see it restored; edit `sshd_config.d`
  and keep the session.
