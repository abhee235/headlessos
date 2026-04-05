// M6.1: File Icon — rich multi-color SVG icons by file type
// @see docs/phases/phase-6.md

import type { FileEntryData } from '../../lib/api';

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

  return <FileSVG size={s.icon} category={category} ext={ext} className={className} style={style} />;
}

// ── Desktop App Icons ───────────────────────────────────

export function DashboardIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#dash-bg)" />
      <rect x="6" y="8" width="16" height="12" rx="3" fill="white" fillOpacity="0.25" />
      <rect x="26" y="8" width="16" height="12" rx="3" fill="white" fillOpacity="0.2" />
      <rect x="6" y="24" width="10" height="18" rx="3" fill="white" fillOpacity="0.3" />
      <rect x="19" y="24" width="10" height="18" rx="3" fill="white" fillOpacity="0.2" />
      <rect x="32" y="24" width="10" height="12" rx="3" fill="white" fillOpacity="0.25" />
      <rect x="32" y="39" width="10" height="3" rx="1.5" fill="white" fillOpacity="0.15" />
      <defs>
        <linearGradient id="dash-bg" x1="2" y1="2" x2="46" y2="46">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function FileExplorerIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Folder back */}
      <path d="M4 14C4 11.79 5.79 10 8 10H18L22 14H40C42.21 14 44 15.79 44 18V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V14Z" fill="url(#folder-back)" />
      {/* Folder front */}
      <path d="M4 20C4 18.34 5.34 17 7 17H41C42.66 17 44 18.34 44 20V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V20Z" fill="url(#folder-front)" />
      {/* Shine */}
      <path d="M4 20C4 18.34 5.34 17 7 17H41C42.66 17 44 18.34 44 20V22H4V20Z" fill="white" fillOpacity="0.15" />
      <defs>
        <linearGradient id="folder-back" x1="4" y1="10" x2="44" y2="42">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="folder-front" x1="4" y1="17" x2="44" y2="42">
          <stop stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TerminalIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="5" width="44" height="38" rx="8" fill="url(#term-bg)" />
      {/* Title bar dots */}
      <circle cx="10" cy="12" r="2" fill="#ef4444" fillOpacity="0.8" />
      <circle cx="17" cy="12" r="2" fill="#eab308" fillOpacity="0.8" />
      <circle cx="24" cy="12" r="2" fill="#22c55e" fillOpacity="0.8" />
      {/* Prompt */}
      <path d="M10 22L16 27L10 32" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="20" y1="32" x2="34" y2="32" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
      {/* Cursor blink */}
      <rect x="36" y="29" width="2" height="6" rx="1" fill="#4ade80" fillOpacity="0.8" />
      <defs>
        <linearGradient id="term-bg" x1="2" y1="5" x2="46" y2="43">
          <stop stopColor="#1a1a2e" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ThisPCIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Monitor */}
      <rect x="4" y="4" width="40" height="28" rx="4" fill="url(#pc-frame)" />
      <rect x="7" y="7" width="34" height="22" rx="2" fill="#1e293b" />
      {/* Screen content */}
      <rect x="10" y="10" width="12" height="8" rx="1" fill="#3b82f6" fillOpacity="0.4" />
      <rect x="25" y="10" width="12" height="4" rx="1" fill="#22c55e" fillOpacity="0.3" />
      <rect x="25" y="16" width="8" height="2" rx="0.5" fill="#94a3b8" fillOpacity="0.3" />
      <rect x="10" y="21" width="27" height="2" rx="0.5" fill="#94a3b8" fillOpacity="0.2" />
      <rect x="10" y="25" width="20" height="2" rx="0.5" fill="#94a3b8" fillOpacity="0.15" />
      {/* Stand */}
      <path d="M18 34H30L32 40H16L18 34Z" fill="url(#pc-stand)" />
      <rect x="14" y="40" width="20" height="3" rx="1.5" fill="#64748b" />
      <defs>
        <linearGradient id="pc-frame" x1="4" y1="4" x2="44" y2="32">
          <stop stopColor="#475569" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="pc-stand" x1="18" y1="34" x2="30" y2="40">
          <stop stopColor="#64748b" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Folder SVG (used in File Explorer) ──────────────────

export function FolderSVG({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M4 14C4 11.79 5.79 10 8 10H18L22 14H40C42.21 14 44 15.79 44 18V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V14Z" fill="url(#fld-back)" />
      <path d="M4 20C4 18.34 5.34 17 7 17H41C42.66 17 44 18.34 44 20V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V20Z" fill="url(#fld-front)" />
      <path d="M4 20C4 18.34 5.34 17 7 17H41C42.66 17 44 18.34 44 20V22H4V20Z" fill="white" fillOpacity="0.12" />
      <defs>
        <linearGradient id="fld-back" x1="4" y1="10" x2="44" y2="42">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="fld-front" x1="4" y1="17" x2="44" y2="42">
          <stop stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
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
