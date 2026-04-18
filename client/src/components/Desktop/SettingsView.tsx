// M7.4-M7.6: Settings — macOS System Settings–style settings window
// Sidebar navigation, wallpaper picker, appearance, general, terminal, notifications, about
// @see docs/phases/phase-7.md

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Paintbrush,
  Info,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  Monitor,
  TerminalSquare,
  Settings2,
  Bell,
  Keyboard,
  Brain,
  Puzzle,
} from 'lucide-react';
import { SHORTCUT_REFERENCE } from '../../hooks/useKeyboardShortcuts';
import { usePreferencesStore, ACCENT_PRESETS, type CursorStyle, type DateFormat, type ToastPosition } from '../../store/preferences-store';
import { useSessionsStore } from '../../store/sessions-store';
import { useEffectivePref, setPreferenceOverride, clearPreferenceOverride } from '../../store/effective-preferences';
import { useThemeStore, type Theme } from '../../store/theme-store';
import {
  BUILTIN_WALLPAPERS,
  fetchWallpapers,
  uploadWallpaper,
  deleteWallpaper,
  findWallpaper,
  type WallpaperDefinition,
  type ImageWallpaper,
} from './wallpapers';
import { WallpaperPreview } from './Wallpaper';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { toast } from 'sonner';
import { fetchLLMConfig, updateLLMConfig, fetchLLMModels, type LLMConfig, type LLMModelInfo } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type PageId = 'general' | 'appearance' | 'wallpaper' | 'terminal' | 'keyboard' | 'notifications' | 'ai' | 'plugins' | 'about';

interface SidebarEntry {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
}

const SIDEBAR: SidebarEntry[] = [
  {
    id: 'general',
    label: 'General',
    icon: <Settings2 size={14} className="text-white" />,
    iconBg: 'bg-muted-foreground',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Paintbrush size={14} className="text-white" />,
    iconBg: 'bg-primary',
  },
  {
    id: 'wallpaper',
    label: 'Wallpaper',
    icon: <Image size={14} className="text-white" />,
    iconBg: 'bg-primary/80',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: <TerminalSquare size={14} className="text-white" />,
    iconBg: 'bg-muted-foreground/80',
  },
  {
    id: 'keyboard',
    label: 'Keyboard Shortcuts',
    icon: <Keyboard size={14} className="text-white" />,
    iconBg: 'bg-warning',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={14} className="text-white" />,
    iconBg: 'bg-destructive',
  },
  {
    id: 'ai',
    label: 'AI / LLM',
    icon: <Brain size={14} className="text-white" />,
    iconBg: 'bg-primary/70',
  },
  {
    id: 'plugins',
    label: 'Plugins',
    icon: <Puzzle size={14} className="text-white" />,
    iconBg: 'bg-success',
  },
  {
    id: 'about',
    label: 'About',
    icon: <Info size={14} className="text-white" />,
    iconBg: 'bg-muted-foreground',
  },
];

// ─── Shared Primitives ───────────────────────────────────────────────────────

function GroupedCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

function GroupedRow({
  label,
  value,
  chevron,
  onClick,
  last,
}: {
  label: string;
  value?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  last?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'flex items-center justify-between w-full px-3 py-2 text-[13px]',
        !last && 'border-b border-border',
        onClick && 'hover:bg-accent cursor-pointer',
      )}
    >
      <span className="text-foreground">{label}</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        {value}
        {chevron && <ChevronRight size={14} />}
      </span>
    </Tag>
  );
}

function SectionHeader({
  title,
  count,
  showAll,
  onShowAll,
}: {
  title: string;
  count?: number;
  showAll?: boolean;
  onShowAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {showAll && count !== undefined && (
        <button
          onClick={onShowAll}
          className="text-[12px] text-primary hover:underline"
        >
          Show All ({count})
        </button>
      )}
    </div>
  );
}

// ─── Wallpaper Thumbnail ─────────────────────────────────────────────────────

function WallpaperThumb({
  wp,
  selected,
  onSelect,
  onDelete,
}: {
  wp: WallpaperDefinition;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col items-center shrink-0 gap-1.5"
    >
      <div
        className={cn(
          'relative w-30 h-19 rounded-lg overflow-hidden border-2 transition-all',
          selected
            ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
            : 'border-transparent hover:border-muted-foreground/30',
        )}
      >
        <WallpaperPreview wallpaper={wp} className="w-full h-full" />
        {/* Selected check */}
        {selected && (
          <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
            <Check size={12} className="text-white" />
          </div>
        )}
        {/* Delete on hover (user wallpapers only) */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
          >
            <Trash2 size={10} className="text-white" />
          </button>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground max-w-30 truncate">
        {wp.name}
      </span>
    </button>
  );
}

// ─── Horizontal scroll row ──────────────────────────────────────────────────

function ScrollRow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin"
      style={{ scrollbarWidth: 'thin' }}
    >
      {children}
    </div>
  );
}

