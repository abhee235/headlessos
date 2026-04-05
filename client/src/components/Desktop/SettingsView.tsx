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
} from 'lucide-react';
import { usePreferencesStore, ACCENT_PRESETS, type CursorStyle, type DateFormat, type ToastPosition } from '../../store/preferences-store';
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

// ─── Types ───────────────────────────────────────────────────────────────────

type PageId = 'general' | 'appearance' | 'wallpaper' | 'terminal' | 'notifications' | 'about';

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
    iconBg: 'bg-zinc-500',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Paintbrush size={14} className="text-white" />,
    iconBg: 'bg-indigo-500',
  },
  {
    id: 'wallpaper',
    label: 'Wallpaper',
    icon: <Image size={14} className="text-white" />,
    iconBg: 'bg-cyan-500',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: <TerminalSquare size={14} className="text-white" />,
    iconBg: 'bg-zinc-800',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={14} className="text-white" />,
    iconBg: 'bg-rose-500',
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
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
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
  const wallpaperId = usePreferencesStore((s) => s.wallpaperId);
  const setWallpaperId = usePreferencesStore((s) => s.setWallpaperId);
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
        <div className="w-1 h-1 rounded-full bg-red-400" />
        <div className="w-1 h-1 rounded-full bg-yellow-400" />
        <div className="w-1 h-1 rounded-full bg-green-400" />
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
    preview: <div className="w-2 h-3.5 bg-blue-400 rounded-[1px]" />,
  },
  {
    label: 'Underline',
    value: 'underline',
    preview: (
      <div className="relative w-2 h-3.5">
        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400 rounded-full" />
      </div>
    ),
  },
  {
    label: 'Bar',
    value: 'bar',
    preview: (
      <div className="relative w-2 h-3.5">
        <div className="absolute top-0 left-0 w-0.5 h-full bg-blue-400 rounded-full" />
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
          <span className="text-green-400">user@server</span>
          <span className="text-zinc-400">:</span>
          <span className="text-blue-400">~</span>
          <span className="text-zinc-400">$ </span>
          <span className="text-zinc-300">ls -la</span>
          <span
            className={cn(
              'inline-block ml-px animate-pulse',
              cursorStyle === 'block' && 'w-[0.6em] h-[1em] bg-blue-400 align-text-bottom',
              cursorStyle === 'underline' && 'w-[0.6em] h-0.5 bg-blue-400 align-baseline -mb-px',
              cursorStyle === 'bar' && 'w-0.5 h-[1em] bg-blue-400 align-text-bottom',
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

function AboutPage() {
  return (
    <div className="space-y-5">
      {/* Logo + Version */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-700 flex items-center justify-center shrink-0 shadow-md">
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
        {page === 'notifications' && <NotificationsPage />}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  );
}
