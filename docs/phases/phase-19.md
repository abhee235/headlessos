# Phase 19 — Logs That Answer "What Happened?" (M19)

> Release 0.5.0. See `docs/ROADMAP.md`. The journal view is the Cockpit feature people call most
> useful. HeadlessOS's Logs tab can already filter by service, priority, time and text. This phase
> follows logs live, looks at earlier boots, explains why a server rebooted, and warns when the
> server doesn't keep its logs.

## Why

When a server misbehaves, the first question is what happened and when. Today the Logs tab shows a
snapshot. It can't follow new lines, can't look at the boot before a crash, and doesn't know that
on DietPi, and on any system with a volatile journal, the logs from before a reboot are already gone.

## Design

### M19.1 — Follow live

- **Follow** streams `journalctl -f -o json` with the same filters over a WebSocket, and stops when
  the window closes or the filters change, so nothing keeps running on the server.
- Without systemd (some containers, Alpine), it follows a chosen file under `/var/log` with
  `tail -F`, picked from a list the server reports, never a typed path.
- Lines are colored by priority, and bursts are batched so a noisy service doesn't freeze the window.

### M19.2 — Earlier boots

- `journalctl --list-boots -o json` fills a boot picker, and any filter can run on one boot.
- **How the last boot ended:** the last lines of the previous boot, and whether it shut down cleanly
  (a `systemd-shutdown` line) or stopped suddenly, as after a power cut or crash.

### M19.3 — Why did it reboot, or stop responding?

One page that collects the usual suspects from the current and previous boot, each with its lines:

- Out of memory: the kernel's OOM-killer lines, and the process it killed.
- Power: under-voltage lines on a Raspberry Pi (M21 adds the live state).
- Disk: I/O errors, and a filesystem remounted read-only.
- Kernel panics and watchdog resets, when the journal kept them.
- Reboots and shutdowns from `last -x`, with who asked, when the record exists.

### M19.4 — Logs that don't survive a reboot

- **Detect it:** no `/var/log/journal`, or `Storage=volatile` in `journald.conf` and its drop-ins,
  or DietPi-RAMlog (`/var/tmp/dietpi/logs`, the `dietpi-ramlog` service).
- **Say it** where it matters: "This server keeps logs in memory. Logs from before the last reboot
  are gone." On DietPi, mode 2 keeps copies under `/var/tmp/dietpi/logs/dietpi-ramlog_store`, and
  the tab reads them.
- **Offer to keep them:** on systemd, a drop-in that sets `Storage=persistent` with a size limit
  (`SystemMaxUse=`), written through write-back. On DietPi, it explains DietPi's own setting rather
  than changing RAMlog itself. On an SD card, it says that keeping logs means more writes.

### M19.5 — Save and share

- Saved filters per server ("nginx errors today").
- **Export** the visible lines to a file, after M16.12's redaction, so a log pasted into an issue
  doesn't carry addresses or names.
- The AI Agent gets `logs.query` and `logs.boots` as typed read actions, with result caps.

## Security

- Reading the journal may need the `systemd-journal` or `adm` group, or sudo. The tab says which and
  asks for sudo per action instead of failing silently.
- Follow runs as a child of the SSH session and ends with it.
- Turning on persistent logs is the only write, through write-back with `systemd-analyze cat-config`
  as the check.

## What this can't do

- It can't recover logs a server never kept. It can only say so, and prevent it next time.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M19.1 | Follow live, with a file fallback without systemd | ⬜ |
| M19.2 | Earlier boots, and how the last one ended | ⬜ |
| M19.3 | Why did it reboot: OOM, power, disk, panics, reboot records | ⬜ |
| M19.4 | Detect logs that don't survive a reboot, read DietPi's copies, offer to keep them | ⬜ |
| M19.5 | Saved filters, redacted export, typed actions for the agents | ⬜ |
| M19.6 | Version 0.5.0, the docs and the release | ⬜ |

## Checks

- Parser tests for `--list-boots`, OOM-killer lines, under-voltage lines and `last -x`.
- On the dev container and a DietPi image: follow, a previous boot, and the volatile-log warning.
- In the packaged app: Follow streams (a WebSocket, like M17.13's Terminal).
