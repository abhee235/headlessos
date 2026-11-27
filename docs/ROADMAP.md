# Roadmap — Phases 18 to 25

> Written 2026-11-28, after v0.3.4. HeadlessOS ranks first for its name on Google and shows up in
> Google's AI Mode, so more people are trying it than before. This page says what to build next, in
> what order, and why: one phase per release, each specced in `docs/phases/phase-{n}.md` before any
> code (AGENTS.md).

## Where HeadlessOS stands

HeadlessOS started from one daily annoyance: to see what a server was doing, or to change one file,
you had to SSH in and use `nano`. It solved that with a desktop that runs on your own computer and
reaches the server over plain SSH.

**What it has today:** Dashboard, Files, Terminal, Task Manager, Docker, Services, and Server Admin
(users, firewall, network, logs, packages, storage, cron, nginx, fail2ban, sessions), across many
servers (Fleet), plus the AI Agent and UI Agent, which only run typed actions (ADR-024).

**What sets it apart, and what every new phase must keep:**

| | HeadlessOS | Cockpit | Webmin | Portainer / Netdata |
| --- | --- | --- | --- | --- |
| On the server | Nothing beyond SSH | The Cockpit packages and a web service on port 9090. Cockpit Client (the desktop app) needs only Python, but only for the pages it bundles | A Perl web service on port 10000 | An agent or container on each host |
| Open ports | None | 9090, unless only Cockpit Client is used | 10000 | The agent's port |
| Many servers | From one window | Multi-host mode, described as deprecated | One server per install | Yes, through the agent |
| AI | Typed actions only, approved by you | No | No | No |

Nothing installed means nothing to patch on the server and no panel to leave open by mistake. The
most common objection to Cockpit and Webmin in the threads below is that very panel. Webmin's 2019
release was shipped with a backdoor (CVE-2019-15107) that gave root to anyone who could reach it.

## What people asked for

Three research passes, 2026-11-28, from Hacker News threads, LWN, forums, vendor pages and project
docs. They came from search summaries more than whole pages, so treat details as leads. The order
below is how often a need came up and how much it hurts.

| Need | Evidence | Phase |
| --- | --- | --- |
| Reach the server, and the web apps on it, without opening a port | The top objection to Cockpit and Webmin is the exposed panel; people reach for VPNs and SSH tunnels (HN, 2023 and 2026). Termius, XPipe, MobaXterm and Royal TSX all manage tunnels | M20 |
| See and control updates | Choosing updates and seeing their status (HN 2026); Cockpit shows updates on its overview (LWN) | M18 |
| Logs that explain what happened | The journal view is the Cockpit feature people call most useful (HN 2026). On DietPi, logs live in RAM and are gone after a crash (DietPi docs and forum) | M19 |
| Raspberry Pi health | Under-voltage and throttling (`vcgencmd get_throttled`) are what Pi owners watch most; Pi-hole users asked for an under-voltage warning. Pi Zero 2 W boards drop Wi-Fi; SD cards wear out and remount read-only | M21 |
| History and warnings, without an agent | Cockpit needs PCP installed for history (LWN); Netdata is heavy on small boards at its default rate (Netdata docs, forum). People want low-disk warnings (HN 2023) and certificate expiry alerts, because renewals fail quietly | M22 |
| A file manager for real config work | Cockpit's file browser can't move files or multi-select (HN 2026). Editing config files is what people still do in a terminal | M23 |
| Docker Compose | Cockpit manages Podman only, so Docker users keep the CLI or Portainer, whose access control and audit log are paid (HN, blogs) | M24 |
| Keys, many servers at once, and a record | SSH keys are a Cockpit task people use (LWN, HN). Sending one command to many hosts is in MobaXterm and WindTerm. People distrust "clickops" and want to turn what they did into a script or playbook (HN 2023) | M25 |
| Import `~/.ssh/config`, jump hosts | XPipe reads SSH config and handles jump servers; WindTerm has ControlMaster and agent forwarding | M20 |

**What people say they still do in a terminal**, even with Cockpit: scripts and loops, Docker
Compose, editing config files, and anything beyond a quick check (HN 2023 and 2026). M23 and M24 aim
at the middle two. The Terminal stays for the rest.

**About AI that runs commands:** the published criticism of shell-running agents is that approvals can
be bypassed, allowlists fall to argument injection and quoting tricks, and people approve almost
everything. HeadlessOS's agents never send command text, so this criticism doesn't apply to them, and
the site can say so.

## The phases

One phase per release. Each one works on a server with nothing installed, and on Raspberry Pi OS and
DietPi as well as Debian, Ubuntu and Fedora-family servers.

