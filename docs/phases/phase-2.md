# Phase 2: System Dashboard + File Explorer

> **Milestone:** M2 | **Duration:** Week 2 | **Status:** Not started
> **Prerequisites:** M1 complete (SSH, parsing pipeline, orchestrator, frontend shell)
> **Definition of Done:** Dashboard shows real server stats. File explorer lets you browse, open, create, rename, and delete files on the VPS.

---

## Task 2.1: System Dashboard Backend

**Task ID:** `M2.1`
**File: `server/src/routes/system.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/system` | Full system dashboard data |
| GET | `/api/servers/:id/system/disk` | Disk usage only |
| GET | `/api/servers/:id/system/memory` | Memory info only |

Uses orchestrator execution plan — 6 commands in parallel.

**Verification:**
- [ ] Returns valid SystemDashboard JSON
- [ ] Each field is correctly parsed
- [ ] Response includes `parsedBy` field for each section

---

## Task 2.2: System Dashboard Frontend

**Task ID:** `M2.2`
**Files:**
- `client/src/components/Dashboard/DashboardView.tsx`
- `client/src/components/Dashboard/DiskCard.tsx`
- `client/src/components/Dashboard/MemoryCard.tsx`
- `client/src/components/Dashboard/NetworkCard.tsx`
- `client/src/components/Dashboard/UptimeCard.tsx`

**Verification:**
- [ ] Dashboard loads and shows real server data
- [ ] Disk usage shows progress bars with percentages
- [ ] Memory shows used/total
- [ ] Auto-refreshes on configured interval

---

## Task 2.3: File Explorer Backend

**Task ID:** `M2.3`
**File: `server/src/routes/files.ts`**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers/:id/files?path=/` | List directory |
| GET | `/api/servers/:id/files/read?path=...` | Read file content |
| POST | `/api/servers/:id/files/mkdir` | Create directory |
| POST | `/api/servers/:id/files/rename` | Rename file/dir |
| DELETE | `/api/servers/:id/files?path=...` | Delete file/dir |
| POST | `/api/servers/:id/files/upload` | Upload file via SFTP |
| GET | `/api/servers/:id/files/download?path=...` | Download file |

**Implementation notes:**
- Directory listing: SFTP `readdir()` preferred (structured data, no LLM)
- File read/write: always via SFTP
- Path validation mandatory (see SECURITY.md)

**Verification:**
- [ ] Can list `/` directory
- [ ] Can read a text file
- [ ] Can create/rename/delete files
- [ ] Path traversal attacks blocked

---

## Task 2.4: File Explorer Frontend

**Task ID:** `M2.4`
**Files:**
- `client/src/components/FileExplorer/FileExplorerView.tsx`
- `client/src/components/FileExplorer/FileTree.tsx`
- `client/src/components/FileExplorer/FileList.tsx`
- `client/src/components/FileExplorer/FileActions.tsx`
- `client/src/components/FileExplorer/FileViewer.tsx`

**Features:** Left panel tree (lazy-loaded) + right panel file list + text viewer + context menus

**Verification:**
- [ ] Tree loads root directory on mount
- [ ] Double-click opens text file in viewer
- [ ] Can create, rename, delete files/folders
- [ ] Breadcrumb navigation works

---

## Task 2.5: File Operations (CRUD)

**Task ID:** `M2.5`
All CRUD operations wired end-to-end (backend SFTP + frontend actions + context menus).

**Verification:**
- [ ] Create file/folder works
- [ ] Rename works
- [ ] Delete with confirmation works
- [ ] Upload file works

---

## Task 2.6: Auto-Refresh for Dashboard

**Task ID:** `M2.6`
Backend-driven refresh interval (default 30s). Frontend displays "Last updated: Xs ago".

**Verification:**
- [ ] Dashboard updates every 30s
- [ ] Shows last-updated timestamp
