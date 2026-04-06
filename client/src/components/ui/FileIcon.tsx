// M6.1: File Icon — Apple HIG-inspired app icons + file type icons
// @see docs/phases/phase-6.md

import type { FileEntryData } from '../../lib/api';
import {
  Gauge,
  Activity,
  Server,
  Palette,
  Shield,
  Globe,
  Bot,
} from 'lucide-react';

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

// ── Desktop App Icons (Apple HIG-inspired) ───────────────
// Design: "Embrace simplicity… express it with a minimal number of shapes.
// Prefer a simple background, such as a solid color or gradient, that puts
// emphasis on your primary design." — Apple Human Interface Guidelines
//
// Pattern: Gradient rounded-square background + centered Lucide glyph.
// Colors: Apple system color palette (400→600 Tailwind, sober tones).

/** Shared rounded-square base — subtle top-to-bottom gradient per Apple HIG */
function AppIconBase({ size, fromColor, toColor, children }: {
  size: number; fromColor: string; toColor: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      background: `linear-gradient(180deg, ${fromColor} 0%, ${toColor} 100%)`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxShadow: `0 ${Math.max(1, size * 0.04)}px ${Math.max(2, size * 0.08)}px rgba(0,0,0,0.15), inset 0 ${Math.max(1, size * 0.02)}px 0 rgba(255,255,255,0.15)`,
    }}>
      {children}
    </div>
  );
}

export function DashboardIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#60A5FA" toColor="#2563EB">
      <Gauge size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function FileExplorerIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Back panel */}
      <path d="M4 14C4 11.79 5.79 10 8 10H17.17C18.23 10 19.24 10.42 20 11.17L22.83 14H40C42.21 14 44 15.79 44 18V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V14Z" fill="url(#fex-back)" />
      {/* Front panel */}
      <path d="M3 21C3 19.34 4.34 18 6 18H42C43.66 18 45 19.34 45 21V38C45 40.76 42.76 43 40 43H8C5.24 43 3 40.76 3 38V21Z" fill="url(#fex-front)" />
      {/* Gloss strip */}
      <path d="M3 21C3 19.34 4.34 18 6 18H42C43.66 18 45 19.34 45 21V24H3V21Z" fill="white" fillOpacity="0.22" />
      {/* Bottom shadow */}
      <path d="M3 37V38C3 40.76 5.24 43 8 43H40C42.76 43 45 40.76 45 38V37C45 40 42.76 42 40 42H8C5.24 42 3 40 3 37Z" fill="black" fillOpacity="0.1" />
      <defs>
        <linearGradient id="fex-back" x1="24" y1="10" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d97706" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="fex-front" x1="24" y1="18" x2="24" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TerminalIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="2" y="4" width="44" height="40" rx="8" fill="url(#term-bg)" />
      <rect x="2" y="4" width="44" height="20" rx="8" fill="url(#term-gloss)" />
      {/* Traffic lights */}
      <circle cx="11" cy="12" r="2.5" fill="#ff5f57" />
      <circle cx="18" cy="12" r="2.5" fill="#febc2e" />
      <circle cx="25" cy="12" r="2.5" fill="#28c840" />
      {/* Bold chevron prompt */}
      <path d="M10 22L17 27.5L10 33" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Cursor line */}
      <rect x="21" y="30" width="14" height="3" rx="1.5" fill="#4ade80" fillOpacity="0.6" />
      {/* Blinking cursor */}
      <rect x="37" y="29" width="2.5" height="5" rx="1" fill="#4ade80" fillOpacity="0.9" />
      <defs>
        <linearGradient id="term-bg" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#232946" />
          <stop offset="0.5" stopColor="#1a1f3a" />
          <stop offset="1" stopColor="#0f1225" />
        </linearGradient>
        <linearGradient id="term-gloss" x1="24" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.08" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ThisPCIcon({ size = 48 }: { size?: number }) {
  const s = size;
  const p = (v: number) => (v / 48) * s; // proportional helper
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      {/* Screen body */}
      <rect x={p(7)} y={p(8)} width={p(34)} height={p(22)} rx={p(2.5)}
        fill="url(#thispc-screen)" stroke="#334155" strokeWidth={p(1.2)} />
      {/* Screen glass */}
      <rect x={p(9.5)} y={p(10.5)} width={p(29)} height={p(16.5)} rx={p(1.2)}
        fill="url(#thispc-glass)" />
      {/* Gloss highlight */}
      <rect x={p(9.5)} y={p(10.5)} width={p(29)} height={p(7)} rx={p(1.2)}
        fill="white" opacity={0.12} />
      {/* Stand neck */}
      <rect x={p(20)} y={p(30)} width={p(8)} height={p(5)} rx={p(0.5)}
        fill="#475569" />
      {/* Stand base */}
      <ellipse cx={p(24)} cy={p(37)} rx={p(10)} ry={p(2.2)}
        fill="#334155" />
      <ellipse cx={p(24)} cy={p(36.4)} rx={p(10)} ry={p(2.2)}
        fill="#64748B" />
      {/* Screen content: small desktop grid dots */}
      <rect x={p(13)} y={p(14)} width={p(4)} height={p(4)} rx={p(1)} fill="#60A5FA" opacity={0.85} />
      <rect x={p(19.5)} y={p(14)} width={p(4)} height={p(4)} rx={p(1)} fill="#34D399" opacity={0.85} />
      <rect x={p(26)} y={p(14)} width={p(4)} height={p(4)} rx={p(1)} fill="#FBBF24" opacity={0.85} />
      <rect x={p(13)} y={p(20.5)} width={p(4)} height={p(4)} rx={p(1)} fill="#F87171" opacity={0.85} />
      <rect x={p(19.5)} y={p(20.5)} width={p(4)} height={p(4)} rx={p(1)} fill="#A78BFA" opacity={0.85} />
      <rect x={p(26)} y={p(20.5)} width={p(4)} height={p(4)} rx={p(1)} fill="#38BDF8" opacity={0.85} />
      <defs>
        <linearGradient id="thispc-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="thispc-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DockerIcon({ size = 48 }: { size?: number }) {
  // Docker Moby logo (simple-icons, CC0). Original viewBox 0 0 24 24,
  // path bounds ~0,3.4 to 24,19.6 (width 24, height ~16.2). Center it.
  const scale = (size * 0.85) / 24; // fill 85% of the icon width
  const pathH = 16.2 * scale;
  const pathW = 24 * scale;
  const tx = (size - pathW) / 2;
  const ty = (size - pathH) / 2 - 3.4 * scale; // offset by path's top y
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <g transform={`translate(${tx.toFixed(1)}, ${ty.toFixed(1)}) scale(${scale.toFixed(3)})`}>
        <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z" fill="#2496ED"/>
      </g>
    </svg>
  );
}

