# Phase 14 — Public Release (M14)

> Finish what stands between the repository and its first public release (v0.2.0):
> dependencies without known high or critical advisories, no stale build output in git,
> CI that runs the tests, a security policy, a README that matches the code and says how
> to install the app, a packaged build that starts, and a release with notes. Making the
> repository public and tagging the release are the owner's decisions (M14.9, M14.10).

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
   - **M14.1:** `npm audit fix` without `--force`, plus an npm `overrides` entry that lifts
     `dompurify` to ^3.4.17 under `monaco-editor`.
   - **M14.2:**
     - `zod` 4 everywhere;
     - `openai` to the first major that accepts zod 4;
     - `zod-to-json-schema` replaced by zod 4's own `z.toJSONSchema`.
   - **Checks:** each step ends with both typechecks and both suites green, and with
     `npm audit --omit=dev` showing no high or critical advisory.
2. **Build output (M14.3).** `git rm --cached` both bundles and add them to `.gitignore`.
   `npm run build:server` still writes them locally for `test:prod`.
3. **CI (M14.4).**
   - A `ci.yml` workflow runs on pull requests and on pushes to `main`. It builds `shared`,
     then runs both typechecks and both suites on Ubuntu with Node 20.
   - `release.yml` runs the same checks before it builds, so a tag on failing code
     produces no release.
4. **Security policy (M14.5).** `SECURITY.md` covers:
   - what the app stores and where (`~/.headlessos`);
   - how it is encrypted, and that the key is per install;
   - that the server binds 127.0.0.1 and requires a token;
   - what agents can and cannot do (ADR-024, the approval gate);
   - what is sent to an LLM provider;
   - how to report a vulnerability (GitHub private advisories).

   A short `CONTRIBUTING.md` points to `AGENTS.md`, the DDD loop and the test commands.
5. **README (M14.6).** Add:
   - Claude next to OpenAI and Ollama;
   - install from a release, and run from source;
   - a note on unsigned builds (if the owner decides not to sign);
   - two or three screenshots taken against the dev SSH container, so no real server
     shows.
6. **Packaged build (M14.7).** `npm run build:dist:win` on this machine. The app must start,
   reach the lock screen, and answer `/api/health` with its token.
7. **Version and notes (M14.8).**
   - `0.2.0` in the root, client, server and electron `package.json` files.
   - `CHANGELOG.md` with 0.2.0 written from the PROGRESS change log since v0.1.0 (EX6–EX11,
     M12–M14).
8. **Publish (M14.9) — owner's decision.** Make the repository public, then turn on
   private vulnerability reporting (SECURITY.md points reporters there).
9. **Release (M14.10) — owner's decision.** Push tag `v0.2.0`. The release workflow builds
   macOS, Windows and Linux. Check that the release has its assets and that the Windows
   installer starts. Signing: unsigned unless the owner adds certificates.

## What does not change

App behaviour. M14.2 changes how schemas are written, not what they accept. The tests
must pass unchanged, except where a test asserts zod 3's own error wording.

## Tasks

| Task ID | Task | Status |
|---------|------|--------|
| M14.1 | `npm audit fix` (same majors) and a `dompurify` override | ✅ |
| M14.2 | zod 4, openai upgrade, `z.toJSONSchema` instead of `zod-to-json-schema` | ✅ |
| M14.3 | Stop tracking `electron/server.cjs` / `server.mjs` | ✅ |
| M14.4 | CI on pull requests and `main`; release workflow runs the checks first | ✅ |
| M14.5 | `SECURITY.md` and `CONTRIBUTING.md` | ✅ |
| M14.6 | README: Claude, install and download, screenshots | ⬜ |
| M14.7 | Packaged Windows build starts | ⬜ |
| M14.8 | Version 0.2.0 and `CHANGELOG.md` | ⬜ |
| M14.9 | Make the repository public | ⬜ |
| M14.10 | Tag v0.2.0 and check the release | ⬜ |

## M14.1 — Same-major fixes and dompurify (as built)

- **`npm audit fix`** (no `--force`) updated 48 packages within their ranges, among them:
  - `fastify` 5.8.4 → 5.12.7, `find-my-way` 9.10, `fast-uri` 3.1.9;
  - `ws` 8.22, `nanoid` 5.1.16, `@fastify/busboy` 3.2.4;
  - `vite`, `vitest` and `@babel/*` patch releases.
