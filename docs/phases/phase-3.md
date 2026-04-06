# Phase 3: Docker + Processes + Services

> **Milestone:** M3 | **Duration:** Week 3 | **Status:** Not started
> **Prerequisites:** M2 complete (dashboard pattern established, file explorer working)
> **Definition of Done:** Can manage Docker containers, view processes, and control systemd services — all from the browser UI.

---

## Task 3.1: Docker App Backend

**Task ID:** `M3.1`
**File: `server/src/routes/docker.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/docker/containers` | List containers |
| GET | `/api/servers/:id/docker/images` | List images |
| POST | `/api/servers/:id/docker/containers/:cid/start` | Start container |
| POST | `/api/servers/:id/docker/containers/:cid/stop` | Stop container |
| POST | `/api/servers/:id/docker/containers/:cid/restart` | Restart container |
| DELETE | `/api/servers/:id/docker/containers/:cid` | Remove container |
| DELETE | `/api/servers/:id/docker/images/:iid` | Remove image |
| WS | `/ws/docker/:serverId/logs/:cid` | Stream container logs |

**Key: Docker supports JSON output natively!**
```bash
docker ps -a --format '{{json .}}'
docker images --format '{{json .}}'
```
→ NO LLM needed for Docker. Parse JSON directly.

**Verification:**
- [ ] Lists containers with correct state
- [ ] Can start/stop/restart containers
- [ ] Log streaming works via WebSocket
- [ ] Handles "docker not found" gracefully

---

## Task 3.2: Docker App Frontend

**Task ID:** `M3.2`
**Files:**
- `client/src/components/Docker/DockerView.tsx`
- `client/src/components/Docker/ContainerList.tsx`
- `client/src/components/Docker/ImageList.tsx`
- `client/src/components/Docker/LogViewer.tsx`

**Verification:**
- [ ] Containers listed with status indicators
- [ ] Start/Stop/Restart buttons work
- [ ] Log viewer shows real-time output
- [ ] Images tab shows Docker images

---

## Task 3.3: Docker Log Streaming

**Task ID:** `M3.3`
WebSocket-based real-time log tailing for containers.

**Verification:**
- [ ] Real-time log tailing in UI
- [ ] Can follow multiple containers simultaneously

---

## Task 3.4: Process Manager Backend

**Task ID:** `M3.4`
**File: `server/src/routes/processes.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/processes` | List processes (sorted by memory) |
| POST | `/api/servers/:id/processes/:pid/kill` | Kill a process |

**Command:** `ps aux --sort=-%mem` → LLM first, deterministic in Phase 4

**Verification:**
- [ ] Returns ProcessInfo[] sorted by memory
- [ ] Kill process works (with PID validation)

---

## Task 3.5: Process Manager Frontend

**Task ID:** `M3.5`
**Files:**
- `client/src/components/Processes/ProcessView.tsx`
- `client/src/components/Processes/ProcessTree.tsx`

Tree view with parent→child relationships + context menu (kill action).

**Verification:**
- [ ] Process tree renders correctly
- [ ] Context menu with kill action works

---

## Task 3.6: Services Manager (systemd)

**Task ID:** `M3.6`
**Files:**
- `server/src/routes/services.ts`
- `client/src/components/Services/ServiceView.tsx`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/services` | List systemd services |
| POST | `/api/servers/:id/services/:name/start` | Start service |
| POST | `/api/servers/:id/services/:name/stop` | Stop service |
| POST | `/api/servers/:id/services/:name/restart` | Restart service |

**Verification:**
- [ ] List services with active/inactive/failed states
- [ ] Start/stop/restart works
- [ ] Service name validation (alphanumeric + hyphen + underscore only)