| Phase | Release | What you get | Effort |
| --- | --- | --- | --- |
| [M18](phases/phase-18.md) | 0.4.0 | **Updates you can trust:** security updates marked, "reboot needed", pick what to install, watch it run, every server at a glance | Small: the Packages tab exists |
| [M19](phases/phase-19.md) | 0.5.0 | **Logs that answer "what happened?":** follow live, earlier boots, why it rebooted, and a warning when logs don't survive a reboot | Small |
| [M20](phases/phase-20.md) | 0.6.0 | **Reach anything over SSH:** open a server's localhost-only web app in one click, import `~/.ssh/config`, jump hosts | Medium |
| [M21](phases/phase-21.md) | 0.7.0 | **Raspberry Pi and small boards:** power and throttling, temperature, Wi-Fi, SD card and read-only checks | Small to medium |
| [M22](phases/phase-22.md) | 0.8.0 | **Health over time and warnings:** history kept on your computer, warnings for disks filling, failed services, expiring certificates | Medium to large |
| [M23](phases/phase-23.md) | 0.9.0 | **Files for config work:** edit root-owned files with a diff, a backup and a check before saving; permissions; archives; multi-select | Medium |
| [M24](phases/phase-24.md) | 0.10.0 | **Docker Compose stacks:** see, edit, check and run stacks; image updates | Medium |
| [M25](phases/phase-25.md) | 0.11.0 | **Keys and many servers:** SSH keys and password login done safely, one action on many servers, export what you did as a script | Medium |

M18 and M19 come first because they're small, build on tabs that exist, and answer the two most
common reasons people open Cockpit. M20 comes next because it's the clearest thing no web panel can
do. M21 serves the Pi owners who are already using HeadlessOS.

## Rules for every phase

These keep the promise above. Each phase doc says how it meets them.

- **Nothing installed, nothing left running.** Read with tools the server already has, and say when
  one is missing instead of installing it. No background process stays on the server after the app
  disconnects.
- **Typed actions only.** Anything that changes a server is a typed action with validated parameters,
  built argv and quoting (ADR-024), so the agents can use it under the same rules.
- **Show before changing.** A write shows what will change, keeps a backup, checks the result
  (`nginx -t`, `sshd -t`, `visudo -c`), and rolls back if the check fails (`agent/writeback.ts`).
- **Don't lock the owner out.** Firewall, SSH and network changes keep the current session working:
  they refuse to block the SSH port in use, test a new login before dropping the old one, or undo
  themselves unless confirmed.
- **sudo per action.** Ask when an action needs it, and never store the password.
- **Nothing exposed on this computer either.** The backend stays on `127.0.0.1` with the API token
  (C3, M17.13). A tunnel listens on `127.0.0.1` only and closes with its window.
- **No telemetry.** Data about a server stays in `~/.headlessos/`.
- **The desktop app is tested, not just the browser.** Each release opens every new feature in the
  packaged app (M17.13's lesson).

## Not planned

- **Partitioning, LVM, RAID and network reconfiguration.** One mistake can lose data or cut the SSH
  connection the app depends on, and few people asked. Storage and Network stay read-only.
- **Virtual machines and SELinux tooling.** Cockpit covers them, and our users haven't asked.
- **A phone app.** People like checking a server from a phone (HN), but that needs a server you can
  reach from the internet or a relay, which breaks the rules above.
- **Cloud sync of connections.** Termius users complain that sync is paid and needs an account. If
  sync comes, it's an encrypted file the owner moves themselves.

## The owner's decisions

- **Signing:** an Apple Developer ID ($99 a year) would make macOS trust each update and keep its
  Local Network and Keychain permissions (M17). Windows code signing would remove the SmartScreen
  warning. Both make downloads more trustworthy and are worth weighing before 0.6.0.
- **Asking users:** with no telemetry, the way to learn what people need is to ask: a GitHub
  Discussions poll and an issue template ("What do you use HeadlessOS for?") linked from the site.

## Sources

- Hacker News on Cockpit: https://news.ycombinator.com/item?id=47445599 (2026),
  https://news.ycombinator.com/item?id=37895446 (2023)
- LWN, a review of Cockpit: https://lwn.net/Articles/965434/
- Cockpit Client on Flathub: https://flathub.org/apps/org.cockpit_project.CockpitClient, and
  Fedora Magazine: https://fedoramagazine.org/using-cockpit-to-graphically-manage-systems-without-installing-cockpit-on-them/
- Cockpit Files' open requests: https://github.com/cockpit-project/cockpit-files/issues
- Webmin's backdoored release: https://thehackernews.com/2019/08/webmin-vulnerability-hacking.html
- Pi throttling: https://gist.github.com/Paraphraser/17fb6320d0e896c6446fb886e1207c7e,
  https://discourse.pi-hole.net/t/add-an-under-voltage-warning-status/43728
- Pi Zero 2 W Wi-Fi: https://dietpi.com/forum/t/raspberry-pi-zero-2w-periodically-disconnects-from-wifi/18897
- Raspberry Pi's paper on a more resilient file system:
  https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-003610-WP-2-Making%20a%20more%20resilient%20file%20system.pdf
- DietPi logging: https://dietpi.com/docs/software/log_system/,
  https://dietpi.com/forum/t/which-log-to-look-at-after-a-crash-dietpi-ramlog-2-enabled/13345
- Netdata on small devices: https://learn.netdata.cloud/docs/edge-device-monitoring/minimize-cpu-and-memory
- Competitors: https://xpipe.io/pricing, https://termius.com/pricing, https://github.com/kingToolbox/WindTerm,
  https://code.visualstudio.com/docs/remote/ssh (Remote-SSH installs a server on the host)
- Shell-running agents: https://blog.trailofbits.com/2025/10/22/prompt-injection-to-rce-in-ai-agents/,
  https://www.docker.com/blog/coding-agent-horror-stories-the-command-you-already-approved/
