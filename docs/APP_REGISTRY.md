# App Registry

> How apps work in HeadlessOS, the app definition schema, and how to add new apps.

## Concept

An "app" in HeadlessOS is a module that transforms a set of Linux commands into a visual interface. Each app:

1. **Declares** which server tools it needs (e.g., `docker`, `systemctl`)
2. **Defines** the commands to run and the schema of their parsed output
3. **Renders** the parsed data using React components
4. **Exposes actions** (buttons) that trigger server-side commands

Apps are discovered automatically based on what tools are detected on the connected server.

## App Definition Schema

Every app is defined by an `AppManifest`:

```typescript
interface AppManifest {
  // ============ Identity ============
  id: string;                        // unique identifier, e.g., "docker"
  name: string;                      // display name, e.g., "Docker"
  description: string;               // short description
  icon: string;                      // lucide-react icon name, e.g., "container"
  category: 'system' | 'devops' | 'monitoring' | 'files';

  // ============ Requirements ============
  requiredTools: string[];           // e.g., ["docker"] — checked via `which`
  minToolVersion?: Record<string, string>;  // optional version requirements

  // ============ Views ============
  views: AppView[];                  // one or more data views

  // ============ Behavior ============
  refreshInterval?: number;          // auto-poll interval in ms (0 = manual only)
  showInSidebar: boolean;            // always true for built-in apps
}

interface AppView {
  id: string;                        // e.g., "containers", "images"
  name: string;                      // display name for tab/section
  command: CommandDefinition;        // how to get data
  schema: string;                    // reference to Zod schema name
  renderer: 'table' | 'cards' | 'tree' | 'custom';
  columns?: ColumnDefinition[];      // for table renderer
  actions?: ActionDefinition[];      // row-level actions
  emptyMessage?: string;             // shown when no data
}

interface CommandDefinition {
  exec: string;                      // the command template
  parseMode: 'json' | 'llm' | 'deterministic' | 'auto';
  // 'json' = command outputs JSON directly (e.g., docker --format '{{json .}}')
  // 'llm' = always use LLM to parse
  // 'deterministic' = use registered regex parser
  // 'auto' = try deterministic first, fall back to LLM
  timeout?: number;                  // command timeout in ms (default 30000)
}

interface ColumnDefinition {
  key: string;                       // field name in parsed data
  label: string;                     // display header
  type: 'text' | 'number' | 'badge' | 'date' | 'bytes' | 'percent';
  sortable?: boolean;
  width?: string;                    // CSS width, e.g., "200px" or "20%"
  badgeColors?: Record<string, string>;  // for 'badge' type, e.g., { running: "green" }
}

interface ActionDefinition {
  id: string;                        // e.g., "stop"
  label: string;                     // button text
  icon?: string;                     // lucide icon
  command: string;                   // command template with {placeholders}
  confirm?: boolean;                 // require confirmation dialog
  confirmMessage?: string;           // custom confirmation message
  variant: 'default' | 'danger';    // button style
  requiredState?: Record<string, unknown>;  // only show when row matches
}
```

## Built-in Apps

### System Dashboard

```typescript
const systemApp: AppManifest = {
  id: 'system',
  name: 'System',
  description: 'Server overview — hostname, uptime, disk, memory, network',
  icon: 'monitor',
  category: 'system',
  requiredTools: [],                 // always available
  showInSidebar: true,
  refreshInterval: 30000,
  views: [
    {
      id: 'overview',
      name: 'Overview',
      command: {
        // This view runs multiple commands — handled specially by backend
        exec: '__MULTI__',           // sentinel: backend knows to run multiple commands
        parseMode: 'auto',
      },
      schema: 'SystemDashboard',
      renderer: 'cards',
    },
    {
      id: 'disk',
      name: 'Disk Usage',
      command: {
        exec: 'df -h --output=source,fstype,size,used,avail,pcent,target',
        parseMode: 'auto',
      },
      schema: 'DiskUsageArray',
      renderer: 'table',
      columns: [
        { key: 'filesystem', label: 'Filesystem', type: 'text', sortable: true },
        { key: 'size', label: 'Size', type: 'text' },
        { key: 'used', label: 'Used', type: 'text' },
        { key: 'available', label: 'Available', type: 'text' },
        { key: 'usePercent', label: 'Use%', type: 'percent', sortable: true },
        { key: 'mountPoint', label: 'Mount', type: 'text' },
      ],
    },
  ],
};
```

