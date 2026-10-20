# Phase EX7 — Container Target Mode (Experimental)

> Treat a running Docker container as a target: browse, view, create, edit, upload,
> rename and delete files **inside the container's filesystem**, plus open a shell
> **inside the container** — all from the Docker app, without the container needing SSH.

## Problem

HeadlessOS connects to a host over SSH. The Files app uses **SFTP**, which only sees
the SSH host's filesystem — it cannot reach inside a container's isolated filesystem.
So "give me a UI for the files inside my app container" was impossible out of the box.

## Approach (ADR)

Route container file operations through **`docker exec`** on the already-connected host
(the host's `docker` CLI talks to its daemon). No direct Docker-socket/TCP exposure — the
app stays SSH-only, consistent with the zero-server-install model.

- **List:** `docker exec <id> ls -lA <path>` → `parseContainerLs` → `FileEntry[]`.
- **Read / download:** `docker exec <id> base64 <path>` → decode (binary-safe).
- **Write / upload:** `echo <base64> | docker exec -i <id> sh -c 'base64 -d > <path>'`
  (content never touches the command line un-encoded; base64 is `[A-Za-z0-9+/=]` only).
- **mkdir / rename / delete:** `docker exec <id> mkdir -p|mv|rm -rf <path>`.
- **Shell:** `/ws/terminal/:serverId?container=<id>` execs `docker exec -it <id> sh`.

**Security:** container ids validated as hex (`validateContainerId`); every path
normalized + checked (`validateAndSanitizePath`); every interpolation `shellEscape`d;
nested `sh -c` double-escaped. Commands are built server-side (never from the client),
so they bypass the dynamic-ui/agent allowlist by the same rule as `routes/docker.ts`.
2 MB cap on reads/writes through the exec path.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| EX7.1 | `parseContainerLs` parser (busybox + GNU `ls -lA`) + tests | ✅ |
| EX7.2 | `routes/container-files.ts` — list/read/write/mkdir/rename/delete/upload/download via `docker exec` | ✅ |
| EX7.3 | Register route; wire auto-reconnect (covered by `docker` url prefix) | ✅ |
| EX7.4 | Terminal `?container=` → `docker exec -it <id> sh` | ✅ |
| EX7.5 | API client (`listContainerFiles`, `readContainerFile`, … , `containerDownloadUrl`) | ✅ |
| EX7.6 | `ContainerFilesView` — visual file manager (browse/edit/create/upload/rename/delete) | ✅ |
| EX7.7 | `WindowManager` cases `container-files` / `container-shell`; `TerminalView` container prop | ✅ |
| EX7.8 | Docker app context menu: "Open Files" / "Open Shell" per running container | ✅ |
| EX7.9 | Tests (parser + write-command injection safety) + live verification against real containers | ✅ |

## Verification

Live-tested against real containers (`searxng-core`): list `/etc/searxng`, read
`settings.yml`, write a file with quotes/`;`/newlines (confirmed written **literally**,
not executed, via independent `docker exec cat`), mkdir, delete. UI verified with
Playwright: Docker → right-click container → Open Files → browse `/etc/searxng` → open
`settings.yml` in the editor.

## Not in scope (follow-ups)

- Streaming very large files (current cap 2 MB; use `docker cp` staging for bigger).
- Drag-and-drop upload; copy/move across directories; file search inside a container.
- A top-level "containers as servers" picker (today you enter via the Docker app).
