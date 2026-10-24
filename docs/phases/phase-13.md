# Phase 13 — Release Readiness (M13)

> Get the repository ready to be made public: nothing third-party we may not ship,
> a licence, docs and screenshots tidied, and a README that matches the code.
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
- **Outdated screenshots.** `dev/` holds 13 screenshots of earlier builds, and the inspect
  script rewrites `dev/screenshot.png` on every run.
- **README drift.**
  - It names Anthropic as a provider (not built) and leaves out Ollama (built).
  - Its project layout predates the agents, Dynamic UI, Observatory, Electron and `dev/`.
  - It doesn't say an API key is optional.
- **Design input.** Four source comments and two docs point into an untracked design-handoff
  folder that will not be published.

## Design

1. **Wallpapers (M13.1).** Delete the three branded images. After the wallpaper list has
   loaded, a saved wallpaper ID that is no longer in it falls back to the default (Dusk)
   instead of requesting a missing file. Today a missing image renders as a broken `<img>`.
2. **Licence (M13.2).** MIT `LICENSE` at the root, copyright "abhee235". `"license": "MIT"`
   goes in the root `package.json`, and the README links to the file.
3. **Docs and screenshots (M13.3).**
   - Prior-art notes describe the earlier agent projects generically, keeping the technical facts.
   - Delete the outdated `dev/` screenshots.
   - `dev/screenshot.png`, which the inspect script rewrites on every run, is git-ignored.
   - References to the design-handoff folder point to `docs/phases/phase-ex8.md` instead. The
     folder itself stays out of git through `.git/info/exclude`.
4. **README (M13.4).** Providers as built (OpenAI, or a local model through Ollama), the AI and UI
   Agents and their safety model in two lines, the current layout, setup with the optional key,
   fake mode and the dev SSH server, the Electron build, and the licence link.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| M13.1 | Remove the Apple and Microsoft wallpapers; a missing saved wallpaper falls back to the default | ⬜ |
| M13.2 | MIT `LICENSE`, `license` field, README link | ⬜ |
| M13.3 | Tidy docs and screenshots; ignore the inspect script's screenshot; design-folder references → phase-ex8 | ⬜ |
| M13.4 | README matches the code | ⬜ |