### File Explorer

```typescript
const filesApp: AppManifest = {
  id: 'files',
  name: 'Files',
  description: 'Browse and manage files on the server',
  icon: 'folder',
  category: 'files',
  requiredTools: [],                 // always available
  showInSidebar: true,
  refreshInterval: 0,               // manual refresh only
  views: [
    {
      id: 'browser',
      name: 'File Browser',
      command: {
        exec: 'ls -la --time-style=long-iso {path}',
        parseMode: 'auto',
      },
      schema: 'FileEntryArray',
      renderer: 'custom',           // uses custom FileExplorer component
      actions: [
        {
          id: 'delete',
          label: 'Delete',
          icon: 'trash-2',
          command: 'rm -rf {path}',
          confirm: true,
          confirmMessage: 'Delete {name}? This cannot be undone.',
          variant: 'danger',
        },
        {
          id: 'rename',
          label: 'Rename',
          icon: 'pencil',
          command: 'mv {oldPath} {newPath}',
          variant: 'default',
        },
      ],
    },
  ],
};
```

### Docker

```typescript
const dockerApp: AppManifest = {
  id: 'docker',
  name: 'Docker',
  description: 'Manage containers, images, volumes, and networks',
  icon: 'container',
  category: 'devops',
  requiredTools: ['docker'],
  showInSidebar: true,
  refreshInterval: 10000,
  views: [
    {
      id: 'containers',
      name: 'Containers',
      command: {
        exec: "docker ps -a --format '{{json .}}'",
        parseMode: 'json',          // Docker outputs JSON — no LLM needed!
      },
      schema: 'DockerContainerArray',
      renderer: 'table',
      columns: [
        { key: 'name', label: 'Name', type: 'text', sortable: true },
        { key: 'image', label: 'Image', type: 'text' },
        {
          key: 'state', label: 'State', type: 'badge', sortable: true,
          badgeColors: {
            running: 'green',
            exited: 'red',
            paused: 'yellow',
            restarting: 'blue',
          },
        },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'ports', label: 'Ports', type: 'text' },
      ],
      actions: [
        {
          id: 'start',
          label: 'Start',
          icon: 'play',
          command: 'docker start {id}',
          variant: 'default',
          requiredState: { state: 'exited' },
        },
        {
          id: 'stop',
          label: 'Stop',
          icon: 'square',
          command: 'docker stop {id}',
          confirm: true,
          variant: 'danger',
          requiredState: { state: 'running' },
        },
        {
          id: 'restart',
          label: 'Restart',
          icon: 'refresh-cw',
          command: 'docker restart {id}',
          variant: 'default',
          requiredState: { state: 'running' },
        },
        {
          id: 'remove',
          label: 'Remove',
          icon: 'trash-2',
          command: 'docker rm {id}',
          confirm: true,
          confirmMessage: 'Remove container {name}?',
          variant: 'danger',
          requiredState: { state: 'exited' },
        },
        {
          id: 'logs',
          label: 'Logs',
          icon: 'file-text',
          command: 'docker logs --tail 200 {id}',
          variant: 'default',
        },
      ],
      emptyMessage: 'No Docker containers found',
    },
    {
      id: 'images',
      name: 'Images',
      command: {
        exec: "docker images --format '{{json .}}'",
        parseMode: 'json',
      },
      schema: 'DockerImageArray',
      renderer: 'table',
      columns: [
        { key: 'repository', label: 'Repository', type: 'text', sortable: true },
        { key: 'tag', label: 'Tag', type: 'text' },
        { key: 'size', label: 'Size', type: 'text', sortable: true },
        { key: 'created', label: 'Created', type: 'text' },
      ],
      actions: [
        {
          id: 'remove',
          label: 'Remove',
          icon: 'trash-2',
          command: 'docker rmi {id}',
          confirm: true,
          variant: 'danger',
        },
      ],
    },
  ],
};
```

### Process Manager

