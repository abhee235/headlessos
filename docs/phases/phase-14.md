# Phase 14 — Public Release (M14)

> Finish what stands between the repository and its first public release (v0.2.0):
> dependencies without known high or critical advisories, no stale build output in git,
> CI that runs the tests, a security policy, a README that matches the code and says how
> to install the app, a packaged build that starts, and a release with notes. Making the
> repository public and tagging the release are the owner's decisions (M14.8, M14.9).

## Why

The audit after EX11 merged (2026-10-27) found these open items.

**Dependencies.** `npm audit --omit=dev` lists 11 high or critical advisories:
- **Eight with fixes in the same major:** `fastify` (schema-validation bypass),
  `@fastify/static` (path traversal in directory listing), `@fastify/busboy`, `ws`,
  `find-my-way`, `fast-uri`, `nanoid` and `brace-expansion`.
- **`dompurify` 3.4.15, critical,** via `monaco-editor` 0.57. 3.4.17 is patched, but
  monaco pins the older one.
- **`zod` 3.x:** memory exhaustion on oversized constrained collections. It is fixed only in
  4.6.6 and later. It is used in 80 files.
- **`openai` 5.x:** flagged through its `zod ^3` peer dependency. It needs a major upgrade to
  accept zod 4.

**Stale build output.** `electron/server.cjs` and `electron/server.mjs` (3.6 MB each) are
committed. They were last changed in April (M11.8). The release workflow rebuilds them, so
the committed copies are old server code.

**No CI on pull requests.** The only workflow, `release.yml`, runs on tags and builds
without running a test.

**No security policy.** The app stores SSH passwords and API keys (AES-GCM, with a key
derived per install), but nothing says so in one place or says how to report a problem.

**README drift.** It does not mention Claude (EX11). It has no install or download steps
and no screenshots.

**Packaging not re-checked.** The Electron build has not run since `@anthropic-ai/sdk`
joined the server bundle.

**Version.** Every package says 0.1.0. The GitHub release `v0.1.0` was built in April.

**Already in order:**
- no secrets in any commit (M13 audit, re-checked for the commits since);
- the owner's Anthropic key is in no file, commit or branch;
- an MIT licence;
- every phase in PROGRESS complete.

## Design

1. **Dependencies.**
   - **M14.1a:** `npm audit fix` without `--force`, plus an npm `overrides` entry that lifts
     `dompurify` to ^3.4.17 under `monaco-editor`.
   - **M14.1b:**
     - `zod` 4 everywhere;
     - `openai` to the first major that accepts zod 4;
     - `zod-to-json-schema` replaced by zod 4's own `z.toJSONSchema`.
   - **Checks:** each step ends with both typechecks and both suites green, and with
     `npm audit --omit=dev` showing no high or critical advisory.
2. **Build output (M14.2).** `git rm --cached` both bundles and add them to `.gitignore`.
   `npm run build:server` still writes them locally for `test:prod`.
3. **CI (M14.3).**
   - A `ci.yml` workflow runs on pull requests and on pushes to `main`. It builds `shared`,
     then runs both typechecks and both suites on Ubuntu with Node 20.
   - `release.yml` runs the same checks before it builds, so a tag on failing code
     produces no release.
4. **Security policy (M14.4).** `SECURITY.md` covers:
   - what the app stores and where (`~/.headlessos`);
   - how it is encrypted, and that the key is per install;
   - that the server binds 127.0.0.1 and requires a token;
   - what agents can and cannot do (ADR-024, the approval gate);
   - what is sent to an LLM provider;
   - how to report a vulnerability (GitHub private advisories).

   A short `CONTRIBUTING.md` points to `AGENTS.md`, the DDD loop and the test commands.
5. **README (M14.5).** Add:
   - Claude next to OpenAI and Ollama;
   - install from a release, and run from source;
   - a note on unsigned builds (if the owner decides not to sign);
   - two or three screenshots taken against the dev SSH container, so no real server
     shows.
6. **Packaged build (M14.6).** `npm run build:dist:win` on this machine. The app must start,
   reach the lock screen, and answer `/api/health` with its token.
7. **Version and notes (M14.7).**
   - `0.2.0` in the root, client, server and electron `package.json` files.
   - `CHANGELOG.md` with 0.2.0 written from the PROGRESS change log since v0.1.0 (EX6–EX11,
     M12–M14).
8. **Publish (M14.8) — owner's decision.** Make the repository public, then turn on
   private vulnerability reporting (SECURITY.md points reporters there).
9. **Release (M14.9) — owner's decision.** Push tag `v0.2.0`. The release workflow builds
   macOS, Windows and Linux. Check that the release has its assets and that the Windows
   installer starts. Signing: unsigned unless the owner adds certificates.

## What does not change

App behaviour. M14.1b changes how schemas are written, not what they accept. The tests
must pass unchanged, except where a test asserts zod 3's own error wording.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| M14.1a | `npm audit fix` (same majors) and a `dompurify` override | ⬜ |
| M14.1b | zod 4, openai upgrade, `z.toJSONSchema` instead of `zod-to-json-schema` | ⬜ |
| M14.2 | Stop tracking `electron/server.cjs` / `server.mjs` | ⬜ |
| M14.3 | CI on pull requests and `main`; release workflow runs the checks first | ⬜ |
| M14.4 | `SECURITY.md` and `CONTRIBUTING.md` | ⬜ |
| M14.5 | README: Claude, install and download, screenshots | ⬜ |
| M14.6 | Packaged Windows build starts | ⬜ |
| M14.7 | Version 0.2.0 and `CHANGELOG.md` | ⬜ |
| M14.8 | Make the repository public | ⬜ |
| M14.9 | Tag v0.2.0 and check the release | ⬜ |
