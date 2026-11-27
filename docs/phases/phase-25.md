# Phase 25 — Keys, Many Servers, and a Record (M25)

> Release 0.11.0. See `docs/ROADMAP.md`. Managing SSH keys is one of the Cockpit tasks people
> actually use, and turning off password login is the first thing every hardening guide says, and
> the easiest way to lock yourself out. This phase does it safely, runs one action on many servers,
> and turns what the owner did into a script they can keep.

## Why

- Adding a key and turning off password login takes several careful steps today, in a terminal, and
  a mistake locks the owner out of the server.
- Owners with several servers repeat the same task on each one. MobaXterm and WindTerm can send one
  input to many terminals. HeadlessOS's Fleet shows many servers, but can't act on them together.
- People distrust changes made by clicking ("clickops"), because nothing records them. One asked
  for a way to turn GUI changes into an Ansible playbook.

## Design

### M25.1 — SSH keys

- List `~/.ssh/authorized_keys` for the signed-in user, and other users' with sudo: type, comment,
  fingerprint, and options such as `from=`.
- **Add a key:** paste it or pick a file on this computer. `ssh-keygen -l -f` checks it on the server
  before it's added, and duplicates are refused.
- **Remove a key:** refused for the key this session signed in with, so the owner can't cut off their
  own connection.
- **Make a key on this computer** for a server, and add it in one step.

### M25.2 — Turn off password login, safely

1. Check that a key is set up and works, by opening a **second** connection with that key.
2. Write a drop-in, `/etc/ssh/sshd_config.d/50-headlessos.conf`, with `PasswordAuthentication no`
   (and `PermitRootLogin prohibit-password` if the owner ticks it), through write-back with
   `sshd -t` as the check.
3. Reload `sshd`. The current session stays open.
4. Open another new connection with the key. If it fails, restore the old config and reload, and say
   what happened.
- The same guarded flow is used for any other change to `sshd`.

### M25.3 — One action, many servers

- In Fleet, select servers and run one typed action on all of them: update (M18), restart a service,
  pull a stack (M24), add a key (M25.1). Results come back per server, side by side.
- Write actions show the full list of servers and the action once, for one approval, and stop on the
  first failure if the owner asks.
- **Terminal broadcast:** type once into several Terminal windows. This is the owner's own typing,
  shown in every window, as MobaXterm does.

### M25.4 — A record you can keep

- Every change made from HeadlessOS (actions, edits, updates) is in the action audit log already.
  This adds an **Activity** view per server and for Fleet: what, when, which server, the result.
- **Export as a script:** a selection of the record exported as a POSIX shell script with each
  command's argv quoted as it ran, or as an Ansible playbook for the actions that map onto modules
  (`apt`, `systemd`, `copy`, `authorized_key`). The export is a starting point for the owner's own
  config management, and says so at the top.

## Security

- The lock-out guards above are the point of this phase: never remove the session's key, never turn
  off passwords without a key that has just been proven to work, and always restore on failure.
- Fleet actions are the same typed actions with one combined approval. The agents can propose them,
  and the owner approves them.
- Exports contain commands, never passwords, keys or `.env` values.

## What this can't do

- It can't help if the owner loses the only key, and it says to keep a second one before turning
  passwords off.
- The Ansible export covers common actions, not everything.

## Tasks

| ID | Task | Status |
|----|------|--------|
| M25.1 | SSH keys: list, add, remove (never the session's), make one here | ⬜ |
| M25.2 | Turn off password login with a proven key and a rollback | ⬜ |
| M25.3 | One action on many servers; terminal broadcast | ⬜ |
| M25.4 | Activity view; export as a shell script or an Ansible playbook | ⬜ |
| M25.5 | Version 0.11.0, the docs and the release | ⬜ |

## Checks

- Tests: the session key can't be removed; a failed second login restores `sshd`; the export quotes
  every argument as it ran.
- On two dev containers: add a key to both from Fleet, turn off passwords on one, and break the key
  on purpose to see the rollback.