// ─── Add Photo card ─────────────────────────────────────────────────────────

function AddPhotoCard({ onUpload }: { onUpload: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center shrink-0 gap-1.5"
      >
        <div className="w-30 h-19 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-accent transition-colors cursor-pointer">
          <Plus size={18} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Add Photo</span>
        </div>
        <span className="text-[11px] text-transparent">_</span>
      </button>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGES
// ═════════════════════════════════════════════════════════════════════════════

// ─── Wallpaper Page ─────────────────────────────────────────────────────────

function WallpaperPage() {
  // EX6-D.3: Per-session wallpaper override.
  // Read effective (override > global). Write target depends on scope toggle.
  const wallpaperId = useEffectivePref('wallpaperId');
  const globalWallpaperId = usePreferencesStore((s) => s.wallpaperId);
  const setGlobalWallpaperId = usePreferencesStore((s) => s.setWallpaperId);
  const activeServerId = useSessionsStore((s) => s.activeServerId);
  const sessionOverride = useSessionsStore((s) =>
    s.activeServerId ? s.sessions[s.activeServerId]?.preferenceOverrides.wallpaperId : undefined,
  );
  // Default scope: 'session' if there's an active server, else 'global'
  const [scope, setScope] = useState<'session' | 'global'>(activeServerId ? 'session' : 'global');
  // Force scope back to 'global' if no session
  useEffect(() => {
    if (!activeServerId) setScope('global');
  }, [activeServerId]);

  const setWallpaperId = useCallback(
    (id: string) => {
      if (scope === 'session' && activeServerId) {
        setPreferenceOverride('wallpaperId', id);
      } else {
        setGlobalWallpaperId(id);
      }
    },
    [scope, activeServerId, setGlobalWallpaperId],
  );
  const [systemWps, setSystemWps] = useState<ImageWallpaper[]>([]);
  const [userWps, setUserWps] = useState<ImageWallpaper[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetchWallpapers()
      .then(({ system, user }) => {
        setSystemWps(system);
        setUserWps(user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const allImages = [...systemWps, ...userWps];
  const allWallpapers: WallpaperDefinition[] = [...BUILTIN_WALLPAPERS, ...allImages];
  const currentWp = findWallpaper(wallpaperId, allImages);

  const handleUpload = async (file: File) => {
    try {
      const newWp = await uploadWallpaper(file);
      setUserWps((prev) => [...prev, newWp]);
      setWallpaperId(newWp.id);
    } catch {
      // toast could go here
    }
  };

  const handleDelete = async (wp: ImageWallpaper) => {
    try {
      await deleteWallpaper(wp.filename);
      setUserWps((prev) => prev.filter((u) => u.id !== wp.id));
      if (wallpaperId === wp.id) {
        setWallpaperId(BUILTIN_WALLPAPERS[0].id);
      }
    } catch {
      // toast could go here
    }
  };

  return (
    <div className="space-y-5">
      {/* ── EX6-D.3: Per-session vs global scope toggle ── */}
      {activeServerId && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-foreground">Apply wallpaper to</div>
            <div className="text-[11px] text-muted-foreground">
              {scope === 'session'
                ? 'Only this server session (overrides global)'
                : 'All sessions (global default)'}
            </div>
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-[12px]">
            <button
              type="button"
              onClick={() => setScope('session')}
              className={cn(
                'px-3 py-1.5 transition-colors',
                scope === 'session' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
              data-testid="wp-scope-session"
            >
              This session
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={cn(
                'px-3 py-1.5 transition-colors border-l border-border',
                scope === 'global' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
              data-testid="wp-scope-global"
            >
              All sessions
            </button>
          </div>
          {sessionOverride !== undefined && (
            <button
              type="button"
              onClick={() => clearPreferenceOverride('wallpaperId')}
              className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded"
              title={`Reset to global (${globalWallpaperId})`}
              data-testid="wp-reset-override"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* ── Current Wallpaper ─────────────────────── */}
      <div className="flex items-start gap-4">
        <div className="w-45 h-28 rounded-lg overflow-hidden border border-border shrink-0">
          <WallpaperPreview wallpaper={currentWp} className="w-full h-full" />
        </div>
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[15px] font-medium text-foreground">
            {currentWp.name}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {currentWp.type === 'gradient' ? 'Built-in Gradient' : currentWp.category === 'system' ? 'System' : 'Your Photo'}
          </span>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) handleUpload(f);
              };
              input.click();
            }}
            className="mt-2 text-[12px] text-primary hover:underline text-left"
          >
            Add Photo…
          </button>
        </div>
      </div>

      {/* ── Built-in ─────────────────────────────── */}
      <div>
        <SectionHeader title="Built-in" count={BUILTIN_WALLPAPERS.length} showAll onShowAll={() => {}} />
        <ScrollRow>
          {BUILTIN_WALLPAPERS.map((wp) => (
            <WallpaperThumb
              key={wp.id}
              wp={wp}
              selected={wallpaperId === wp.id}
              onSelect={() => setWallpaperId(wp.id)}
            />
          ))}
        </ScrollRow>
      </div>

      {/* ── Your Photos ──────────────────────────── */}
      <div>
        <SectionHeader title="Your Photos" count={userWps.length} showAll={userWps.length > 0} onShowAll={() => {}} />
        <ScrollRow>
          <AddPhotoCard onUpload={handleUpload} />
          {userWps.map((wp) => (
            <WallpaperThumb
              key={wp.id}
              wp={wp}
              selected={wallpaperId === wp.id}
              onSelect={() => setWallpaperId(wp.id)}
              onDelete={() => handleDelete(wp)}
            />
          ))}
        </ScrollRow>
      </div>

      {/* ── System ───────────────────────────────── */}
      {systemWps.length > 0 && (
        <div>
          <SectionHeader title="System" count={systemWps.length} showAll onShowAll={() => {}} />
          <ScrollRow>
            {systemWps.map((wp) => (
              <WallpaperThumb
                key={wp.id}
                wp={wp}
                selected={wallpaperId === wp.id}
                onSelect={() => setWallpaperId(wp.id)}
              />
            ))}
          </ScrollRow>
        </div>
      )}

      {loading && allWallpapers.length <= BUILTIN_WALLPAPERS.length && (
        <p className="text-[12px] text-muted-foreground">Loading wallpapers…</p>
      )}
    </div>
  );
}

// ─── Appearance Page ────────────────────────────────────────────────────────

// Hex approximations for visual swatches (ACCENT_PRESETS in oklch are used for actual CSS vars)
const ACCENT_SWATCH_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
];

function ThemeMiniPreview({ mode }: { mode: 'light' | 'dark' | 'auto' }) {
  const isDark = mode === 'dark';
  const bg = isDark ? '#1c1c1e' : '#f5f5f5';
  const barBg = isDark ? '#2c2c2e' : '#e5e5e5';
  const fg = isDark ? '#fff' : '#333';

  if (mode === 'auto') {
    // Split half light / half dark
    return (
      <div className="w-full h-full rounded overflow-hidden flex">
        <div className="w-1/2 bg-[#f5f5f5] flex flex-col items-center justify-center gap-1 p-1">
          <div className="w-full h-1.5 rounded-full bg-[#e5e5e5]" />
          <div className="w-3/4 h-1.5 rounded-full bg-[#e5e5e5]" />
        </div>
        <div className="w-1/2 bg-[#1c1c1e] flex flex-col items-center justify-center gap-1 p-1">
          <div className="w-full h-1.5 rounded-full bg-[#2c2c2e]" />
          <div className="w-3/4 h-1.5 rounded-full bg-[#2c2c2e]" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded flex flex-col p-1.5 gap-1" style={{ background: bg }}>
      {/* Mini title bar */}
      <div className="flex items-center gap-0.5">
        <div className="w-1 h-1 rounded-full bg-destructive" />
        <div className="w-1 h-1 rounded-full bg-warning" />
        <div className="w-1 h-1 rounded-full bg-success" />
      </div>
      {/* Mini content bars */}
      <div className="flex-1 flex flex-col gap-0.5 pt-0.5">
        <div className="h-1 rounded-full w-full" style={{ background: barBg }} />
        <div className="h-1 rounded-full w-3/4" style={{ background: barBg }} />
        <div className="h-1 rounded-full w-1/2" style={{ background: barBg }} />
      </div>
      {/* Mini dock */}
      <div className="flex justify-center gap-0.5 pt-0.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-sm" style={{ background: barBg }} />
        ))}
      </div>
    </div>
  );
}

function AppearancePage() {
  const { theme, setTheme } = useThemeStore();
  const accentIdx = usePreferencesStore((s) => s.accentColorIndex);
  const setAccentIdx = usePreferencesStore((s) => s.setAccentColorIndex);
  const desktopIconSize = usePreferencesStore((s) => s.desktopIconSize);
  const setDesktopIconSize = usePreferencesStore((s) => s.setDesktopIconSize);

  return (
    <div className="space-y-6">
      {/* ── Theme ───────────────────────────────── */}
      <div>
        <SectionHeader title="Appearance" />
        <div className="flex gap-4">
          {(['light', 'dark', 'auto'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  'w-22.5 h-15.5 rounded-lg border-2 overflow-hidden transition-all',
                  theme === mode
                    ? 'border-primary shadow-[0_0_0_1px_var(--primary)]'
                    : 'border-border hover:border-muted-foreground/40',
                )}
              >
                <ThemeMiniPreview mode={mode} />
              </div>
              <span className="text-[12px] text-foreground capitalize">{mode}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Accent Color ──────────────────────── */}
      <div>
        <SectionHeader title="Accent Color" />
        <div className="flex gap-2 flex-wrap">
          {ACCENT_PRESETS.map((preset, idx) => (
            <button
              key={preset.name}
              onClick={() => setAccentIdx(idx)}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-transform',
                accentIdx === idx && 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110',
              )}
              style={{ background: ACCENT_SWATCH_COLORS[idx] }}
              title={preset.name}
            >
              {accentIdx === idx && <Check size={13} className="text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop Icon Size ─────────────────── */}
      <div>
        <SectionHeader title="Desktop" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] text-foreground">Desktop Icon Size</span>
            <div className="flex gap-1">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setDesktopIconSize(size)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[12px] capitalize transition-colors',
                    desktopIconSize === size
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </GroupedCard>
      </div>
    </div>
  );
}

// ─── Terminal Page ──────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Source Code Pro', value: '"Source Code Pro", monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", monospace' },
  { label: 'Menlo', value: 'Menlo, monospace' },
  { label: 'Courier New', value: '"Courier New", monospace' },
] as const;

const SCROLLBACK_OPTIONS = [
  { label: '1,000 lines', value: 1000 },
  { label: '5,000 lines', value: 5000 },
  { label: '10,000 lines', value: 10000 },
  { label: 'Unlimited', value: -1 },
] as const;

const CURSOR_STYLES: { label: string; value: CursorStyle; preview: React.ReactNode }[] = [
  {
    label: 'Block',
    value: 'block',
    preview: <div className="w-2 h-3.5 bg-primary rounded-[1px]" />,
  },
  {
    label: 'Underline',
    value: 'underline',
    preview: (
      <div className="relative w-2 h-3.5">
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full" />
      </div>
    ),
  },
  {
    label: 'Bar',
    value: 'bar',
    preview: (
      <div className="relative w-2 h-3.5">
        <div className="absolute top-0 left-0 w-0.5 h-full bg-primary rounded-full" />
      </div>
    ),
  },
];

function TerminalPage() {
  const fontSize = usePreferencesStore((s) => s.terminalFontSize);
  const setFontSize = usePreferencesStore((s) => s.setTerminalFontSize);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const setFontFamily = usePreferencesStore((s) => s.setTerminalFontFamily);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const setCursorStyle = usePreferencesStore((s) => s.setTerminalCursorStyle);
  const scrollback = usePreferencesStore((s) => s.terminalScrollback);
  const setScrollback = usePreferencesStore((s) => s.setTerminalScrollback);
  const copyOnSelect = usePreferencesStore((s) => s.terminalCopyOnSelect);
  const setCopyOnSelect = usePreferencesStore((s) => s.setTerminalCopyOnSelect);

  const currentFontLabel = FONT_FAMILIES.find((f) => f.value === fontFamily)?.label ?? 'Custom';
  const currentScrollLabel = SCROLLBACK_OPTIONS.find((o) => o.value === scrollback)?.label ?? `${scrollback} lines`;

  return (
    <div className="space-y-6">
      {/* ── Font ──────────────────────────────── */}
      <div>
        <SectionHeader title="Font" />
        <GroupedCard>
          {/* Font Size */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-[13px] text-foreground">Font Size</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={24}
                step={1}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-28 h-1 accent-primary cursor-pointer"
              />
              <span className="text-[13px] text-muted-foreground tabular-nums w-6 text-right">
                {fontSize}
              </span>
            </div>
          </div>
          {/* Font Family */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] text-foreground">Font Family</span>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="bg-transparent text-[13px] text-muted-foreground text-right cursor-pointer outline-none appearance-none pr-1 hover:text-foreground transition-colors"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </GroupedCard>
      </div>

      {/* ── Preview ──────────────────────────── */}
      <div>
        <SectionHeader title="Preview" />
        <div
          className="rounded-lg border border-border bg-[#09090b] p-3 h-18 overflow-hidden"
          style={{ fontFamily, fontSize: `${fontSize}px` }}
        >
          <span className="text-success">user@server</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-primary">~</span>
          <span className="text-muted-foreground">$ </span>
          <span className="text-foreground/80">ls -la</span>
          <span
            className={cn(
              'inline-block ml-px animate-pulse',
              cursorStyle === 'block' && 'w-[0.6em] h-[1em] bg-primary align-text-bottom',
              cursorStyle === 'underline' && 'w-[0.6em] h-0.5 bg-primary align-baseline -mb-px',
              cursorStyle === 'bar' && 'w-0.5 h-[1em] bg-primary align-text-bottom',
            )}
          />
        </div>
      </div>

      {/* ── Cursor ────────────────────────────── */}
      <div>
        <SectionHeader title="Cursor" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] text-foreground">Cursor Style</span>
            <div className="flex gap-1">
              {CURSOR_STYLES.map((cs) => (
                <button
                  key={cs.value}
                  onClick={() => setCursorStyle(cs.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] transition-colors',
                    cursorStyle === cs.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {cs.preview}
                  <span>{cs.label}</span>
                </button>
              ))}
            </div>
          </div>
        </GroupedCard>
      </div>

      {/* ── Scrollback & Behavior ─────────────── */}
      <div>
        <SectionHeader title="Behavior" />
        <GroupedCard>
          {/* Scrollback */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-[13px] text-foreground">Scrollback Buffer</span>
            <select
              value={scrollback}
              onChange={(e) => setScrollback(Number(e.target.value))}
              className="bg-transparent text-[13px] text-muted-foreground text-right cursor-pointer outline-none appearance-none pr-1 hover:text-foreground transition-colors"
            >
              {SCROLLBACK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {/* Copy on Select */}
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <span className="text-[13px] text-foreground">Copy on Select</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Automatically copy selected text to clipboard
              </p>
            </div>
            <button
              role="switch"
              aria-checked={copyOnSelect}
              onClick={() => setCopyOnSelect(!copyOnSelect)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                copyOnSelect ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  copyOnSelect ? 'translate-x-4' : 'translate-x-0',
                )}
              />
            </button>
          </div>
        </GroupedCard>
      </div>
    </div>
  );
}

// ─── Toggle Switch Primitive ────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

// ─── General Page (M7.5) ────────────────────────────────────────────────────

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15 seconds', value: 15 },
  { label: '30 seconds', value: 30 },
  { label: '60 seconds', value: 60 },
  { label: '120 seconds', value: 120 },
] as const;

function GeneralPage() {
  const autoRefreshInterval = usePreferencesStore((s) => s.autoRefreshInterval);
  const setAutoRefreshInterval = usePreferencesStore((s) => s.setAutoRefreshInterval);
  const dateFormat = usePreferencesStore((s) => s.dateFormat);
  const setDateFormat = usePreferencesStore((s) => s.setDateFormat);
  // EX6-D.5: Auto-hibernation
  const autoHibernateMinutes = usePreferencesStore((s) => s.autoHibernateMinutes);
  const setAutoHibernateMinutes = usePreferencesStore((s) => s.setAutoHibernateMinutes);

  return (
    <div className="space-y-6">
      {/* ── Display ──────────────────────────── */}
      <div>
        <SectionHeader title="Display" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <span className="text-[13px] text-foreground">Clock Format</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">Affects taskbar clock display</p>
            </div>
            <div className="flex gap-1">
              {([{ label: '12-hour', value: '12h' as DateFormat }, { label: '24-hour', value: '24h' as DateFormat }]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateFormat(opt.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[12px] transition-colors',
                    dateFormat === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </GroupedCard>
      </div>

      {/* ── Data Refresh ─────────────────────── */}
      <div>
        <SectionHeader title="Data Refresh" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <span className="text-[13px] text-foreground">Auto-Refresh Interval</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">How often dashboard & file explorer refresh data</p>
            </div>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-[13px] text-muted-foreground text-right cursor-pointer outline-none appearance-none pr-1 hover:text-foreground transition-colors"
            >
              {AUTO_REFRESH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </GroupedCard>
      </div>

      {/* ── Info ──────────────────────────────── */}
      <div>
        <SectionHeader title="Connection" />
        <GroupedCard>
          <GroupedRow
            label="Default Shell"
            value="/bin/bash"
          />
          <GroupedRow
            label="Auto-Reconnect"
            value="On"
          />
          <GroupedRow
            label="Session Timeout"
            value="Never"
            last
          />
        </GroupedCard>
        <p className="text-[11px] text-muted-foreground mt-2">
          Server-side connection settings will be configurable after LLM backend integration (M7.3).
        </p>
      </div>

      {/* ── EX6-D.5: Sessions ───────────────── */}
      <div>
        <SectionHeader title="Sessions" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <span className="text-[13px] text-foreground">Auto-Hibernate Inactive Sessions</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Disconnect background sessions that have been idle for this long. The active session is never auto-hibernated.
              </p>
            </div>
            <select
              value={autoHibernateMinutes}
              onChange={(e) => setAutoHibernateMinutes(Number(e.target.value))}
              className="bg-transparent text-[13px] text-muted-foreground text-right cursor-pointer outline-none appearance-none pr-1 hover:text-foreground transition-colors"
              data-testid="auto-hibernate-select"
            >
              <option value={0}>Off</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={180}>3 hours</option>
            </select>
          </div>
        </GroupedCard>
      </div>
    </div>
  );
}

// ─── Notifications & Data Page (M7.6) ───────────────────────────────────────

function NotificationsPage() {
  const showToasts = usePreferencesStore((s) => s.showToasts);
  const setShowToasts = usePreferencesStore((s) => s.setShowToasts);
  const toastPosition = usePreferencesStore((s) => s.toastPosition);
  const setToastPosition = usePreferencesStore((s) => s.setToastPosition);
  const resetAllPreferences = usePreferencesStore((s) => s.resetAllPreferences);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [storageSize, setStorageSize] = useState('—');

  useEffect(() => {
    // Calculate approximate localStorage usage
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          total += key.length + (localStorage.getItem(key)?.length ?? 0);
        }
      }
      const kb = (total * 2) / 1024; // UTF-16 = 2 bytes per char
      setStorageSize(kb < 1 ? `${(total * 2)} B` : `${kb.toFixed(1)} KB`);
    } catch {
      setStorageSize('Unknown');
    }
  }, []);

  const handleClearCache = () => {
    // Clear only HeadlessOS data, not all localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('headlessos-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    toast.success('Cached data cleared', { description: `Removed ${keysToRemove.length} items` });
    // Recalculate
    setStorageSize('0 B');
  };

  const handleResetAll = () => {
    resetAllPreferences();
    // Also reset theme
    const { setTheme } = useThemeStore.getState();
    setTheme('dark');
    toast.success('All settings reset to defaults');
    setShowResetConfirm(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Notifications ─────────────────────── */}
      <div>
        <SectionHeader title="Toast Notifications" />
        <GroupedCard>
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div>
              <span className="text-[13px] text-foreground">Show Notifications</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Toast popups for actions like copy, delete, connect
              </p>
            </div>
            <ToggleSwitch checked={showToasts} onChange={setShowToasts} />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] text-foreground">Position</span>
            <div className="flex gap-1">
              {([{ label: 'Bottom Right', value: 'bottom-right' as ToastPosition }, { label: 'Top Right', value: 'top-right' as ToastPosition }]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setToastPosition(opt.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[12px] transition-colors',
                    toastPosition === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </GroupedCard>
      </div>

      {/* ── Data ──────────────────────────────── */}
      <div>
        <SectionHeader title="Data & Storage" />
        <GroupedCard>
          <GroupedRow label="Local Storage Used" value={storageSize} />
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div>
              <span className="text-[13px] text-foreground">Clear Cached Data</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Remove all HeadlessOS data from browser storage
              </p>
            </div>
            <button
              onClick={handleClearCache}
              className="px-3 py-1 rounded-md text-[12px] bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <div>
              <span className="text-[13px] text-destructive">Reset All Settings</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Restore all preferences to their default values
              </p>
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-1 rounded-md text-[12px] bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
            >
              Reset
            </button>
          </div>
        </GroupedCard>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset All Settings?"
        description="This will restore all preferences (theme, accent color, terminal, notifications, wallpaper) to their default values. This cannot be undone."
        confirmLabel="Reset All"
        variant="destructive"
        onConfirm={handleResetAll}
      />
    </div>
  );
}

// ─── About Page ─────────────────────────────────────────────────────────────

function KeyboardShortcutsPage() {
  const sections = [
    { title: 'Global', shortcuts: SHORTCUT_REFERENCE.global },
    { title: 'File Explorer', shortcuts: SHORTCUT_REFERENCE.fileExplorer },
  ];

  return (
    <div className="space-y-5 max-w-lg">
      {sections.map((section) => (
        <div key={section.title}>
          <SectionHeader title={section.title} />
          <GroupedCard>
            {section.shortcuts.map((s, i) => (
              <div
                key={s.keys}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 text-[13px]',
                  i < section.shortcuts.length - 1 && 'border-b border-border',
                )}
              >
                <span className="text-foreground">{s.description}</span>
                <kbd className="inline-flex items-center gap-0.5">
                  {s.keys.split('+').map((key, ki) => (
                    <span key={ki} className="flex items-center gap-0.5">
                      {ki > 0 && (
                        <span className="text-muted-foreground text-[10px] mx-0.5">+</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[11px] font-mono border border-border shadow-sm">
                        {key}
                      </span>
                    </span>
                  ))}
                </kbd>
              </div>
            ))}
          </GroupedCard>
        </div>
      ))}
    </div>
  );
}

// ─── AI / LLM Page (M10.7) ──────────────────────────────────────────────────

function AIPage() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [models, setModels] = useState<Record<string, LLMModelInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [provider, setProvider] = useState('none');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');

  useEffect(() => {
    (async () => {
      try {
        const [configRes, modelsRes] = await Promise.all([fetchLLMConfig(), fetchLLMModels()]);
        if (configRes.data) {
          setConfig(configRes.data);
          setProvider(configRes.data.provider);
          setModel(configRes.data.model);
        }
        if (modelsRes.data) setModels(modelsRes.data);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: { provider: string; apiKey?: string; model?: string } = { provider };
      if (provider !== 'none') {
        if (apiKey) body.apiKey = apiKey;
        body.model = model;
      }
      const res = await updateLLMConfig(body);
      if (res.success && res.data) {
        setConfig(res.data);
        setApiKey('');
        toast.success('LLM configuration saved');
      } else {
        toast.error(res.error ?? 'Failed to save configuration');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-muted-foreground">Loading LLM configuration…</span>
      </div>
    );
  }

  const providerModels = models[provider] ?? [];

  return (
    <div className="space-y-5">
      {/* Status */}
      <GroupedCard>
        <GroupedRow
          label="Status"
          value={
            <span className={config?.hasApiKey ? 'text-success' : 'text-muted-foreground'}>
              {config?.hasApiKey ? '● Active' : '○ Disabled'}
            </span>
          }
        />
        <GroupedRow label="Provider" value={config?.provider === 'none' ? 'None' : 'OpenAI'} />
        <GroupedRow label="Model" value={config?.model || '—'} last />
      </GroupedCard>

      {/* Provider Selection */}
      <SectionHeader title="Provider" />
      <GroupedCard>
        <GroupedRow
          label="None (deterministic only)"
          value={provider === 'none' ? <Check size={16} className="text-primary" /> : null}
          onClick={() => setProvider('none')}
        />
        <GroupedRow
          label="OpenAI"
          value={provider === 'openai' ? <Check size={16} className="text-primary" /> : null}
          onClick={() => setProvider('openai')}
          last
        />
      </GroupedCard>

      {/* API Key (only for OpenAI) */}
      {provider === 'openai' && (
        <>
          <SectionHeader title="API Key" />
          <GroupedCard>
            <div className="px-3 py-2">
              <input
                type="password"
                placeholder={config?.hasApiKey ? '••••••••••••••••  (key set)' : 'sk-...'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>
          </GroupedCard>
          <p className="text-[11px] text-muted-foreground">
            {config?.hasApiKey
              ? 'API key is configured. Enter a new key to change it.'
              : 'Enter your OpenAI API key. It is stored in server memory only (not saved to disk).'}
          </p>
        </>
      )}

      {/* Model Selection */}
      {provider !== 'none' && providerModels.length > 0 && (
        <>
          <SectionHeader title="Model" />
          <GroupedCard>
            {providerModels.map((m, i) => (
              <GroupedRow
                key={m.id}
                label={`${m.name}${m.recommended ? ' ★' : ''}`}
                value={
                  model === m.id ? <Check size={16} className="text-primary" /> : (
                    <span className="text-[11px] text-muted-foreground">{m.description}</span>
                  )
                }
                onClick={() => setModel(m.id)}
                last={i === providerModels.length - 1}
              />
            ))}
          </GroupedCard>
        </>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-primary text-primary-foreground text-[13px] font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving…' : 'Save Configuration'}
      </button>

      {/* Info */}
      <p className="text-[11px] text-muted-foreground pt-2">
        LLM parsing is used as a fallback when deterministic parsers cannot handle command output.
        Deterministic parsers are always tried first and are free.
      </p>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="space-y-5">
      {/* Logo + Version */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-primary to-primary/60 flex items-center justify-center shrink-0 shadow-md">
          <Monitor size={28} className="text-white" />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold text-foreground">HeadlessOS</h2>
          <p className="text-[12px] text-muted-foreground">Version 0.1.0 (Alpha)</p>
        </div>
      </div>

      {/* Info */}
      <GroupedCard>
        <GroupedRow label="Platform" value="Web Desktop" />
        <GroupedRow label="Engine" value="React 19 + Vite" />
        <GroupedRow label="Backend" value="Fastify + SSH" />
        <GroupedRow label="UI Framework" value="TailwindCSS 4" last />
      </GroupedCard>

      <GroupedCard>
        <GroupedRow label="License" value="MIT" chevron />
        <GroupedRow label="GitHub" value="headlessOS" chevron last />
      </GroupedCard>

      <p className="text-[11px] text-muted-foreground pt-1">
        A localhost web app that connects to Linux VPS servers via SSH. Nothing is installed on the server.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PLUGINS PAGE (M11.3)
// ═════════════════════════════════════════════════════════════════════════════

function PluginsPage() {
  const [plugins, setPlugins] = useState<Array<{
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    state: 'installed' | 'active' | 'inactive' | 'error';
    permissions: string[];
    error?: string;
  }>>([]);
  const [installUrl, setInstallUrl] = useState('');
  const [installing, setInstalling] = useState(false);

  // Load plugins from registry
  const loadPlugins = useCallback(() => {
    try {
      const { pluginRegistry } = require('../../lib/plugins');
      const all = pluginRegistry.getAll();
      setPlugins(
        all.map((e: { manifest: { id: string; name: string; version: string; description?: string; author?: string; permissions: string[] }; state: string; error?: string }) => ({
          id: e.manifest.id,
          name: e.manifest.name,
          version: e.manifest.version,
          description: e.manifest.description,
          author: e.manifest.author,
          state: e.state as 'installed' | 'active' | 'inactive' | 'error',
          permissions: e.manifest.permissions,
          error: e.error,
        })),
      );
    } catch {
      // Plugin registry may not be available
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const handleActivate = async (pluginId: string) => {
    try {
      const { pluginRegistry } = await import('../../lib/plugins');
      await pluginRegistry.activate(pluginId);
      toast.success(`Plugin "${pluginId}" activated`);
      loadPlugins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Activation failed');
    }
  };

  const handleDeactivate = async (pluginId: string) => {
    try {
      const { pluginRegistry } = await import('../../lib/plugins');
      await pluginRegistry.deactivate(pluginId);
      toast.success(`Plugin "${pluginId}" deactivated`);
      loadPlugins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deactivation failed');
    }
  };

  const handleUninstall = async (pluginId: string) => {
    try {
      const { pluginRegistry } = await import('../../lib/plugins');
      await pluginRegistry.unregister(pluginId);
      toast.success(`Plugin "${pluginId}" removed`);
      loadPlugins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Removal failed');
    }
  };

  const handleInstallFromUrl = async () => {
    if (!installUrl.trim()) return;
    setInstalling(true);
    try {
      const res = await fetch(installUrl.trim());
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const manifest = await res.json();
      const { pluginRegistry, PluginManifestSchema } = await import('../../lib/plugins');
      const parsed = PluginManifestSchema.parse(manifest);
      pluginRegistry.register(parsed);
      toast.success(`Plugin "${parsed.name}" installed`);
      setInstallUrl('');
      loadPlugins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="max-w-xl space-y-5">
      {/* Install from URL */}
      <GroupedCard>
        <div className="px-4 py-3 space-y-2">
          <p className="text-[12px] font-medium text-foreground">Install plugin from URL</p>
          <p className="text-[11px] text-muted-foreground">
            Enter a URL to a plugin manifest JSON file to install a community plugin.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={installUrl}
              onChange={(e) => setInstallUrl(e.target.value)}
              placeholder="https://example.com/plugin-manifest.json"
              className="flex-1 px-3 py-1.5 text-[12px] bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleInstallFromUrl()}
            />
            <button
              onClick={handleInstallFromUrl}
              disabled={installing || !installUrl.trim()}
              className="px-3 py-1.5 text-[12px] font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {installing ? 'Installing…' : 'Install'}
            </button>
          </div>
        </div>
      </GroupedCard>

      {/* Installed plugins list */}
      <GroupedCard>
        <div className="px-4 py-3">
          <p className="text-[12px] font-medium text-foreground mb-3">
            Installed Plugins ({plugins.length})
          </p>
          {plugins.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-4 text-center">
              No plugins installed. Install a plugin from a URL above.
            </p>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 hover:bg-muted/20 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <Puzzle size={16} className="text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-foreground truncate">
                        {plugin.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        v{plugin.version}
                      </span>
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                          plugin.state === 'active'
                            ? 'bg-success/10 text-success'
                            : plugin.state === 'error'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {plugin.state}
                      </span>
                    </div>
                    {plugin.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{plugin.description}</p>
                    )}
                    {plugin.error && (
                      <p className="text-[10px] text-destructive mt-0.5">{plugin.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {plugin.state === 'active' ? (
                      <button
                        onClick={() => handleDeactivate(plugin.id)}
                        className="text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(plugin.id)}
                        className="text-[11px] px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => handleUninstall(plugin.id)}
                      className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </GroupedCard>

      {/* Plugin development info */}
      <GroupedCard>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[12px] font-medium text-foreground">Creating Plugins</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Plugins are JSON manifest files that define apps, permissions, and lifecycle hooks.
            A plugin can contribute new apps to the launcher, toolbar items, and settings pages.
            See the Plugin API documentation for the full schema reference.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['fs:read', 'docker:read', 'terminal:access', 'ui:panel', 'llm:invoke'].map((perm) => (
              <span
                key={perm}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {perm}
              </span>
            ))}
            <span className="text-[10px] text-muted-foreground">+18 more permissions</span>
          </div>
        </div>
      </GroupedCard>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW (root)
// ═════════════════════════════════════════════════════════════════════════════

export function SettingsView() {
  const [page, setPage] = useState<PageId>('general');

  return (
    <div className="flex h-full bg-background">
      {/* ── Sidebar ── */}
      <aside className="w-52 shrink-0 border-r border-border bg-sidebar px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {SIDEBAR.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setPage(entry.id)}
            className={cn(
              'flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-[13px] transition-colors text-left',
              page === entry.id
                ? 'bg-primary text-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent',
            )}
          >
            <div
              className={cn(
                'w-5.5 h-5.5 rounded-md flex items-center justify-center shrink-0',
                page === entry.id ? 'bg-white/20' : entry.iconBg,
              )}
            >
              {entry.icon}
            </div>
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {/* Page title — simple left-aligned, like macOS */}
        <h1 className="text-[22px] font-bold text-foreground mb-5">
          {SIDEBAR.find((s) => s.id === page)?.label}
        </h1>

        {page === 'general' && <GeneralPage />}
        {page === 'wallpaper' && <WallpaperPage />}
        {page === 'appearance' && <AppearancePage />}
        {page === 'terminal' && <TerminalPage />}
        {page === 'keyboard' && <KeyboardShortcutsPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'ai' && <AIPage />}
        {page === 'plugins' && <PluginsPage />}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  );
}