```typescript
const processesApp: AppManifest = {
  id: 'processes',
  name: 'Processes',
  description: 'View and manage running processes',
  icon: 'activity',
  category: 'system',
  requiredTools: [],                 // ps is always available
  showInSidebar: true,
  refreshInterval: 15000,
  views: [
    {
      id: 'list',
      name: 'Process List',
      command: {
        exec: 'ps aux --sort=-%mem',
        parseMode: 'auto',
      },
      schema: 'ProcessInfoArray',
      renderer: 'table',
      columns: [
        { key: 'pid', label: 'PID', type: 'number', sortable: true },
        { key: 'user', label: 'User', type: 'text', sortable: true },
        { key: 'cpuPercent', label: 'CPU%', type: 'percent', sortable: true },
        { key: 'memPercent', label: 'MEM%', type: 'percent', sortable: true },
        { key: 'rss', label: 'RSS (KB)', type: 'number', sortable: true },
        { key: 'command', label: 'Command', type: 'text' },
      ],
      actions: [
        {
          id: 'kill',
          label: 'Kill',
          icon: 'x-circle',
          command: 'kill -9 {pid}',
          confirm: true,
          confirmMessage: 'Kill process {pid} ({command})?',
          variant: 'danger',
        },
      ],
    },
  ],
};
```

### Services (systemd)

```typescript
const servicesApp: AppManifest = {
  id: 'services',
  name: 'Services',
  description: 'Manage systemd services',
  icon: 'settings',
  category: 'system',
  requiredTools: ['systemctl'],
  showInSidebar: true,
  refreshInterval: 20000,
  views: [
    {
      id: 'list',
      name: 'Service List',
      command: {
        exec: 'systemctl list-units --type=service --all --no-pager --plain',
        parseMode: 'auto',
      },
      schema: 'ServiceInfoArray',
      renderer: 'table',
      columns: [
        { key: 'name', label: 'Service', type: 'text', sortable: true },
        {
          key: 'activeState', label: 'State', type: 'badge', sortable: true,
          badgeColors: { active: 'green', inactive: 'gray', failed: 'red' },
        },
        { key: 'subState', label: 'Sub-State', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
      ],
      actions: [
        { id: 'start', label: 'Start', icon: 'play', command: 'sudo systemctl start {name}', variant: 'default', requiredState: { activeState: 'inactive' } },
        { id: 'stop', label: 'Stop', icon: 'square', command: 'sudo systemctl stop {name}', confirm: true, variant: 'danger', requiredState: { activeState: 'active' } },
        { id: 'restart', label: 'Restart', icon: 'refresh-cw', command: 'sudo systemctl restart {name}', variant: 'default', requiredState: { activeState: 'active' } },
      ],
    },
  ],
};
```

### Server Admin

