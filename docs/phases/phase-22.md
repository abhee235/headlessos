# Phase 22 — Health Over Time, and Warnings (M22)

> Release 0.8.0. See `docs/ROADMAP.md`. Cockpit needs PCP installed for history, and Netdata runs an
> agent on every host. This phase keeps a server's history on the owner's computer, from readings
> taken over SSH while HeadlessOS runs, and warns before a disk fills up, a service stays failed, or
> a certificate expires.

## Why

The Dashboard shows the present. Most server trouble builds up slowly (a disk filling over weeks, a
certificate a week from expiry, memory creeping up), and the owner only finds out when something
breaks. People ask for low-disk warnings and certificate expiry alerts, because renewals fail without
telling anyone.

## Design

### M22.1 — Readings while the app runs

- The backend samples each connected server once a minute: CPU, memory, swap, load, disk use per
  mount, network bytes, temperature (M21) and failed units, in one combined command, so a reading
  costs one round trip.
- Sampling pauses when the app is quit, and the gap is shown as a gap, not a flat line. HeadlessOS
  doesn't pretend to have watched while it was closed.
- Readings use the existing parsers and are typed like any other data.

### M22.2 — Stored on this computer

- `~/.headlessos/metrics/<server id>/`, in compact files with rollups: every minute for two days,
  every 15 minutes for 90 days, hourly beyond. A size cap per server, shown in Settings, with
  **Clear history**.
- Nothing is sent anywhere. Deleting a server deletes its history.

### M22.3 — Charts

- Dashboard and Task Manager get time ranges (hour, day, week, month), from stored readings.
- Fleet gets a sparkline per server.
- Charts follow the dataviz rules: one axis, a table view, and color that isn't the only signal.

### M22.4 — Warnings

Rules with sensible defaults, each one can be turned off:

- **Disk filling:** above 90%, or projected full within 7 days from the last two weeks' trend.
- **Failed services:** a unit that has been failed for more than 10 minutes.
- **Certificates:** expiring within 21 days. Found from `/etc/letsencrypt/live/*/cert.pem` (with sudo,
  as `openssl x509 -enddate`) and from the TLS ports M20.1 found, checked with `openssl s_client`
  on the server itself.
- **Memory:** swap use climbing, and OOM kills (M19.3).
- **Raspberry Pi:** under-voltage or throttling since the last reading (M21).
- **Unreachable:** a server that stops answering, with the time of its last good reading.

Warnings show on the server's card, in Fleet and in Notifications. The desktop app can show a system
notification, off by default.

### M22.5 — Keep watching while the window is closed (optional)

- The desktop app can stay in the system tray and keep sampling, off by default, so warnings
  arrive while the owner works elsewhere. Quitting from the tray stops it completely.

## Security

- Sampling is read-only. sudo is only used for the certificate files, and only when the owner turns
  that rule on.
- History never leaves `~/.headlessos/`, and the redacted log (M16.12) never includes readings.

## What this can't do

- It can't watch a server while this computer is off or asleep. For round-the-clock alerting, people
  still need something that runs elsewhere, and the docs say so plainly.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M22.1 | One combined reading a minute per connected server | ⬜ |
| M22.2 | Storage with rollups and a size cap, in `~/.headlessos/metrics/` | ⬜ |
| M22.3 | Charts in Dashboard, Task Manager and Fleet | ⬜ |
| M22.4 | Warnings: disk, failed units, certificates, memory, Pi power, unreachable | ⬜ |
| M22.5 | Optional tray mode that keeps sampling | ⬜ |
| M22.6 | Version 0.8.0, the docs and the release | ⬜ |

## Checks

- Tests for the rollups, the size cap, the trend projection and each warning rule.
- A week of readings from the dev container shown correctly across a restart of the app.
- The cost of a reading on a Pi Zero 2 W: CPU time and bytes, written down here before release.