- **`@fastify/static` removed.** It was in `server/package.json` but imported nowhere. That
  took away its last advisory, which only 10.x fixes, along with 18 packages it pulled in,
  `brace-expansion` among them.
- **dompurify.**
  - **What runs:** `monaco-editor` 0.57 bundles DOMPurify 3.4.15 inside its own source
    (`esm/vs/base/browser/dompurify/dompurify.js`). Its sanitizer (`domSanitize.js`) uses
    `ALLOWED_TAGS`, `RETURN_DOM_FRAGMENT` and an `afterSanitizeAttributes` hook. It never
    turns on `IN_PLACE` or `SAFE_FOR_TEMPLATES`, which all three advisories need, so the
    editor is not affected. No newer monaco exists yet.
  - **The npm package:** `dompurify` itself (a declared monaco dependency, imported by
    nothing) is lifted to 3.4.17 with root `overrides: { dompurify: "^3.4.17" }`.
  - **An npm bug:** npm 11 ignores an override added after the lockfile exists, even
    workspace-scoped. That was reproduced in a scratch project. Only a fresh lockfile
    honours it, and a fresh lockfile here would move 217 packages, React, Radix and
    Tailwind among them.
  - **The fix used:** the 3.4.17 lock entry was copied from a fresh resolution. `npm ci` and
    a later `npm install` both keep it (tested). `npm ls` calls it "invalid", which is the
    same bug.
- **Result:** `npm audit --omit=dev` went from 11 high or critical advisories to 2 (zod, and
  openai through zod: M14.2).

**Verified:** server 2537 passed (+2 skipped), client 657; both typechecks clean.

## M14.2 — zod 4 and openai 6 (as built)

**Packages:**
- `zod` 4.6.7 in server, shared and, now declared, client. The client imports zod and had
  been borrowing the root's copy. A single copy sits at the root after `npm dedupe`.
- `openai` 6.49, the first major that accepts zod 4.
- `zod-to-json-schema` removed.

**Code changes:**
- **`llm/json-schema.ts` (new).**
  - `jsonSchemaOf` wraps `z.toJSONSchema` in draft-7 input mode, with `unrepresentable:
    'any'`. An `override` adds `additionalProperties: false` to every object, as the old
    library did; maps keep their value schema.
  - Compared with zod 3.25 + zod-to-json-schema 3.24 on a parser schema and a tool schema:
    identical apart from key order (pinned in `tests/llm/json-schema.test.ts`).
  - `jsonFromReply` is the fence-stripping, repairing JSON reader. The Claude and OpenAI
    providers share it.
- **Users of `jsonSchemaOf`:** `tool-converter.ts`, `providers/ollama.ts` and
  `providers/anthropic.ts`.
- **OpenAI parsing (`providers/openai.ts`, `textFormatFor`).**
  - openai 6's `zodTextFormat` refuses what strict Structured Outputs cannot express under
    zod 4: an optional field that is not also nullable, a map, a root that is not an
    object. Most parser schemas and the view schema hit one of these.
  - Such schemas are sent as a plain JSON schema (`strict: false`) through
    `responses.create`, and the reply is checked with Zod. A string root (summaries) gets
    plain text. Schemas strict mode can express keep `responses.parse`.
- **zod 4 differences handled:**
  - `.strict()` is a `never` catchall (`catalog/index.ts`).
  - Effects became pipes (`runner.ts` `baseType`).
  - A bad discriminator is `invalid_union` with `options`, and a missing field shows only in
    the message (`view-arg.ts` `describeIssues`).
  - Issue paths are `PropertyKey[]` (`tool-input.ts`).
- **IDs.** `z.string().uuid()` became `z.guid()` in `shared/schemas/observatory.ts` and
  `app-store.ts`. zod 4's `.uuid()` requires an RFC version and variant. `z.guid()` accepts
  what zod 3's `.uuid()` did.

**Verified:**
- `npm audit --omit=dev`: 0 vulnerabilities.
- **Tests:** server 2543 passed (+2 skipped), client 657; both typechecks clean.
  - New: `tests/llm/json-schema.test.ts` (4) and `tests/llm/openai.test.ts` (6).
  - Changed: the two view-schema tests that asserted a strict OpenAI format now assert the
    plain JSON-schema format.