```typescript
const serverAdminApp: AppManifest = {
  id: 'serveradmin',
  name: 'Server Admin',
  description: 'Manage server networking, firewall, security, web server, packages, cron, logs, and storage',
  icon: 'shield',
  category: 'system',
  requiredTools: [],                 // always available — sections degrade gracefully
  showInSidebar: true,
  refreshInterval: 0,               // manual refresh per section
  views: [
    {
      id: 'network',
      name: 'Network',
      command: { exec: '__MULTI__', parseMode: 'auto' },  // ss -tlnp, ip route, /etc/resolv.conf, ss -tunap
      schema: 'NetworkInfo',
      renderer: 'custom',
    },
    {
      id: 'firewall',
      name: 'Firewall',
      command: { exec: 'ufw status numbered', parseMode: 'auto' },
      schema: 'FirewallStatus',
      renderer: 'custom',
      actions: [
        { id: 'add-rule', label: 'Add Rule', icon: 'plus', command: 'ufw {action} {port}/{proto}', variant: 'default' },
        { id: 'delete-rule', label: 'Delete Rule', icon: 'trash-2', command: 'ufw delete {num}', confirm: true, variant: 'danger' },
        { id: 'toggle', label: 'Toggle Firewall', icon: 'shield', command: 'ufw {enable|disable}', confirm: true, variant: 'default' },
      ],
    },
    {
      id: 'security',
      name: 'Security',
      command: { exec: '__MULTI__', parseMode: 'auto' },  // /etc/passwd, who, last, sshd_config
      schema: 'SecurityInfo',
      renderer: 'custom',
    },
    {
      id: 'webserver',
      name: 'Web Server',
      command: { exec: '__MULTI__', parseMode: 'auto' },  // nginx -T, sites, certbot
      schema: 'WebServerInfo',
      renderer: 'custom',
    },
    {
      id: 'packages',
      name: 'Packages',
      command: { exec: '__MULTI__', parseMode: 'auto' },  // apt list --upgradable, dpkg -l
      schema: 'PackageInfo',
      renderer: 'custom',
    },
    {
      id: 'cron',
      name: 'Cron Jobs',
      command: { exec: 'crontab -l', parseMode: 'auto' },
      schema: 'CronJobArray',
      renderer: 'table',
      columns: [
        { key: 'schedule', label: 'Schedule', type: 'text' },
        { key: 'command', label: 'Command', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
      ],
    },
    {
      id: 'logs',
      name: 'Logs',
      command: { exec: 'journalctl -n 100 --no-pager', parseMode: 'auto' },
      schema: 'LogEntryArray',
      renderer: 'custom',
    },
    {
      id: 'storage',
      name: 'Storage',
      command: { exec: '__MULTI__', parseMode: 'auto' },  // du, findmnt, swapon
      schema: 'StorageInfo',
      renderer: 'custom',
    },
  ],
};
```

## How to Add a New App

### Step-by-step:

1. **Create the manifest** in `server/src/apps/manifests/<appId>.ts`
2. **Create the Zod schema** in `server/src/parsers/schemas/<appId>.ts`
3. **Register the manifest** in `server/src/apps/registry.ts`
4. **(Optional) Write a deterministic parser** in `server/src/parsers/deterministic/<appId>.ts`
5. **Create the backend route** in `server/src/routes/<appId>.ts`
6. **Create the React component** in `client/src/components/<AppName>/`
7. **Register the component** in `client/src/apps/app-components.ts`

### Example: Adding a "Git" app

**1. Manifest** (`server/src/apps/manifests/git.ts`):
```typescript
export const gitApp: AppManifest = {
  id: 'git',
  name: 'Git',
  description: 'View Git repositories and recent commits',
  icon: 'git-branch',
  category: 'devops',
  requiredTools: ['git'],
  showInSidebar: true,
  refreshInterval: 0,
  views: [
    {
      id: 'repos',
      name: 'Repositories',
      command: {
        exec: "find /home -name '.git' -type d -maxdepth 4 2>/dev/null",
        parseMode: 'auto',
      },
      schema: 'GitRepoArray',
      renderer: 'table',
      columns: [
        { key: 'path', label: 'Repository', type: 'text' },
        { key: 'branch', label: 'Branch', type: 'text' },
        { key: 'lastCommit', label: 'Last Commit', type: 'text' },
      ],
    },
  ],
};
```

**2. Schema** (`server/src/parsers/schemas/git.ts`):
```typescript
import { z } from 'zod';

export const GitRepoSchema = z.object({
  path: z.string(),
  branch: z.string(),
  lastCommit: z.string(),
  lastCommitDate: z.string(),
  uncommittedChanges: z.number(),
});

export const GitRepoArraySchema = z.array(GitRepoSchema);
export type GitRepo = z.infer<typeof GitRepoSchema>;
```

**3-7.** Create route, component, register — follow existing app patterns.

## App Discovery Flow

```
1. User connects to server
2. Backend runs: which docker git python3 node systemctl nginx pm2 2>/dev/null
3. Backend checks each registered app's `requiredTools`
4. Only apps whose requirements are met are sent to frontend
5. Frontend sidebar shows only available apps
6. If a tool is installed later, user can refresh detection
```

## Future: Community App Registry

Eventually, apps could be distributed as npm packages:
```json
{
  "name": "headlessos-app-nginx",
  "headlessos": {
    "appId": "nginx",
    "manifest": "./manifest.json",
    "parser": "./parser.js",
    "component": "./NginxView.js"
  }
}
```

This is **post-MVP**. For now, all apps are built-in.
