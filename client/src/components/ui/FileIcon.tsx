// M6.1: File Icon — app icons + file type icons
// EX8.2: LumenOS v3 — app, folder and common file icons are the Fluent SVGs in
// client/public/icons/fluent (see LICENSE.txt there).
// EX8.19: Services, AI Agent, UI Agent and Observatory use Fluent 2 colour icons
// from @fluentui/react-icons (the family of sysdash/activity/settings), replacing
// the drawn squircles; the Docker whale is drawn in the label colour.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import type { FileEntryData } from '../../lib/api';
import {
  ArrowClockwiseDashesSettingsColor,
  BotSparkleColor,
  ChartMultipleColor,
  DesignIdeasColor,
  type FluentIcon as FluentIconComponent,
} from '@fluentui/react-icons';

// ── Fluent SVG icons (client/public/icons/fluent) ──────────────────

export type FluentIconName =
  | 'activity' | 'audio' | 'browser' | 'calc' | 'desktop' | 'dl' | 'docs' | 'files'
  | 'folder' | 'home' | 'img' | 'music' | 'notes' | 'package' | 'pdf' | 'photos'
  | 'pics' | 'serveradmin' | 'settings' | 'sysdash' | 'terminal' | 'trash'
  | 'trashfull' | 'txt';

/**
 * URL of a Fluent icon. Relative on purpose: Vite's `base: './'` and the
 * router-less app mean it resolves next to index.html in dev and under
 * Electron's file:// build alike.
 */
export function fluentIconUrl(name: FluentIconName): string {
  return `icons/fluent/${name}.svg`;
}

export function FluentIcon({ name, size, className, style }: {
  name: FluentIconName; size: number; className?: string; style?: React.CSSProperties;
}) {
  return (
    <img
      src={fluentIconUrl(name)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={className}
      style={{ flexShrink: 0, objectFit: 'contain', ...style }}
    />
  );
}

interface FileIconProps {
  entry?: FileEntryData;
  type?: 'directory' | 'file' | 'symlink';
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: React.CSSProperties;
}

const SIZES = {
  sm: { icon: 16, font: 7 },
  md: { icon: 28, font: 10 },
  lg: { icon: 40, font: 12 },
  xl: { icon: 56, font: 14 },
};

export function FileIcon({ entry, type, name, size = 'md', className = '', style }: FileIconProps) {
  const fileType = entry?.type ?? type ?? 'file';
  const fileName = entry?.name ?? name ?? '';
  const s = SIZES[size];

  if (fileType === 'directory') {
    return <FolderSVG size={s.icon} className={className} style={style} />;
  }
  if (fileType === 'symlink') {
    return <SymlinkSVG size={s.icon} className={className} style={style} />;
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const category = getFileCategory(ext);
  const fluent = fluentFileIcon(ext, category);
  if (fluent) return <FluentIcon name={fluent} size={s.icon} className={className} style={style} />;

  return <FileSVG size={s.icon} category={category} ext={ext} className={className} style={style} />;
}

// ── EX8.19: Fluent 2 colour app icons (@fluentui/react-icons, MIT) ─────────

function FluentColorIcon({ Icon, size }: { Icon: FluentIconComponent; size: number }) {
  return <Icon aria-hidden style={{ fontSize: size, width: size, height: size, flexShrink: 0 }} />;
}

export function DashboardIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="sysdash" size={size} />;
}

export function FileExplorerIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="files" size={size} />;
}

export function TerminalIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="terminal" size={size} />;
}

export function ThisPCIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="desktop" size={size} />;
}

/** The real Docker whale (public/icons/brands/docker.svg, see LICENSE.txt there) */
/** EX8.19: the whale as a mask in the label colour (white in dark mode, as asked) */
export function DockerIcon({ size = 48 }: { size?: number }) {
  const mask = 'url(icons/brands/docker.svg) center / contain no-repeat';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block', flexShrink: 0, width: size, height: size,
        backgroundColor: 'var(--lumen-label)', mask, WebkitMask: mask,
      }}
    />
  );
}

export function TaskManagerIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="activity" size={size} />;
}

