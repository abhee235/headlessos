# Phase 20 — Reach Anything Over SSH (M20)

> Release 0.6.0. See `docs/ROADMAP.md`. Many self-hosted apps only listen on the server's own
> `localhost`: admin panels, Grafana, Home Assistant's add-ons, Pi-hole's dashboard, a dev server.
> People open ports, set up a VPN, or type `ssh -L` to reach them. This phase opens them in one
> click over the SSH connection HeadlessOS already has, and reads the owner's `~/.ssh/config`, jump
> hosts included.

## Why

The top objection to Cockpit and Webmin is the web panel they open on the server. HeadlessOS has no
panel, and the same SSH connection can carry the server's own web apps to this computer, with
nothing opened to the network. Termius, XPipe, MobaXterm and Royal TSX all manage tunnels, so people
expect it. Most also read SSH config and handle jump hosts, which HeadlessOS can't do yet: a server
reachable only through a bastion can't be added today.

## Design

### M20.1 — Find what's listening

- `ss -ltnpH` lists listening TCP ports. A port bound to `127.0.0.1` or `::1` is a candidate, and
  so is one bound to all addresses.
- Each one is named from its process (`nginx`, `grafana-server`, `python3`) and, for HTTP, from
  the page title, fetched over the tunnel only when the owner asks.
- A new Network → **Ports** list, with an **Open** button on each.

### M20.2 — Open in one click

- **Open** starts a local forward: a listener on `127.0.0.1:<free port>` on this computer, each
  connection carried by ssh2's `forwardOut` to the server's port. Then the default browser opens
  `http://127.0.0.1:<port>`.
- **Tunnels** list: what's open, its traffic, and a **Close** button. All of a server's tunnels
  close when it disconnects, and all of them when the app quits.
- **Saved tunnels** per server ("Grafana, 3000"), opened from the server's menu.
- Any port can be forwarded by number, not only those M20.1 found.

### M20.3 — Read `~/.ssh/config`

- **Import** reads the owner's SSH config on this computer: `Host`, `HostName`, `User`, `Port`,
  `IdentityFile`, `ProxyJump`, and `Include` files. Wildcard hosts are applied, not listed.
- It shows what it found and adds only what the owner ticks.
- A key is referenced by its path, not copied (the H3 follow-up in `docs/SECURITY_AUDIT.md`).
  Encrypted keys ask for their passphrase at connect.
- **ssh-agent:** use the running agent (`SSH_AUTH_SOCK`, or Pageant and the OpenSSH agent pipe on
  Windows) as a sign-in method, so keys never pass through HeadlessOS at all.

### M20.4 — Jump hosts

- A server can name another saved server as its jump host. The connection opens the jump host first,
  then `forwardOut` to the target's SSH port, and connects through that stream.
- Chains of more than one hop, as `ProxyJump a,b` allows.
- The jump host's host key is checked like any other (M5's checks).

## Security

- **Tunnels listen on `127.0.0.1` only,** never on the network. As with `ssh -L`, any program on
  this computer can use an open tunnel, so each tunnel shows while it's open, and closes with its
  window.
- No remote forwards (`-R`) and no SOCKS proxy in this phase: they expose more, and nobody asked.
- `sshd` can refuse forwarding (`AllowTcpForwarding no`). The error says that, instead of a generic
  failure.
- Imported config is data, never run: no `ProxyCommand`, `LocalCommand` or `Match exec`, which are
  listed as skipped.

## What this can't do

- A web app that redirects to its public address, or checks the `Host` header, may not work through
  the tunnel. The tunnel list says what host it expected when the page fails.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M20.1 | Find listening ports and name them | ⬜ |
| M20.2 | Open a port in the browser over SSH; the tunnel list; saved tunnels | ⬜ |
| M20.3 | Import `~/.ssh/config`; keys by path; ssh-agent and Pageant | ⬜ |
| M20.4 | Jump hosts, including chains | ⬜ |
| M20.5 | Version 0.6.0, the docs and the release | ⬜ |

## Checks

- Unit tests: the `ss` parser; the config parser with `Include`, wildcards and the skipped
  directives; the tunnel server closing with its connection.
- On the dev container: a web server on its `localhost` opened in the browser; a second container
  reachable only through the first, added as a jump host.
- In the packaged app on Windows and macOS: a tunnel opens and closes, and macOS's Local Network
  prompt is handled as in M17.7.