export function TaskManagerIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#4ADE80" toColor="#16A34A">
      <Activity size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function ServicesIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#818CF8" toColor="#4F46E5">
      <Server size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function SettingsIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#F0ABFC" toColor="#C026D3">
      <Palette size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function ServerAdminIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#34D399" toColor="#059669">
      <Shield size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function FleetIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#38BDF8" toColor="#0369A1">
      <Globe size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

export function AgentIcon({ size = 48 }: { size?: number }) {
  const sw = size <= 24 ? 2.25 : 1.75;
  return (
    <AppIconBase size={size} fromColor="#A78BFA" toColor="#7C3AED">
      <Bot size={Math.round(size * 0.52)} color="white" strokeWidth={sw} />
    </AppIconBase>
  );
}

// ── Folder SVG (used in File Explorer) ──────────────────

export function FolderSVG({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} style={style}>
      <path d="M4 14C4 11.79 5.79 10 8 10H17.17C18.23 10 19.24 10.42 20 11.17L22.83 14H40C42.21 14 44 15.79 44 18V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V14Z" fill="url(#fld-back)" />
      <path d="M3 21C3 19.34 4.34 18 6 18H42C43.66 18 45 19.34 45 21V38C45 40.76 42.76 43 40 43H8C5.24 43 3 40.76 3 38V21Z" fill="url(#fld-front)" />
      <path d="M3 21C3 19.34 4.34 18 6 18H42C43.66 18 45 19.34 45 21V24H3V21Z" fill="white" fillOpacity="0.22" />
      <path d="M3 37V38C3 40.76 5.24 43 8 43H40C42.76 43 45 40.76 45 38V37C45 40 42.76 42 40 42H8C5.24 42 3 40 3 37Z" fill="black" fillOpacity="0.1" />
      <defs>
        <linearGradient id="fld-back" x1="24" y1="10" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d97706" />
          <stop offset="1" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="fld-front" x1="24" y1="18" x2="24" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
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
