# Phase 0: Project Scaffolding

> **Milestone:** M0 | **Duration:** Day 1-2 | **Status:** Not started
> **Prerequisites:** None — this is the foundation
> **Definition of Done:** `npm run dev` starts both server (port 3001) and client (port 3000). Browser shows a React page. Server responds to health check.

---

## Task 0.1: Initialize Monorepo

**Task ID:** `M0.1`
**Files to create:**
```
headlessOS/
├── package.json               # workspace root
├── tsconfig.base.json         # shared TS config
├── .gitignore
├── .env.example
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts           # "Hello world" Fastify server
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       └── App.tsx            # "Hello world" React app
└── shared/
    ├── package.json
    └── types.ts               # Shared type definitions
```

**Root `package.json`:**
```json
{
  "name": "headlessos",
  "private": true,
  "workspaces": ["server", "client", "shared"],
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "build": "npm run build --workspace=server && npm run build --workspace=client",
    "test": "npm test --workspace=server"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.6.0"
  }
}
```

**Server `package.json` dependencies:**
```json
{
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "ssh2": "^1.17.0",
    "openai": "^5.0.0",
    "zod": "^3.24.0",
    "zod-to-json-schema": "^3.24.0",
    "strip-ansi": "^7.1.0",
    "nanoid": "^5.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/ssh2": "^1.15.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

**Client `package.json` dependencies:**
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-attach": "^0.12.0",
    "lucide-react": "^0.468.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vite": "^6.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

**Verification:**
- [ ] `npm install` succeeds from root
- [ ] `npm run dev` starts both server (port 3001) and client (port 3000)
- [ ] Browser shows React app at `localhost:3000`
- [ ] Server responds to `GET /health` at `localhost:3001`

---

## Task 0.2: Service Container (Foundation)

**Task ID:** `M0.2`
> **Ref:** [ADR-011](../DECISIONS.md#adr-011-service-container-pattern), [ARCHITECTURE.md § Pattern 1](../ARCHITECTURE.md#pattern-1-service-container-adopt-in-phase-0-1)

**Files to create:**
```
server/src/services/
├── base-service.ts       # Abstract base class with construct/init/destroy lifecycle
└── container.ts          # ServiceContainer — registry + two-phase boot
```

**BaseService contract:**
```typescript
export abstract class BaseService {
  protected services!: ServiceContainer;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async construct(services: ServiceContainer): Promise<void> {
    this.services = services;
    await this._construct();
  }

  async init(): Promise<void> {
    await this._init();
  }

  async destroy(): Promise<void> {
    await this._destroy();
  }

  protected async _construct(): Promise<void> {}
  protected async _init(): Promise<void> {}
  protected async _destroy(): Promise<void> {}
}
```

**ServiceContainer contract:**
```typescript
export class ServiceContainer {
  private instances = new Map<string, BaseService>();

  register(name: string, service: BaseService): void;
  get<T extends BaseService>(name: string): T;

  /** Two-phase boot: construct all → init all */
  async boot(): Promise<void>;

  /** Reverse-order shutdown */
  async shutdown(): Promise<void>;
}
```

**Boot order (registered in this sequence):**
1. `config` — ConfigService (reads `~/.headlessos/config.json`)
2. `ssh` — SSHConnectionManager
3. `llm` — LLMProviderService (needs config for API keys)
4. `parser` — ParsingPipelineService (needs LLM provider)
5. `apps` — AppRegistry (needs parser + SSH)

**Why this is Task 0.2 (not later):**
Every module built in Phase 1+ registers as a service. Building the container first means Phase 1 code (`ConnectionManager`, `LLMProvider`, `ParsingPipeline`) is written as services from day one — no refactoring later.

**Verification:**
- [ ] `ServiceContainer.boot()` calls `construct()` then `init()` in registration order
- [ ] `ServiceContainer.shutdown()` calls `destroy()` in reverse order
- [ ] `container.get('nonexistent')` throws descriptive error
- [ ] Services can access each other in `_init()` (not in `_construct()`)

---

## Task 0.3: Shared Types

**Task ID:** `M0.3`
**File: `shared/types.ts`**

```typescript
// ============================================
// Server Configuration
// ============================================

export interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'privateKey' | 'agent';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  serverId: string;
  status: ConnectionStatus;
  error?: string;
  connectedAt?: string;       // ISO string
  detectedTools?: string[];
}

// ============================================
// App System
// ============================================

export interface AppDefinition {
  id: string;
  name: string;
  icon: string;                 // lucide icon name
  description: string;
  requiredTools: string[];      // e.g., ['docker'] — app hidden if tool missing
  refreshInterval?: number;     // auto-poll interval in ms
}

// ============================================
// Parsed Data Types
// ============================================

export interface SystemInfo {
  hostname: string;
  uptime: string;
  os: string;
  kernel: string;
  architecture: string;
}

export interface DiskUsage {
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountPoint: string;
}

export interface MemoryInfo {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  availableMb: number;
  swapTotalMb: number;
  swapUsedMb: number;
}

export interface NetworkInterface {
  name: string;
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  ipAddresses: string[];
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  permissions: string;
  owner: string;
  group: string;
  size: number;
  modified: string;
  symlinkTarget?: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
  ports: string;
  created: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  cpuPercent: number;
  memPercent: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  startTime: string;
  command: string;
}

export interface ServiceInfo {
  name: string;
  loadState: 'loaded' | 'not-found' | 'masked';
  activeState: 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating';
  subState: string;
  description: string;
}

// ============================================
// API Response Wrappers
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  parsedBy: 'deterministic' | 'llm';
  latencyMs: number;
}

export interface SystemDashboard {
  system: SystemInfo;
  disks: DiskUsage[];
  memory: MemoryInfo;
  network: NetworkInterface[];
}
```

**Verification:**
- [ ] Types compile without errors
- [ ] Both server and client can import from shared

---

## Task 0.4: Fastify Server Setup

**Task ID:** `M0.4`
**File: `server/src/index.ts`**

Minimal Fastify server with health check, CORS, and WebSocket support. Registers the ServiceContainer and boots all services.

**Verification:**
- [ ] `GET /health` returns `{ status: 'ok' }`
- [ ] CORS allows `localhost:3000`

---

## Task 0.5: React + Vite + Tailwind Setup

**Task ID:** `M0.5`
**Files: `client/src/main.tsx`, `client/src/App.tsx`, `client/vite.config.ts`**

Minimal React 19 app with TailwindCSS 4 and API proxy to backend.

**Verification:**
- [ ] Browser shows React app at `localhost:3000`
- [ ] TailwindCSS classes work
- [ ] Vite proxy forwards `/api/*` to `localhost:3001`

---

## Task 0.6: Dev Script

**Task ID:** `M0.6`
**File: root `package.json` scripts**

`npm run dev` starts both server and client via `concurrently`.

**Verification:**
- [ ] Single command starts everything
- [ ] Both processes have colored output labels
