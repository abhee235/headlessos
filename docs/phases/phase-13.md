# Phase 13 — Release Readiness (M13)

> Get the repository ready to be made public: nothing third-party we may not ship,
> a licence, no names of the owner's private projects or servers, a README that matches
> the code, and commits that carry the owner's GitHub identity, not a personal email.
> Going public is a separate decision; this phase only prepares for it.

## Why

A pre-publication audit (2026-10-25) of all 137 commits and the 75 tracked images found:

- **No secrets.** No API key, token or password in any commit. The one private key in history
  (`electron/server.cjs`) is the `ssh2` library's public Ed25519 probe constant.
  `.env.example` has only ever held `sk-your-key-here`. CI secrets live in GitHub settings.
- **Third-party wallpapers.** `server/assets/wallpapers/system/` ships Apple's macOS Big Sur
  and Sequoia wallpapers and Microsoft's Windows 11 "Bloom". The other six photos are
  Unsplash (Unsplash License, `CREDITS-lumen.txt`).
- **No licence file.** `electron/package.json` says MIT, and the README says "MIT", but there
  is no `LICENSE`.
- **Private names.**
  - Two sibling projects (an agent engine and its fork) are named in EX9/EX10 docs and code
    comments, which give their paths and ADR numbers.
  - Screenshots in `dev/` show a test VPS (with its public IP), another server of the owner's
    with its public IP, and a private project's container and image names.
  - Several screenshots show the test VPS's name in the taskbar.
- **README drift.**
  - It names Anthropic as a provider (not built) and leaves out Ollama (built).
  - Its project layout predates the agents, Dynamic UI, Observatory, Electron and `dev/`.
  - It doesn't say an API key is optional.
- **Commit identity.** Every commit carries the owner's personal email. It should be the GitHub
  account (`abhee235`, no-reply address).
- **Design input.** Four source comments and two docs point into an untracked design-handoff
  folder that will not be published.

The owner decided (2026-10-25) that the server IPs need not be scrubbed from history: they
are not secrets, and the screenshots are removed from the tree going forward.

## Design

1. **Wallpapers (M13.1).** Delete the three branded images. After the wallpaper list has
   loaded, a saved wallpaper ID that is no longer in it falls back to the default (Dusk)
   instead of requesting a missing file. Today a missing image renders as a broken `<img>`.
2. **Licence (M13.2).** MIT `LICENSE` at the root, copyright "abhee235". `"license": "MIT"`
   goes in the root `package.json`, and the README links to the file.
3. **Private names and screenshots (M13.3).**
   - Docs and comments describe the sibling projects generically ("an earlier agent project"),
     keeping the technical facts and dropping names, paths and ADR numbers.
   - Delete the `dev/` screenshots that show the test VPS, the other server or the private
     project.
   - `dev/screenshot.png`, which the inspect script rewrites on every run, is git-ignored.
   - References to the design-handoff folder point to `docs/phases/phase-ex8.md` instead. The
     folder itself stays out of git through `.git/info/exclude` (local, so its name is not
     published either).
4. **README (M13.4).** Providers as built (OpenAI, or a local model through Ollama), the AI and UI
   Agents and their safety model in two lines, the current layout, setup with the optional key,
   fake mode and the dev SSH server, the Electron build, and the licence link.
5. **Commit identity (M13.5).**
   - New commits use `abhee235 <11911948+abhee235@users.noreply.github.com>` (repo-level git
     config).
   - Existing commits change only by rewriting history (`git filter-repo` with a mailmap, then a
     force-push). That changes every commit hash, so it waits for the owner's go-ahead,
     ideally just before going public, so it is done once.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| M13.1 | Remove the Apple and Microsoft wallpapers; a missing saved wallpaper falls back to the default | ✅ |
| M13.2 | MIT `LICENSE`, `license` field, README link | ✅ |
| M13.3 | Remove private project/server names from docs, comments and screenshots; ignore the inspect script's screenshot; design-folder references → phase-ex8 | ✅ |
| M13.4 | README matches the code | ✅ |
| M13.5 | Commit identity: GitHub no-reply for new commits; rewrite existing commits (owner's go-ahead) | ⬜ |
