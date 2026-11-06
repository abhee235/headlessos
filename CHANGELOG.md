# Changelog

All notable changes to HeadlessOS. Task IDs (M14, EX11, …) point to the phase specs in
[docs/phases/](docs/phases/); [docs/PROGRESS.md](docs/PROGRESS.md) has the full log.

## 0.2.1 — 2026-11-06

### Added
- **A log file** (M15.3). The desktop app writes `~/.headlessos/logs/headlessos.log`, with
  passwords, keys and tokens masked. It stays on your computer. Open it from Global Settings,
  Settings → About, or Help → Open Logs (M15.4).
- **Help at the top of Control Center** (M15.15): Documentation, Troubleshooting, Open log and
  Report an issue, before you've signed in to anything.
- **Linux builds** (M15.5): every release now has an AppImage and a `.deb`.

### Security
- **Changes can't skip your approval.** A widget's refresh command could be written by a model and
  ran on a timer with no click, so a view could stop a service or remove a container without
  asking. Refreshes and view buttons now only run commands that read. `find` can no longer delete
  or write files, and output can't be redirected to a file (M15.9).
- **SSH keys are encrypted.** Private keys and passphrases sat in `servers.json` in plain text, and
  the server list sent them to the window. They're now encrypted like passwords, including ones
  you've already saved, and stay in the backend (M15.12).
- **Secrets stay out of the parsing fallback.** Output sent to a model for parsing now has secrets
  removed first, as agent runs already did (M15.13).

### Changed
- If the backend stops while the app is running, the app says so and offers Restart, Open Log
  and Quit, instead of every window quietly failing. If it stops during startup, the app says
  so at once instead of waiting 20 seconds (M15.2).
- "Failed to fetch" now tells you the app can't reach its own backend and that nothing was sent
  to your server (M15.1).

### Fixed
- On a Mac, a connection to a device on your local network could fail while `ssh` from Terminal worked,
  because macOS keeps apps off the local network until you allow them. The app now says why it needs
  access, and the error says where to allow it (M15.8).
- Help → Documentation and Report Issue opened a GitHub page that doesn't exist (M15.4).
- The sign-in screen said "Connection failed. Check server credentials." for every failure. It now
  says what happened and what to try, shows the exact error to copy, and links to the fix and the
  log (M15.10, M15.14).
- A wrong password was tried four times, which could trip fail2ban and lock you out. It's now tried
  once (M15.11).
- If a saved password couldn't be decrypted, the whole server list was lost on the next save. Your
  servers now stay, and you sign in again (M15.12).
- Saved passwords, SSH keys and AI keys depended on the computer's name, so renaming it could make
  them unreadable, and a Mac can pick up a new name from the network. They no longer do, and
  existing ones move over at the next start (M15.18).
- A server whose saved key can't be read said "SSH key configured", then "The server refused this
  login". It now says the key is gone and what to do (M15.16).
- A damaged server list looked like a new install. The screen now says so and names the kept file
  (M15.17).
- In the installed app, windows, panels and the top bar had no blur, so the desktop showed through
  them. They now match the browser (M15.20).

## 0.2.0 — 2026-10-29

### Added
- **Claude as a model provider** (EX11). Choose Claude Haiku 5.5, Sonnet 5.5 or Opus 5.5 in
  Settings → AI, next to OpenAI and Ollama. The key is checked with Anthropic before it is
  saved, and stored encrypted.
- **Local models through Ollama** (EX9.3). Pick an installed model, and HeadlessOS sizes
  every request to the model's real context window (EX10.1).
- **Safe agents** (EX9):
  - Agents call typed actions from a fixed catalog instead of writing shell commands.
  - Anything that changes a server waits for your approval and is written to an audit log.
  - Secrets are removed from server output before a model sees it.
- **The UI Agent builds views widget by widget** (EX10.8–EX10.10), with values filled from
  what the server returned, not copied by the model.
  - Follow-up prompts refine the open view in the same window.
  - Unclear requests get a question back.
- **Agents that stay on track on small models** (EX10). Context is compacted in layers,
  loops are caught and stopped, and broken or cut-off replies are asked for again.
- **Container files and shells** (EX7). Browse, edit, upload and delete files inside a
  Docker container, and open a shell in it, all over SSH.
- **A new look** (EX8): a glass desktop with dock, launcher, Quick Settings, notifications,
  a Home hub, a code editor in Files, and more in Task Manager (app history, startup apps,
  users, services).
- **Network traffic on the Home hub** (EX8.26): the selected server's download and upload for
  the last 1, 5 or 15 minutes, with peak, average and total, in place of the sample music card.
- **Docs:** `SECURITY.md` and `CONTRIBUTING.md`; a README with install steps and
  screenshots (M14).

### Security
- An audit before open-sourcing (October 2026):
  - two command-injection paths closed;
  - every API and WebSocket call needs a per-install token;
  - Host and WebSocket-origin checks;
  - a per-install encryption secret.
- No known high or critical advisories in production dependencies (M14.1–M14.2): fastify
  5.12, zod 4, openai 6, dompurify 3.4.17. An unused static-file plugin was removed.

### Changed
- Backend refactored into domain services behind one command-policy chokepoint (M12).
- Apple and Microsoft wallpapers removed; MIT licence added (M13).
- Desktop builds no longer ship server code from git: the release build bundles it fresh.
  The release workflow runs the full typecheck and test suite first (M14).
- Open apps get a lane across the dock, brighter with an accent bar for the app in front, so a
  minimized app no longer looks switched off (EX8.27).
- The Fleet overview matches the Home hub: a status light and dials for CPU, memory and disk
  on every server card, and one summary for the whole fleet. CPU is new to it (EX8.29).

### Fixed
- The agent audit log could replace an older rotated file when two rotations fell in the
  same millisecond, losing entries (M14.4).
- Local-model runs no longer show a made-up cost (EX10.7).
- When the HeadlessOS backend was down or restarting, the sign-in screen said "No servers
  configured yet". It now says the list couldn't load, retries every 3 s, and shows your
  servers once the backend answers (EX8.28).
- File Explorer's Home, Desktop, Documents and Downloads opened `/home/testuser` on every server.
  Home is now your own home folder, as the server reports it, and the others show only when
  they exist there (EX8.30).
- The desktop app could not reach its own backend: its sandboxed preload failed to load,
  so the window never got the server's port or token. v0.1.0's builds have the same fault
  (M14.11).
- The desktop app had no wallpapers: they were never copied into the build (M14.12).

## 0.1.0 — 2026-04-26

First release: the desktop (Dashboard, Files, Terminal, Docker, Services, Task Manager,
Server Admin), multi-server sessions with hibernation, the AI Agent, the UI Agent with
Dynamic UI, and the LLM Observatory.
