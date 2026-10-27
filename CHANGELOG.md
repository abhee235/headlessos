# Changelog

All notable changes to HeadlessOS. Task IDs (M14, EX11, …) point to the phase specs in
[docs/phases/](docs/phases/); [docs/PROGRESS.md](docs/PROGRESS.md) has the full log.

## 0.2.0 — 2026-10-27

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

### Fixed
- The agent audit log could replace an older rotated file when two rotations fell in the
  same millisecond, losing entries (M14.4).
- Local-model runs no longer show a made-up cost (EX10.7).
- When the HeadlessOS backend was down or restarting, the sign-in screen said "No servers
  configured yet". It now says the list couldn't load, retries every 3 s, and shows your
  servers once the backend answers (EX8.28).
- The desktop app could not reach its own backend: its sandboxed preload failed to load,
  so the window never got the server's port or token. v0.1.0's builds have the same fault
  (M14.11).

## 0.1.0 — 2026-04-26

First release: the desktop (Dashboard, Files, Terminal, Docker, Services, Task Manager,
Server Admin), multi-server sessions with hibernation, the AI Agent, the UI Agent with
Dynamic UI, and the LLM Observatory.
