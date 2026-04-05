// M6.4: Settings — macOS System Settings–style settings window
// Sidebar navigation, wallpaper picker, appearance, about
// @see docs/phases/phase-6.md

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
} from 'lucide-react';
import { usePreferencesStore } from '../../store/preferences-store';
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

// ─── Types ───────────────────────────────────────────────────────────────────

type PageId = 'wallpaper' | 'appearance' | 'about';

interface SidebarEntry {
  id: PageId;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
}

const SIDEBAR: SidebarEntry[] = [
  {
    id: 'wallpaper',
    label: 'Wallpaper',
    icon: <Image size={14} className="text-white" />,
    iconBg: 'bg-cyan-500',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Paintbrush size={14} className="text-white" />,
    iconBg: 'bg-indigo-500',
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

const ACCENT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
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
  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  const [accentIdx, setAccentIdx] = useState(0);

  const applyTheme = (mode: 'light' | 'dark' | 'auto') => {
    setTheme(mode);
    const root = document.documentElement;
    if (mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Theme ───────────────────────────────── */}
      <div>
        <SectionHeader title="Appearance" />
        <div className="flex gap-4">
          {(['light', 'dark', 'auto'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => applyTheme(mode)}
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
          {ACCENT_COLORS.map((color, idx) => (
            <button
              key={color.name}
              onClick={() => setAccentIdx(idx)}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-transform',
                accentIdx === idx && 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110',
              )}
              style={{ background: color.value }}
              title={color.name}
            >
              {accentIdx === idx && <Check size={13} className="text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Options ──────────────────────────── */}
      <div>
        <SectionHeader title="Options" />
        <GroupedCard>
          <GroupedRow label="Sidebar Icon Size" value="Default" chevron />
          <GroupedRow label="Show Scroll Bars" value="Automatic" chevron />
          <GroupedRow label="Allow Wallpaper Tinting" value="On" chevron last />
        </GroupedCard>
      </div>
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
  const [page, setPage] = useState<PageId>('wallpaper');

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

        {page === 'wallpaper' && <WallpaperPage />}
        {page === 'appearance' && <AppearancePage />}
        {page === 'about' && <AboutPage />}
      </main>
    </div>
  );
}