export function ServicesIcon({ size = 48 }: { size?: number }) {
  return <FluentColorIcon Icon={ArrowClockwiseDashesSettingsColor} size={size} />;
}

export function SettingsIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="settings" size={size} />;
}

export function ServerAdminIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="serveradmin" size={size} />;
}

export function FleetIcon({ size = 48 }: { size?: number }) {
  return <FluentIcon name="browser" size={size} />;
}

export function AgentIcon({ size = 48 }: { size?: number }) {
  return <FluentColorIcon Icon={BotSparkleColor} size={size} />;
}

export function UIAgentIcon({ size = 48 }: { size?: number }) {
  return <FluentColorIcon Icon={DesignIdeasColor} size={size} />;
}

export function ObservatoryIcon({ size = 48 }: { size?: number }) {
  return <FluentColorIcon Icon={ChartMultipleColor} size={size} />;
}

export function RecycleBinIcon({ size = 48, full = false }: { size?: number; full?: boolean }) {
  return <FluentIcon name={full ? 'trashfull' : 'trash'} size={size} />;
}

// ── Folder SVG (used in File Explorer) ──────────────────

export function FolderSVG({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  return <FluentIcon name="folder" size={size} className={className} style={style} />;
}

// ── Symlink SVG ─────────────────────────────────────────

function SymlinkSVG({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* Base file shape */}
      <path d="M12 4H30L38 12V40C38 42.21 36.21 44 34 44H12C9.79 44 8 42.21 8 40V8C8 5.79 9.79 4 12 4Z" fill="#94a3b8" />
      <path d="M30 4L38 12H34C31.79 12 30 10.21 30 8V4Z" fill="#cbd5e1" />
      {/* Link icon overlay */}
      <circle cx="34" cy="34" r="10" fill="#06b6d4" />
      <path d="M31 31L37 37M37 31L31 37" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Generic File SVG ────────────────────────────────────

type FileCategory =
  | 'code' | 'config' | 'image' | 'archive' | 'audio' | 'video'
  | 'document' | 'spreadsheet' | 'database' | 'font' | 'executable' | 'generic';

function FileSVG({ size, category, ext, className, style }: { size: number; category: FileCategory; ext: string; className?: string; style?: React.CSSProperties }) {
  const colors = FILE_COLORS[category];

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      {/* File body */}
      <path d="M12 4H30L38 12V40C38 42.21 36.21 44 34 44H12C9.79 44 8 42.21 8 40V8C8 5.79 9.79 4 12 4Z" fill={colors.body} />
      {/* Dog-ear fold */}
      <path d="M30 4L38 12H34C31.79 12 30 10.21 30 8V4Z" fill={colors.fold} />
      {/* Extension badge */}
      {ext && (
        <g>
          <rect x="16" y="26" width={Math.min(ext.length * 6 + 8, 22)} height="12" rx="3" fill={colors.badge} />
          <text
            x={16 + Math.min(ext.length * 6 + 8, 22) / 2}
            y="34.5"
            textAnchor="middle"
            fill="white"
            fontSize="7"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            {ext.toUpperCase().slice(0, 3)}
          </text>
        </g>
      )}
      {/* Category icon overlay */}
      {category === 'code' && (
        <g>
          <path d="M17 18L14 21L17 24" stroke={colors.badge} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M25 18L28 21L25 24" stroke={colors.badge} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="22.5" y1="17" x2="19.5" y2="25" stroke={colors.badge} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}
      {category === 'image' && (
        <g>
          <circle cx="17" cy="18" r="2.5" fill={colors.badge} fillOpacity="0.6" />
          <path d="M14 24L18 20L22 24L26 19L30 24" stroke={colors.badge} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fillOpacity="0" />
        </g>
      )}
      {category === 'audio' && (
        <g>
          <path d="M19 16V24M22 18V22M25 15V25M28 17V23" stroke={colors.badge} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
      {category === 'video' && (
        <g>
          <path d="M18 17L28 21L18 25Z" fill={colors.badge} fillOpacity="0.7" />
        </g>
      )}
    </svg>
  );
}

// ── Color themes per category ───────────────────────────

const FILE_COLORS: Record<FileCategory, { body: string; fold: string; badge: string }> = {
  code:        { body: '#d1fae5', fold: '#6ee7b7', badge: '#059669' },
  config:      { body: '#fef3c7', fold: '#fcd34d', badge: '#b45309' },
  image:       { body: '#ede9fe', fold: '#c4b5fd', badge: '#7c3aed' },
  archive:     { body: '#ffedd5', fold: '#fdba74', badge: '#c2410c' },
  audio:       { body: '#fce7f3', fold: '#f9a8d4', badge: '#be185d' },
  video:       { body: '#dbeafe', fold: '#93c5fd', badge: '#1d4ed8' },
  document:    { body: '#e2e8f0', fold: '#cbd5e1', badge: '#475569' },
  spreadsheet: { body: '#d1fae5', fold: '#86efac', badge: '#15803d' },
  database:    { body: '#e0e7ff', fold: '#a5b4fc', badge: '#4338ca' },
  font:        { body: '#f1f5f9', fold: '#e2e8f0', badge: '#64748b' },
  executable:  { body: '#fee2e2', fold: '#fca5a5', badge: '#dc2626' },
  generic:     { body: '#f1f5f9', fold: '#e2e8f0', badge: '#64748b' },
};

// ── Extension → Fluent icon (EX8.2) ─────────────────────
// Only types with a matching Fluent icon; the rest keep the badge SVG,
// whose extension label is more useful for code and config files.

function fluentFileIcon(ext: string, category: FileCategory): FluentIconName | null {
  if (ext === 'pdf') return 'pdf';
  if (['txt', 'md', 'log', 'rtf'].includes(ext)) return 'txt';
  if (category === 'image') return 'img';
  if (category === 'audio') return 'audio';
  if (category === 'archive') return 'package';
  return null;
}

// ── Extension → Category mapping ────────────────────────

function getFileCategory(ext: string): FileCategory {
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'java', 'kt', 'swift', 'sh', 'bash', 'zsh', 'ps1', 'lua', 'r', 'php', 'cs', 'scala', 'dart', 'vue', 'svelte'].includes(ext)) return 'code';
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf', 'env', 'service', 'nginx', 'dockerfile', 'editorconfig', 'gitignore', 'eslintrc', 'prettierrc'].includes(ext)) return 'config';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'psd', 'ai'].includes(ext)) return 'image';
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'deb', 'rpm', 'dmg', 'iso'].includes(ext)) return 'archive';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext)) return 'audio';
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v'].includes(ext)) return 'video';
  if (['doc', 'docx', 'pdf', 'txt', 'md', 'rtf', 'odt', 'tex', 'log', 'csv'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'ods', 'numbers'].includes(ext)) return 'spreadsheet';
  if (['db', 'sqlite', 'sql', 'mdb'].includes(ext)) return 'database';
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) return 'font';
  if (['exe', 'msi', 'bin', 'app', 'apk', 'appimage'].includes(ext)) return 'executable';
  return 'generic';
}

// ── AppIcon: appId → picture icon (EX8.3) ───────────────
// One lookup for window title bars, the dock, the launcher and desktop icons.

const APP_ICON_COMPONENTS: Record<string, React.ComponentType<{ size?: number }>> = {
  dashboard: DashboardIcon,
  files: FileExplorerIcon,
  'container-files': FileExplorerIcon,
  terminal: TerminalIcon,
  'container-shell': TerminalIcon,
  docker: DockerIcon,
  services: ServicesIcon,
  taskmanager: TaskManagerIcon,
  settings: SettingsIcon,
  serveradmin: ServerAdminIcon,
  fleet: FleetIcon,
  agent: AgentIcon,
  'ui-agent': UIAgentIcon,
  'dynamic-ui': UIAgentIcon,
  observatory: ObservatoryIcon,
};

export function AppIcon({ appId, size = 48 }: { appId: string; size?: number }) {
  const Icon = APP_ICON_COMPONENTS[appId] ?? DashboardIcon;
  return <Icon size={size} />;
}
