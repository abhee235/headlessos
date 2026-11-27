# Phase 24 — Docker Compose Stacks (M24)

> Release 0.10.0. See `docs/ROADMAP.md`. Most self-hosted apps are run with Docker Compose. Cockpit
> manages Podman only, Portainer puts access control and audit logs in its paid edition, and people
> say they still use the terminal for Compose. HeadlessOS's Docker app shows containers and images.
> This phase adds the stacks they belong to.

## Why

A self-hoster thinks in apps ("Immich", "Nextcloud"), and each one is a Compose project of several
containers. Today HeadlessOS shows the containers one by one, and changing a stack still means
editing `compose.yaml` in a terminal and running `docker compose up -d`.

## Design

### M24.1 — See the stacks

- `docker compose ls --all --format json` lists projects, with their status and config files. Each
  stack shows its containers, ports (linked to M20's tunnels), volumes and networks.
- Older servers with `docker-compose` v1 are read where possible, and the app says v2 is needed for
  changes.

### M24.2 — Run them

- **Up**, **Down**, **Restart**, **Pull** and **Recreate**, as typed actions on a project name and
  file path that come from M24.1's list. Output streams like M18.3's.
- **Down** keeps volumes. Removing volumes is a separate action, with the volume names shown.

### M24.3 — Edit them

- Open `compose.yaml` and its `.env` in M23's editor. Before saving, `docker compose config` checks
  the result, and the diff shows what changes.
- After saving, it offers **Up** to apply the change.
- `.env` values that look like secrets are hidden until shown.

### M24.4 — Image updates

- For each service, compare the running image's digest with the registry's, using
  `docker compose pull --dry-run` where supported, otherwise `docker manifest inspect`.
- Show which stacks have newer images, with **Pull and recreate**. Nothing updates on its own.

### M24.5 — Podman

- When the server has Podman and not Docker, the Docker app reads containers and pods through
  Podman's Docker-compatible commands, read-only in this phase.

## Security

- Project names and file paths come from the server's own list, never typed by the client or agent.
- The agents get `compose.list` (read) and `compose.up`, `compose.pull` (write, approved).
- `.env` secrets never go to the AI unless the owner shows them, and never to the log.

## What this can't do

- It doesn't manage Kubernetes or Swarm, and doesn't create stacks from templates in this phase.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M24.1 | List stacks with their containers, ports, volumes and networks | ⬜ |
| M24.2 | Up, Down, Restart, Pull, Recreate, streamed | ⬜ |
| M24.3 | Edit `compose.yaml` and `.env` with a check and a diff | ⬜ |
| M24.4 | Image updates per stack | ⬜ |
| M24.5 | Podman, read-only | ⬜ |
| M24.6 | Version 0.10.0, the docs and the release | ⬜ |

## Checks

- Parser tests for `compose ls`, `compose ps` and `config` errors.
- On the dev container (Docker installed): a two-service stack edited, broken on purpose and refused,
  updated and recreated.