- **Local Ollama (`ornith:latest`).** It accepts the new format for a parser schema (df, 9 s)
  and for the full view schema (21 KB with `$ref` definitions; a valid "Disk" view in 3 s).
- **Not run against OpenAI.** The parse path is covered by tests with a scripted client.

**Still open, dev-only:** `vitest` 3 (critical, through `tinypool`) and `esbuild` (low).
The fix is vitest 5, a test-runner upgrade. Nothing here ships in the app.

## M14.3 — Build output out of git (as built)

- `git rm --cached electron/server.mjs electron/server.cjs`; both added to `.gitignore`.
  They stay on disk.
- **The files:**
  - `server.mjs` is what `electron/main.js` loads. `npm run build:server` (in `electron/`)
    writes it, and the release workflow and `npm run test:prod` both run that first.
  - `server.cjs` was an older CommonJS bundle that nothing loads.
- The comment in `main.js` named `server.cjs`; it now names `server.mjs`.
- **Verified:** `npm run build:server` writes a 5.7 MB `server.mjs` in 0.2 s, with zod 4,
  openai 6 and the Anthropic SDK bundled. The committed one was 3.6 MB, from April.

## M14.4 — CI (as built)

- **`.github/workflows/ci.yml` (new).**
  - Runs on pull requests, on pushes to `main`, and as a reusable workflow
    (`workflow_call`).
  - Ubuntu, Node 20 (the release builds use 20; the code needs 20.11+ for
    `import.meta.dirname`). Steps: `npm ci`, build `shared`, `tsc` for server and client,
    then the server and client suites.
  - The lockfile already carries the Linux native packages (rollup, esbuild, lightningcss,
    tailwind oxide).
- **`.github/workflows/release.yml`:** a `check` job calls `ci.yml`. `build-mac` and
  `build-windows` need it, so a tag on failing code builds nothing.

**First CI run (Linux).**
- **The bug:** CI found an EX9.2 audit-log bug that Windows never showed. Past the size cap
  the log was renamed to `actions-<iso>.jsonl`. Two rotations in one millisecond got the
  same name, and on Linux the rename replaced the earlier file: the test lost 2 of 5
  entries.
- **The fix:** `ActionAudit.rotatedPath()` adds `-1`, `-2` … when the name is taken.
- **The test:** it now freezes the clock, so it fails on every platform without the fix.

## M14.5 — Security policy and contributing guide (as built)

- **`SECURITY.md` (new, repository root).** Covers:
  - how to report: GitHub's private vulnerability reporting, and no public issues;
  - what is stored where, and how;
  - the local server: 127.0.0.1, the API token (`/health` is the only open route), and
    the Host-header and WebSocket-origin checks;
  - the agents' limits: typed actions, approvals, redaction, output marked untrusted;
  - what goes to each LLM provider, and Open-Meteo for the Home hub's weather (the only
    other outbound call);
  - that release builds may be unsigned.

  Each statement was checked against the code (`index.ts` auth hooks,
  `security/encryption.ts`, `config/store.ts`, `routes/glance.ts`, `routes/docker.ts`).
- **`docs/SECURITY.md`:**
  - password keys have used the per-install secret since M1;
  - Anthropic keys are stored like OpenAI keys and only read from Settings;
  - `api.anthropic.com` is among the outbound hosts.
- **`CONTRIBUTING.md` (new):** setup, the dev SSH server and fake mode, the doc-first loop,
  the commit format the hook enforces, the checks CI runs, the security rules reviews hold
  to, and the MIT terms.
- **Owner's step, once the repository is public:** turn on private vulnerability reporting
  (Settings → Code security). SECURITY.md points reporters there.

**Second CI run.** The server suite passed. One client test failed on Node 20 only:
`DynamicUI.test.tsx` `require()`d the ES-module schema, which works on Node 22.12+ but
not on Node 20, the version the README promises. It now imports the schema.

The browser-side `require('../../lib/plugins')` in `SettingsView.tsx` (the Plugins page)
has the same root cause: it throws inside a `try`, so the page lists no plugins. It is
recorded as a follow-up; it is outside M14.
