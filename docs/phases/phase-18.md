# Phase 18 — Updates You Can Trust (M18)

> Release 0.4.0. See `docs/ROADMAP.md`. Checking and installing updates is the most common reason
> people open Cockpit, and HeadlessOS's Packages tab can already update apt packages. This phase
> shows which updates matter, whether the server needs a reboot, and lets the owner pick what to
> install and watch it happen, on every server at once.

## Why

Server Admin → Packages lists upgradable apt packages and can upgrade one or all. It doesn't say
which updates fix security problems, whether a reboot is waiting, which packages are held, or
whether the server already updates itself. It runs the upgrade and returns at the end with no
progress, and it only knows apt.

## Design

### M18.1 — What's waiting, and what matters

- **apt (Debian, Ubuntu, Raspberry Pi OS, DietPi):** `apt-get -s dist-upgrade` with `LC_ALL=C`
  lists each `Inst` line with its source. A source ending in `-security` (`Debian-Security`,
  `jammy-security`) marks a security update. The simulation needs no sudo and changes nothing.
- **dnf (Fedora, RHEL, Rocky, Alma):** `dnf check-update` and `dnf updateinfo list --security`.
- **Others:** pacman (`checkupdates`, if `pacman-contrib` is there) and apk (`apk version -l '<'`)
  are read-only for now, and the tab says so.
- **The list's age:** apt's last refresh time (`/var/lib/apt/periodic/update-success-stamp`, or
  the lists' modification time) is shown, with **Refresh** (`apt-get update`, sudo).
- **Kernel updates** are marked, since they're the ones that need a reboot.
- A deterministic parser for each, with tests from real output (Debian 12, Ubuntu 24.04, Raspberry
  Pi OS, Fedora 41).

### M18.2 — Reboot and restarts

- **Reboot needed:** `/var/run/reboot-required` and `.pkgs` on Debian-family servers;
  `needs-restarting -r` on dnf servers. The tab says which packages asked for it.
- **Services to restart:** `needrestart -b` when it's installed. When it isn't, the tab doesn't
  guess.
- **Reboot** is a typed action with its own confirmation, which names the server, and reconnects
  afterwards.

### M18.3 — Pick and install, and watch it run

- Select packages, all security updates, or everything. Held packages (`apt-mark showhold`, the dnf
  versionlock list) are shown and skipped.
- The install streams over a WebSocket, like Docker's install output (`/ws/docker-install`), so the
  owner sees each line, and runs with `DEBIAN_FRONTEND=noninteractive` and the old config files kept
  (`--force-confold`).
- **Before starting**, it checks for another package manager holding the lock (`fuser` on the dpkg
  lock, or a running `unattended-upgrade`) and says so, instead of failing halfway.
- Package names are validated (`validatePackageName`) and passed as argv. Each run is written to
  the action audit log.

### M18.4 — Updates on their own

- Shows whether unattended-upgrades (`/etc/apt/apt.conf.d/20auto-upgrades`) or dnf-automatic is set
  up, and when it last ran.
- **Turning it on** is a typed action. It writes that one file through write-back (backup, check
  with `apt-config dump`, rollback), and installs the package only after asking.

### M18.5 — Every server at a glance

- Fleet gets an Updates column: the number waiting, how many are security fixes, and whether a reboot
  is needed. The check runs when Fleet opens and refreshes no more than once an hour per server.
- The AI Agent gets `updates.list` (read) and `updates.install` (write, approved) as typed actions in
  `agent/actions/catalog/`.

## Security

- Listing is read-only and needs no sudo, except Refresh.
- Install, Refresh, Reboot and turning on automatic updates are typed actions with sudo asked per
  action. No command text comes from the client or the agent.
- An install never removes packages without saying so: if the simulation shows `Remv` lines, they're
  listed and need their own confirmation.

## What this can't do

- It can't say whether an update is safe for a particular server. It shows the source and the
  changelog link when apt has one (`apt-get changelog`), and the owner decides.
- pacman and apk servers get a read-only list in this phase.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M18.1 | What's waiting: apt and dnf, with security and kernel updates marked, and the list's age | ⬜ |
| M18.2 | Reboot needed, services to restart, and a reboot action | ⬜ |
| M18.3 | Pick and install, streamed, with the lock check and held packages | ⬜ |
| M18.4 | Automatic updates: status, and turning them on | ⬜ |
| M18.5 | Updates in Fleet, and typed actions for the agents | ⬜ |
| M18.6 | Version 0.4.0, the docs and the release | ⬜ |

## Checks

- Parser tests from real output of each distribution above, including a held package, a `Remv`
  line and an empty list.
- On the dev SSH container and a Raspberry Pi OS image: list, install one package, see the stream,
  and the reboot flag after a kernel update.
- In the packaged app (Windows and macOS): the stream opens, which is M17.13's lesson.
