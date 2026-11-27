# Phase 21 — Raspberry Pi and Small Boards (M21)

> Release 0.7.0. See `docs/ROADMAP.md`. Raspberry Pi owners are already using HeadlessOS (issue #9 is
> a Pi Zero 2 W on DietPi). An agent like Netdata is heavy on these boards, so an app that installs
> nothing suits them. This phase shows what Pi owners check most: power, heat, Wi-Fi and the SD card.

## Why

The problems Pi owners report again and again are a weak power supply (under-voltage and
throttling), heat, Wi-Fi that drops on Zero-class boards, and SD cards that wear out, corrupt, or
remount read-only. Each one has a clear sign that can be read over SSH, and none of them shows on
HeadlessOS's Dashboard today.

## Design

### M21.1 — Know the board

- `/proc/device-tree/model` names the board ("Raspberry Pi Zero 2 W Rev 1.0"). DietPi is detected
  from `/boot/dietpi`, and Raspberry Pi OS from `/etc/os-release`.
- A Pi gets a **Board** card on the Dashboard and its own Server Admin tab. Other boards, and any
  machine with a thermal zone, get the parts that apply.

### M21.2 — Power and throttling

- `vcgencmd get_throttled`, decoded: under-voltage, frequency capped, throttled and soft temperature
  limit, each **now** (bits 0 to 3) and **since boot** (bits 16 to 19).
- Plain words: "The power supply dropped too low since the last boot. Use a 5.1 V supply rated for
  this board."
- With M19, the kernel's under-voltage lines give the times it happened.
- When `vcgencmd` is missing or not allowed (it needs the `video` group), the card says so, and
  falls back to the kernel lines.

### M21.3 — Temperature and clocks

- `vcgencmd measure_temp`, or `/sys/class/thermal/thermal_zone*/temp` elsewhere.
- `vcgencmd measure_clock arm` beside the board's normal speed, so throttling shows as a number.

### M21.4 — Wi-Fi

- `iw dev <if> link` for signal and bitrate, and `iw <if> get power_save`.
- Power save on a Zero 2 W is a common cause of drops. The card says so, and offers a typed action
  that turns it off for this boot, and a way to keep it off (a NetworkManager setting, or a systemd
  unit on DietPi), through write-back.

### M21.5 — The SD card

- **Read-only remounts:** the root filesystem's options in `/proc/mounts`, and the kernel's
  `mmc` and `EXT4-fs error` lines.
- **What the card reports:** `/sys/block/mmcblk0/device/` (name, manufacturer ID, date). microSD
  cards report almost nothing about wear, and the card says that honestly. NVMe and USB SSDs report
  health through `smartctl` when it's installed.
- **Writes:** the bytes written since boot from `/sys/block/*/stat`, and whether logs and swap live
  on the card (with M19.4's check).
- **Backups:** a short guide to imaging the card from this computer, and to testing that the image
  boots. HeadlessOS doesn't image a running card itself.

### M21.6 — `config.txt`

- Read `/boot/firmware/config.txt`, or `/boot/config.txt` on older systems, with its sections
  explained.
- Editing goes through M23's editor with a backup. Overclock lines get a warning.

## Security

- Everything here is read-only except Wi-Fi power save and `config.txt`, which are typed actions
  through write-back.
- `vcgencmd` and `smartctl` are run by name with fixed arguments, never with text from the client.

## What this can't do

- It can't measure an SD card's remaining life, because the cards don't report it.
- It can't see a Pi that has hung. With M22, it can show the last readings before contact was lost.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M21.1 | Detect the board, DietPi and Raspberry Pi OS; the Board card | ⬜ |
| M21.2 | Power and throttling, now and since boot, in plain words | ⬜ |
| M21.3 | Temperature and clock speed | ⬜ |
| M21.4 | Wi-Fi signal and power save, with a fix | ⬜ |
| M21.5 | The SD card: read-only remounts, what it reports, writes, backups guide | ⬜ |
| M21.6 | `config.txt`, read and explained | ⬜ |
| M21.7 | Version 0.7.0, the docs and the release | ⬜ |

## Checks

- Decoder tests for every `get_throttled` bit, and parser tests for `iw` and `/proc/mounts`.
- On a real Pi (Raspberry Pi OS and DietPi): each card, a forced under-voltage reading if the owner
  has a weak supply to hand, and the Wi-Fi fix surviving a reboot.
- On a non-Pi server: the Pi-only parts don't show.
