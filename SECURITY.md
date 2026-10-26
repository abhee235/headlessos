# Security Policy

HeadlessOS connects to your Linux servers over SSH and runs commands on them, so its
security matters. This page covers how to report a problem, and what the app does with
your credentials and data. The full threat model and coding rules are in
[docs/SECURITY.md](docs/SECURITY.md).

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub instead: the
repository's **Security** tab → **Report a vulnerability**. Include what you found, how to
reproduce it, and what an attacker could do with it.

Security fixes go into the latest release.

## What HeadlessOS stores, and where

Everything stays on your computer, in `~/.headlessos/`. The folder is created `0700`, and
the files that hold secrets are written `0600`.

| What | File | How |
|------|------|-----|
| Server list and SSH passwords | `servers.json` | Passwords are AES-256-GCM encrypted. The key is derived from a random per-install secret (`enc-key`) plus machine facts. Private keys are referenced by path, never copied. |
| LLM API keys (OpenAI, Anthropic) | `llm.json` | Encrypted the same way. The server never sends a key back to the browser. Choosing *None* in Settings → AI deletes them. |
| API token | `api-token` | A random token that every API and WebSocket call must carry (see below). |
| Agent actions | `audit/actions.jsonl` | An append-only log of every action an agent asked to run, and the answer. |
| Traces and sessions | `observatory/`, `sessions/` | Model calls, tool results and window layouts, for the trace viewer and for restoring sessions. |

Encryption at rest protects against casual reading of these files. It does not protect
against someone who can run code as your user, because the key is on the same machine.

HeadlessOS installs no agent on your servers; it runs commands over SSH. (The Docker app
can install Docker on a server, but only when you ask it to.)

## The local server

- The backend listens on `127.0.0.1` only, never on a network interface.
- Every API and WebSocket request needs the random API token; only a liveness check
  (`/health`) does not. A web page you visit cannot read the token file, so it cannot
  drive your servers through the local API.
- Requests whose `Host` header is not localhost are refused, which blocks DNS-rebinding
  attacks. WebSocket upgrades from any origin other than localhost or the desktop app are
  refused too.

## AI agents

- **No shell commands from the model.** Agents choose typed actions from a fixed catalog.
  The server validates the parameters, builds the command and quotes it. A model never
  sends shell text ([ADR-024](docs/DECISIONS.md)).
- **Changes need your approval.** An action that changes a server (restart a service,
  stop a container) waits for you to approve it in the app. Read-only runs refuse such
  actions outright. Denials and approvals go into the audit log.
- **Server output is treated as data.** Before output reaches a model, passwords, tokens,
  API keys and password hashes are redacted. The output is also wrapped and marked as
  untrusted, and the agents' prompts say it is data, not instructions.

## What is sent to an LLM provider

With no provider chosen, parsing is deterministic. The only traffic is then SSH to your
servers, plus the Home hub's weather: the city name you type and the chosen city's
coordinates go to Open-Meteo, and nothing else does.

When you choose a provider in Settings → AI, prompts and redacted command output are sent
to it:
- **OpenAI:** `api.openai.com`.
- **Anthropic (Claude):** `api.anthropic.com`.
- **Ollama:** your own Ollama server. A server other than this computer needs your
  explicit confirmation.

## Desktop builds

Release builds may be unsigned. macOS and Windows then warn on first launch. Download
builds only from this repository's Releases page.
