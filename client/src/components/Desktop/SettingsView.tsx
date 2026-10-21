// M7.4-M7.6: Settings — LumenOS v3 settings window (EX8.6 restyle)
// PaneSidebar navigation with an account/host card, 30px page title,
// .lumen-section cards with 60px rows, segmented pills and Switch controls.
// @see docs/phases/phase-7.md
// @see docs/phases/phase-ex8.md

import { Children, Fragment, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Image as ImageIcon,
  ImagePlus,
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
  Sun,
  Moon,
  SunMoon,
} from 'lucide-react';
import { SHORTCUT_REFERENCE } from '../../hooks/useKeyboardShortcuts';
import { LUMEN_ACCENTS, GLASS_STRENGTHS, resolveAccent } from '../../lib/lumen-theme';
import { usePreferencesStore, type CursorStyle, type DateFormat, type ToastPosition } from '../../store/preferences-store';
import { useSessionsStore } from '../../store/sessions-store';
import { useAppStore } from '../../store/app-store';
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
import { PaneSidebar, PaneSidebarItem } from '../ui/pane-sidebar';
import { Segmented } from '../ui/segmented';
import { WeatherCityPicker } from './WeatherCityPicker';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import {
  fetchLLMConfig, updateLLMConfig, fetchLLMModels, fetchOllamaModels,
  type LLMConfig, type LLMModelInfo, type ModelLimits, type OllamaModel,
} from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type PageId = 'general' | 'appearance' | 'wallpaper' | 'terminal' | 'keyboard' | 'notifications' | 'ai' | 'plugins' | 'about';

interface SidebarEntry {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

const SIDEBAR: SidebarEntry[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', icon: Paintbrush },
  { id: 'wallpaper', label: 'Wallpaper', icon: ImageIcon },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'keyboard', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'ai', label: 'AI / LLM', icon: Brain },
  { id: 'plugins', label: 'Plugins', icon: Puzzle },
  { id: 'about', label: 'About', icon: Info },
];

// ─── Shared Primitives ───────────────────────────────────────────────────────

/** Content section: .lumen-section card, padding 22px 24px, 16px gap (wallpaper grids, previews, forms). */
function Section({
  title,
  aside,
  children,
  className,
}: {
  title?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('lumen-section flex flex-col gap-4 rounded-[20px] px-6 py-[22px]', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Row-list section: .lumen-section card, padding 6px 24px, rows separated by
 * 1px hairlines. A title (like "Keyboard shortcuts" in LumenOS) sits inside
 * the card above the first hairline.
 */
function RowSection({
  title,
  footer,
  children,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const rows = Children.toArray(children);
  return (
    <section
      className={cn(
        'lumen-section flex flex-col rounded-[20px] px-6',
        title ? 'pt-5 pb-1.5' : 'py-1.5',
      )}
    >
      {title && <h2 className="pb-2.5 text-[15px] font-semibold text-foreground">{title}</h2>}
      {rows.map((row, i) => (
        <Fragment key={i}>
          {(i > 0 || title) && <div className="h-px shrink-0 bg-border" />}
          {row}
        </Fragment>
      ))}
      {footer && <p className="pt-1 pb-3.5 text-[13px] text-label-3">{footer}</p>}
    </section>
  );
}

/** One settings row: min 60px, 15px label with a 14px label-2 description, control on the right. */
function Row({
  label,
  description,
  icon: Icon,
  children,
  onClick,
  danger,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  children?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  const cls = cn(
    'flex min-h-[60px] items-center gap-4 py-2.5 text-left',
    onClick &&
      '-mx-3 w-[calc(100%+1.5rem)] cursor-pointer rounded-[12px] px-3 transition-colors duration-150 hover:bg-fill active:bg-fill-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );
  const content = (
    <>
      {Icon && <Icon className="h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-[15px]', danger ? 'text-danger' : 'text-foreground')}>{label}</span>
        {description && <span className="text-[13px] leading-[18px] text-label-2">{description}</span>}
      </div>
      {children !== undefined && children !== null && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/** Secondary value on the right of a row. */
function RowValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('text-[15px] text-label-2 tabular-nums', className)}>{children}</span>;
}

// EX8.14: Segmented now lives in ui/segmented.tsx (shared by every tab/filter control)

/** Pill dropdown on the Select primitive, for numeric or string preference values. */
function SelectPill<T extends string | number>({
  value,
  onChange,
  options,
  testId,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  testId?: string;
  className?: string;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const opt = options.find((o) => String(o.value) === v);
        if (opt) onChange(opt.value);
      }}
    >
      <SelectTrigger className={cn('w-auto min-w-[150px]', className)} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Account / host card (sidebar header) ───────────────────────────────────

function AccountCard() {
  const activeServer = useAppStore((s) => s.servers.find((srv) => srv.id === s.activeServerId));
  const name = activeServer?.name ?? 'HeadlessOS';
  const initial = (name.trim()[0] ?? 'H').toUpperCase();

  return (
    <div className="flex items-center gap-3 px-2.5 pt-1.5 pb-3.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,var(--lumen-accent-hi),var(--lumen-accent))] text-[16px] font-semibold text-on-accent">
        {initial}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-foreground">{name}</span>
        {activeServer ? (
          <span className="truncate font-mono text-[12px] text-label-2" title={`${activeServer.username}@${activeServer.host}`}>
            {activeServer.username}@{activeServer.host}
          </span>
        ) : (
          <span className="truncate text-[13px] text-label-2">Local settings</span>
        )}
      </div>
    </div>
  );
}

// ─── Wallpaper Thumbnail ─────────────────────────────────────────────────────

const WALLPAPER_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5';
const THUMB = 'aspect-[16/10] w-full rounded-xl transition-shadow duration-150';
const THUMB_SELECTED = 'ring-[3px] ring-accent-solid shadow-[0_8px_18px_-8px_rgba(0,0,0,.4)]';
const THUMB_IDLE = 'ring-1 ring-edge shadow-[0_8px_18px_-10px_rgba(0,0,0,.35)] group-hover:ring-edge-2';

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
    <div className="group relative min-w-0">
      <button
        type="button"
        onClick={onSelect}
        title={wp.name}
        aria-pressed={selected}
        className="flex w-full flex-col gap-2 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-solid"
      >
        <WallpaperPreview wallpaper={wp} className={cn(THUMB, selected ? THUMB_SELECTED : THUMB_IDLE)} />
        <span className={cn('truncate text-[14px] text-foreground', selected && 'font-semibold')}>
          {wp.name}
        </span>
      </button>
      {/* Delete on hover (user wallpapers only) */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title={`Delete ${wp.name}`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-mat-thick text-danger opacity-0 shadow-[var(--lumen-spec)] backdrop-blur-md transition-[opacity,background] duration-150 hover:bg-fill-2 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

// ─── Add Photo card ─────────────────────────────────────────────────────────

function AddPhotoCard({ onUpload }: { onUpload: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="min-w-0">
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
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-edge-2 text-label-2 transition-colors duration-150 hover:border-accent-solid/50 hover:bg-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <span className="text-[13px]">Add Photo</span>
      </button>
    </div>
  );
}

function CountLabel({ count }: { count: number }) {
  return <span className="text-[13px] text-label-3 tabular-nums">{count}</span>;
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
        <RowSection>
          <Row
            label="Apply wallpaper to"
            description={
              scope === 'session'
                ? 'Only this server session (overrides global)'
                : 'All sessions (global default)'
            }
          >
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'session', label: 'This session', testId: 'wp-scope-session' },
                { value: 'global', label: 'All sessions', testId: 'wp-scope-global' },
              ]}
            />
            {sessionOverride !== undefined && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => clearPreferenceOverride('wallpaperId')}
                title={`Reset to global (${globalWallpaperId})`}
                data-testid="wp-reset-override"
              >
                Reset
              </Button>
            )}
          </Row>
        </RowSection>
      )}

      {/* ── Current Wallpaper ─────────────────────── */}
      <Section>
        <div className="flex items-center gap-5">
          <WallpaperPreview
            wallpaper={currentWp}
            className="aspect-[16/10] w-[200px] shrink-0 rounded-xl ring-1 ring-edge shadow-[0_8px_18px_-10px_rgba(0,0,0,.35)]"
          />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="truncate text-[17px] font-semibold text-foreground">{currentWp.name}</span>
            <span className="text-[14px] text-label-2">
              {currentWp.type === 'gradient' ? 'Built-in Gradient' : currentWp.category === 'system' ? 'System' : 'Your Photo'}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-2"
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
            >
              <ImagePlus strokeWidth={1.75} />
              Add Photo…
            </Button>
          </div>
        </div>
      </Section>

      {/* ── System ───────────────────────────────── */}
      {systemWps.length > 0 && (
        <Section title="System" aside={<CountLabel count={systemWps.length} />}>
          <div className={WALLPAPER_GRID}>
            {systemWps.map((wp) => (
              <WallpaperThumb
                key={wp.id}
                wp={wp}
                selected={wallpaperId === wp.id}
                onSelect={() => setWallpaperId(wp.id)}
              />
            ))}
          </div>
        </Section>
      )}

       {/* ── Built-in ─────────────────────────────── */}
      <Section title="Built-in" aside={<CountLabel count={BUILTIN_WALLPAPERS.length} />}>
        <div className={WALLPAPER_GRID}>
          {BUILTIN_WALLPAPERS.map((wp) => (
            <WallpaperThumb
              key={wp.id}
              wp={wp}
              selected={wallpaperId === wp.id}
              onSelect={() => setWallpaperId(wp.id)}
            />
          ))}
        </div>
      </Section>

      {/* ── Your Photos ──────────────────────────── */}
      <Section title="Your Photos" aside={userWps.length > 0 ? <CountLabel count={userWps.length} /> : undefined}>
        <div className={WALLPAPER_GRID}>
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
        </div>
      </Section>

      {loading && allWallpapers.length <= BUILTIN_WALLPAPERS.length && (
        <p className="px-1 text-[13px] text-label-3">Loading wallpapers…</p>
      )}
    </div>
  );
}

// ─── Appearance Page ────────────────────────────────────────────────────────

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'Auto', icon: SunMoon },
];

function AppearancePage() {
  const { theme, setTheme } = useThemeStore();
  const accentIdx = usePreferencesStore((s) => s.accentColorIndex);
  const setAccentIdx = usePreferencesStore((s) => s.setAccentColorIndex);
  const glassStrength = usePreferencesStore((s) => s.glassStrength);
  const setGlassStrength = usePreferencesStore((s) => s.setGlassStrength);
  const transparency = usePreferencesStore((s) => s.transparency);
  const setTransparency = usePreferencesStore((s) => s.setTransparency);
  const desktopIconSize = usePreferencesStore((s) => s.desktopIconSize);
  const setDesktopIconSize = usePreferencesStore((s) => s.setDesktopIconSize);
  const dockPosition = usePreferencesStore((s) => s.dockPosition);
  const setDockPosition = usePreferencesStore((s) => s.setDockPosition);
  const dockIconStyle = usePreferencesStore((s) => s.dockIconStyle);
  const setDockIconStyle = usePreferencesStore((s) => s.setDockIconStyle);
  const wallpaperId = useEffectivePref('wallpaperId');

  // EX8.1: index 0 (and any legacy out-of-range index) = match wallpaper
  const accentChoice = LUMEN_ACCENTS[accentIdx] ? accentIdx : 0;
  const resolvedAccent = resolveAccent(accentIdx, wallpaperId);
  const accentName = LUMEN_ACCENTS.find((a) => a.id === resolvedAccent)?.name ?? resolvedAccent;
  const accentDescription = accentChoice === 0 ? `${accentName} · matched to wallpaper` : accentName;

  return (
    <div className="space-y-5">
      <RowSection>
        {/* ── Theme ───────────────────────────────── */}
        <Row label="Theme" description="Applies to windows, menus and the taskbar">
          <Segmented value={theme} onChange={setTheme} options={THEME_OPTIONS} />
        </Row>

        {/* ── Accent colour (EX8.1: index 0 = match wallpaper) ── */}
        <Row label="Accent colour" description={accentDescription}>
          <div className="flex items-center gap-3">
            {LUMEN_ACCENTS.map((preset, idx) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setAccentIdx(idx)}
                className={cn(
                  'h-7 w-7 shrink-0 rounded-full transition-[box-shadow,transform] duration-150 hover:scale-105',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  accentChoice === idx
                    ? 'ring-2 ring-accent-solid ring-offset-2 ring-offset-mat-thick'
                    : 'shadow-[inset_0_1px_0_rgba(255,255,255,.35)]',
                )}
                style={{ background: preset.swatch }}
                title={preset.name}
                aria-label={preset.name}
                aria-pressed={accentChoice === idx}
              />
            ))}
          </div>
        </Row>

        {/* ── Glass (EX8.1) ─────────────────────── */}
        <Row label="Glass strength" description="How much of the wallpaper shows through windows">
          <Segmented value={glassStrength} onChange={setGlassStrength} options={GLASS_STRENGTHS.map((g) => ({ value: g.id, label: g.name }))} />
        </Row>
        <Row label="Transparency effects" description="Frosted glass behind windows and panels">
          <Switch checked={transparency} onCheckedChange={setTransparency} />
        </Row>
      </RowSection>

      {/* ── Dock position + desktop icon size ─── */}
      <RowSection>
        {/* EX8.12: only the dock moves; Launcher, Home hub and Search open where they always do */}
        <Row label="Dock Position" description="Centred along the bottom, or centred on the right edge">
          <Segmented
            value={dockPosition}
            onChange={setDockPosition}
            options={[
              { value: 'bottom', label: 'Bottom' },
              { value: 'right', label: 'Right' },
            ]}
          />
        </Row>
        {/* EX8.16: per-app colour tiles or the neutral glass plates */}
        <Row label="Dock Icons" description="Each app on its own colour tile, or all on glass">
          <Segmented
            value={dockIconStyle}
            onChange={setDockIconStyle}
            options={[
              { value: 'color', label: 'Colour' },
              { value: 'glass', label: 'Glass' },
            ]}
          />
        </Row>
        <Row label="Desktop Icon Size">
          <Segmented
            value={desktopIconSize}
            onChange={setDesktopIconSize}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </Row>
      </RowSection>
    </div>
  );
}

// ─── Terminal Page ──────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: 'Geist Mono', value: "'Geist Mono Variable', 'Geist Mono', ui-monospace, monospace" },
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

// Cursor glyphs use currentColor so they follow the segmented option's text colour
const CURSOR_STYLES: { label: string; value: CursorStyle; preview: React.ReactElement }[] = [
  {
    label: 'Block',
    value: 'block',
    preview: <span className="block h-3.5 w-2 rounded-[1px] bg-current" />,
  },
  {
    label: 'Underline',
    value: 'underline',
    preview: (
      <span className="relative block h-3.5 w-2">
        <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-current" />
      </span>
    ),
  },
  {
    label: 'Bar',
    value: 'bar',
    preview: (
      <span className="relative block h-3.5 w-2">
        <span className="absolute left-0 top-0 h-full w-0.5 rounded-full bg-current" />
      </span>
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

  // Keep a value that isn't in the preset list selectable/visible
  const fontOptions: ReadonlyArray<{ value: string; label: string }> = FONT_FAMILIES.some((f) => f.value === fontFamily)
    ? FONT_FAMILIES
    : [...FONT_FAMILIES, { value: fontFamily, label: currentFontLabel }];
  const scrollbackOptions: ReadonlyArray<{ value: number; label: string }> = SCROLLBACK_OPTIONS.some((o) => o.value === scrollback)
    ? SCROLLBACK_OPTIONS
    : [...SCROLLBACK_OPTIONS, { value: scrollback, label: currentScrollLabel }];

  return (
    <div className="space-y-5">
      {/* ── Font ──────────────────────────────── */}
      <RowSection title="Font">
        <Row label="Font Size">
          <Slider
            className="w-40"
            min={10}
            max={24}
            step={1}
            value={[fontSize]}
            onValueChange={([v]) => setFontSize(v)}
          />
          <RowValue className="w-7 text-right">{fontSize}</RowValue>
        </Row>
        <Row label="Font Family">
          <SelectPill value={fontFamily} onChange={setFontFamily} options={fontOptions} className="min-w-[180px]" />
        </Row>
      </RowSection>

      {/* ── Preview ──────────────────────────── */}
      <Section title="Preview">
        <div
          className="h-18 overflow-hidden rounded-[14px] border border-edge bg-paper px-4 py-3.5 font-mono"
          style={{ fontFamily, fontSize: `${fontSize}px` }}
        >
          <span className="text-success">user@server</span>
          <span className="text-label-3">:</span>
          <span className="text-accent-text">~</span>
          <span className="text-label-3">$ </span>
          <span className="text-foreground">ls -la</span>
          <span
            className={cn(
              'ml-px inline-block animate-pulse',
              cursorStyle === 'block' && 'h-[1em] w-[0.6em] bg-accent-solid align-text-bottom',
              cursorStyle === 'underline' && '-mb-px h-0.5 w-[0.6em] bg-accent-solid align-baseline',
              cursorStyle === 'bar' && 'h-[1em] w-0.5 bg-accent-solid align-text-bottom',
            )}
          />
        </div>
      </Section>

      {/* ── Cursor, Scrollback & Behavior ─────── */}
      <RowSection title="Behavior">
        <Row label="Cursor Style">
          <Segmented
            value={cursorStyle}
            onChange={setCursorStyle}
            options={CURSOR_STYLES.map((cs) => ({ value: cs.value, label: cs.label, icon: cs.preview }))}
          />
        </Row>
        <Row label="Scrollback Buffer">
          <SelectPill value={scrollback} onChange={setScrollback} options={scrollbackOptions} />
        </Row>
        <Row label="Copy on Select" description="Automatically copy selected text to clipboard">
          <Switch checked={copyOnSelect} onCheckedChange={setCopyOnSelect} />
        </Row>
      </RowSection>
    </div>
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

/** EX8.17: Home hub as the idle privacy screen */
const IDLE_GLANCE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1 minute', value: 1 },
  { label: '2 minutes', value: 2 },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
] as const;

const AUTO_HIBERNATE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '3 hours', value: 180 },
] as const;

function GeneralPage() {
  const weatherUnits = usePreferencesStore((s) => s.weatherUnits);
  const setWeatherUnits = usePreferencesStore((s) => s.setWeatherUnits);
  const autoRefreshInterval = usePreferencesStore((s) => s.autoRefreshInterval);
  const setAutoRefreshInterval = usePreferencesStore((s) => s.setAutoRefreshInterval);
  const dateFormat = usePreferencesStore((s) => s.dateFormat);
  const setDateFormat = usePreferencesStore((s) => s.setDateFormat);
  // EX6-D.5: Auto-hibernation
  const autoHibernateMinutes = usePreferencesStore((s) => s.autoHibernateMinutes);
  const setAutoHibernateMinutes = usePreferencesStore((s) => s.setAutoHibernateMinutes);
  const idleGlanceMinutes = usePreferencesStore((s) => s.idleGlanceMinutes);
  const setIdleGlanceMinutes = usePreferencesStore((s) => s.setIdleGlanceMinutes);

  return (
    <div className="space-y-5">
      {/* ── Display & Data Refresh ─────────────── */}
      <RowSection>
        <Row label="Clock Format" description="Affects taskbar clock display">
          <Segmented
            value={dateFormat}
            onChange={setDateFormat}
            options={[
              { label: '12-hour', value: '12h' as DateFormat },
              { label: '24-hour', value: '24h' as DateFormat },
            ]}
          />
        </Row>
        <Row label="Auto-Refresh Interval" description="How often dashboard & file explorer refresh data">
          <SelectPill value={autoRefreshInterval} onChange={setAutoRefreshInterval} options={AUTO_REFRESH_OPTIONS} />
        </Row>
      </RowSection>

      {/* ── EX6-D.5: Sessions ───────────────── */}
      <RowSection title="Sessions">
        <Row
          label="Auto-Hibernate Inactive Sessions"
          description="Disconnect background sessions that have been idle for this long. The active session is never auto-hibernated."
        >
          <SelectPill
            value={autoHibernateMinutes}
            onChange={setAutoHibernateMinutes}
            options={AUTO_HIBERNATE_OPTIONS}
            testId="auto-hibernate-select"
          />
        </Row>
        <Row
          label="Privacy Screen"
          description="Show the Home hub over the desktop after this long without input. Any key brings your windows back. It hides the screen; it is not a lock."
        >
          <SelectPill
            value={idleGlanceMinutes}
            onChange={setIdleGlanceMinutes}
            options={IDLE_GLANCE_OPTIONS}
            testId="idle-glance-select"
          />
        </Row>
      </RowSection>

      {/* ── Info ──────────────────────────────── */}
      <RowSection
        title="Connection"
        footer="Server-side connection settings will be configurable after LLM backend integration (M7.3)."
      >
        <Row label="Default Shell" className="min-h-[52px]">
          <RowValue className="font-mono text-[14px]">/bin/bash</RowValue>
        </Row>
        <Row label="Auto-Reconnect" className="min-h-[52px]">
          <RowValue>On</RowValue>
        </Row>
        <Row label="Session Timeout" className="min-h-[52px]">
          <RowValue>Never</RowValue>
        </Row>
      </RowSection>

        {/* ── EX8.15: Weather for the Home hub ─── */}
      <RowSection title="Weather" footer="Shown in the Home hub. Forecasts come from Open-Meteo; only the chosen city's coordinates are sent.">
        <Row label="City">
          <WeatherCityPicker />
        </Row>
        <Row label="Units">
          <Segmented
            value={weatherUnits}
            onChange={setWeatherUnits}
            options={[
              { value: 'celsius', label: '°C' },
              { value: 'fahrenheit', label: '°F' },
            ]}
          />
        </Row>
      </RowSection>
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
    <div className="space-y-5">
      {/* ── Notifications ─────────────────────── */}
      <RowSection title="Toast Notifications">
        <Row label="Show Notifications" description="Toast popups for actions like copy, delete, connect">
          <Switch checked={showToasts} onCheckedChange={setShowToasts} />
        </Row>
        <Row label="Position">
          <Segmented
            value={toastPosition}
            onChange={setToastPosition}
            options={[
              { label: 'Bottom Right', value: 'bottom-right' as ToastPosition },
              { label: 'Top Right', value: 'top-right' as ToastPosition },
            ]}
          />
        </Row>
      </RowSection>

      {/* ── Data ──────────────────────────────── */}
      <RowSection title="Data & Storage">
        <Row label="Local Storage Used" className="min-h-[52px]">
          <RowValue>{storageSize}</RowValue>
        </Row>
        <Row label="Clear Cached Data" description="Remove all HeadlessOS data from browser storage">
          <Button type="button" variant="secondary" onClick={handleClearCache}>
            Clear
          </Button>
        </Row>
        <Row label="Reset All Settings" description="Restore all preferences to their default values" danger>
          <Button type="button" variant="destructive" onClick={() => setShowResetConfirm(true)}>
            Reset
          </Button>
        </Row>
      </RowSection>

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

// ─── Keyboard Shortcuts Page ────────────────────────────────────────────────

function KeyboardShortcutsPage() {
  const sections = [
    { title: 'Global', shortcuts: SHORTCUT_REFERENCE.global },
    { title: 'File Explorer', shortcuts: SHORTCUT_REFERENCE.fileExplorer },
  ];

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <RowSection key={section.title} title={section.title}>
          {section.shortcuts.map((s) => (
            <Row key={s.keys} label={s.description} className="min-h-[46px] py-1.5">
              <kbd className="inline-flex items-center gap-1 rounded-lg bg-fill px-2.5 py-1 font-mono text-[13px] font-medium text-foreground">
                {s.keys.split('+').map((key, ki) => (
                  <Fragment key={ki}>
                    {ki > 0 && <span className="text-label-3">+</span>}
                    <span>{key}</span>
                  </Fragment>
                ))}
              </kbd>
            </Row>
          ))}
        </RowSection>
      ))}
    </div>
  );
}

// ─── AI / LLM Page (M10.7) ──────────────────────────────────────────────────

function SelectedCheck() {
  return <Check className="h-[18px] w-[18px] text-accent-text" strokeWidth={2} />;
}

/** EX9.3: Ollama on this computer needs no confirm; anything else does */
const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
function isLoopbackUrl(url: string): boolean {
  try {
    return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(new URL(url).hostname);
  } catch {
    return true; // not a URL yet: no remote warning while typing
  }
}

function formatGB(bytes?: number): string | null {
  return bytes ? `${(bytes / 1e9).toFixed(1)} GB` : null;
}

/** EX10.1: 65536 → "64K" */
function formatWindow(tokens: number): string {
  return tokens % 1024 === 0 ? `${tokens / 1024}K` : tokens.toLocaleString();
}

const DEFAULT_CONTEXT_OPTIONS = [8192, 16384, 32768, 65536, 131072];

/** EX10.1: why the window is what it is, in one line */
function describeLimits(limits: ModelLimits): string {
  const why = {
    owner: 'Your setting',
    modelfile: 'Set by the model’s Modelfile',
    trained: 'All the model was trained for',
    'auto-cap': 'Auto (at most 64K)',
    table: 'From the model',
    default: 'Default — Ollama did not report the model’s length',
  }[limits.source];
  const trained = limits.trainedContext && limits.source !== 'trained' ? ` · trained for ${formatWindow(limits.trainedContext)}` : '';
  const cache = limits.kvBytesPerToken ? ` · cache ≈ ${formatGB(limits.kvBytesPerToken * limits.contextWindow)}` : '';
  return `${why}${trained}${cache}`;
}

function AIPage() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [models, setModels] = useState<Record<string, LLMModelInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [provider, setProvider] = useState('none');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-6-luna'); // EX8.20: default model
  // EX9.3: Ollama (a local model)
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [ollamaModel, setOllamaModel] = useState('');
  const [allowRemote, setAllowRemote] = useState(false);
  // EX10.1: 'auto' = the lowest of 64K and the model's own limits
  const [ollamaContext, setOllamaContext] = useState<number | 'auto'>('auto');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<{ loading: boolean; error?: string }>({ loading: false });

  useEffect(() => {
    (async () => {
      try {
        const [configRes, modelsRes] = await Promise.all([fetchLLMConfig(), fetchLLMModels()]);
        if (configRes.data) {
          setConfig(configRes.data);
          setProvider(configRes.data.provider);
          if (configRes.data.provider !== 'ollama') setModel(configRes.data.model);
          if (configRes.data.ollama) {
            setOllamaUrl(configRes.data.ollama.baseUrl);
            setOllamaModel(configRes.data.ollama.model);
            setAllowRemote(!!configRes.data.ollama.allowRemote);
            setOllamaContext(configRes.data.ollama.contextWindow ?? 'auto');
          }
        }
        if (modelsRes.data) setModels(modelsRes.data);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // EX9.3: list the models installed in Ollama while that provider is picked
  const remote = !isLoopbackUrl(ollamaUrl);
  useEffect(() => {
    if (provider !== 'ollama') return;
    if (remote && !allowRemote) {
      setOllamaModels([]);
      setOllamaStatus({ loading: false });
      return;
    }
    let cancelled = false;
    setOllamaStatus({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await fetchOllamaModels(ollamaUrl.trim(), allowRemote);
        if (cancelled) return;
        setOllamaModels(res.data ?? []);
        setOllamaStatus({ loading: false, ...(res.success ? {} : { error: res.error }) });
      } catch (err) {
        if (!cancelled) setOllamaStatus({ loading: false, error: err instanceof Error ? err.message : 'Could not reach Ollama' });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [provider, ollamaUrl, allowRemote, remote]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Parameters<typeof updateLLMConfig>[0] = { provider };
      if (provider === 'openai') {
        if (apiKey) body.apiKey = apiKey;
        body.model = model;
      } else if (provider === 'ollama') {
        body.ollama = {
          baseUrl: ollamaUrl.trim(),
          model: ollamaModel,
          ...(remote && allowRemote ? { allowRemote: true } : {}),
          contextWindow: ollamaContext,
        };
      }
      const res = await updateLLMConfig(body);
      if (res.success && res.data) {
        setConfig(res.data);
        setApiKey('');
        if (res.data.persisted === false) toast.warning('Applied, but not saved to disk: it lasts until the server restarts');
        else toast.success('LLM configuration saved');
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
        <span className="text-[14px] text-label-2">Loading LLM configuration…</span>
      </div>
    );
  }

  const providerModels = provider === 'openai' ? models.openai ?? [] : [];
  const activeOllama = config?.provider === 'ollama' ? config.ollama : undefined;
  const canSave = provider !== 'ollama' || (!!ollamaModel && (!remote || allowRemote));

  return (
    <div className="space-y-5">
      {/* Status */}
      <RowSection>
        <Row label="Status" className="min-h-[52px]">
          <RowValue className={config?.hasApiKey ? 'text-success' : undefined}>
            {config?.hasApiKey ? '● Active' : '○ Disabled'}
          </RowValue>
        </Row>
        <Row label="Provider" className="min-h-[52px]">
          <RowValue>{config?.provider === 'none' ? 'None' : config?.provider === 'ollama' ? 'Ollama' : 'OpenAI'}</RowValue>
        </Row>
        <Row label="Model" className="min-h-[52px]">
          <RowValue className="font-mono text-[14px]">{config?.model || '—'}</RowValue>
        </Row>
        {config?.hasApiKey && config.provider === 'openai' && (
          <Row label="API Key" className="min-h-[52px]">
            <RowValue>{config.keySource === 'env' ? 'From .env' : 'Saved on this computer, encrypted'}</RowValue>
          </Row>
        )}
        {activeOllama && (
          <Row label="Ollama" className="min-h-[52px]">
            <RowValue className="font-mono text-[14px]">{activeOllama.baseUrl}</RowValue>
          </Row>
        )}
        {activeOllama?.limits && (
          <Row label="Context window" description={describeLimits(activeOllama.limits)} className="min-h-[52px]">
            <RowValue>{activeOllama.limits.contextWindow.toLocaleString()} tokens</RowValue>
          </Row>
        )}
        {activeOllama?.residency?.onCpu && (
          <Row label="Memory" description="Choose a smaller context window, or a smaller model." className="min-h-[52px]">
            <RowValue className="text-warning">Part of the model runs on the CPU</RowValue>
          </Row>
        )}
      </RowSection>

      {/* Provider Selection */}
      <RowSection title="Provider">
        <Row label="None (deterministic only)" onClick={() => setProvider('none')} className="min-h-[52px]">
          {provider === 'none' ? <SelectedCheck /> : null}
        </Row>
        <Row label="OpenAI" onClick={() => setProvider('openai')} className="min-h-[52px]">
          {provider === 'openai' ? <SelectedCheck /> : null}
        </Row>
        <Row
          label="Ollama"
          description="A model running on this computer. Nothing leaves the machine."
          onClick={() => setProvider('ollama')}
          className="min-h-[52px]"
        >
          {provider === 'ollama' ? <SelectedCheck /> : null}
        </Row>
      </RowSection>

      {/* EX9.3: Ollama URL and installed models */}
      {provider === 'ollama' && (
        <Section title="Ollama">
          <Input
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder={DEFAULT_OLLAMA_URL}
            aria-label="Ollama URL"
            className="font-mono"
          />
          {remote && (
            <label className="flex items-center gap-3 text-[13px] text-label-2">
              <Switch checked={allowRemote} onCheckedChange={setAllowRemote} aria-label="Send prompts to this machine" />
              <span>
                This Ollama is on another machine. Turn this on to send prompts and server output there.
              </span>
            </label>
          )}
          <p className="text-[13px] text-label-2">
            {ollamaStatus.loading
              ? 'Looking for installed models…'
              : remote && !allowRemote
                ? 'Its models are listed once you allow sending to that machine.'
                : ollamaStatus.error
                ? ollamaStatus.error
                : ollamaModels.length === 0 && (!remote || allowRemote)
                  ? 'No models installed. Install one with: ollama pull qwen3:8b'
                  : 'Used for parsing, AI Agent and UI Agent. Small models get fewer tools at a time.'}
          </p>
        </Section>
      )}
      {provider === 'ollama' && ollamaModels.length > 0 && (
        <RowSection title="Model">
          {ollamaModels.map((m) => (
            <Row
              key={m.name}
              label={m.name}
              description={[m.parameterSize, m.family, formatGB(m.sizeBytes)].filter(Boolean).join(' · ') || undefined}
              onClick={() => setOllamaModel(m.name)}
            >
              {ollamaModel === m.name ? <SelectedCheck /> : null}
            </Row>
          ))}
        </RowSection>
      )}
      {provider === 'ollama' && ollamaModels.length > 0 && (
        <RowSection>
          <Row
            label="Context window"
            description="Auto: up to 64K, never more than the model supports."
            className="min-h-[52px]"
          >
            <SelectPill
              value={ollamaContext}
              onChange={setOllamaContext}
              options={[
                { value: 'auto' as const, label: 'Auto' },
                ...(config?.contextOptions ?? DEFAULT_CONTEXT_OPTIONS).map((w) => ({ value: w, label: formatWindow(w) })),
              ]}
              testId="ollama-context"
            />
          </Row>
        </RowSection>
      )}

      {/* API Key (only for OpenAI) */}
      {provider === 'openai' && (
        <Section title="API Key">
          <Input
            type="password"
            placeholder={config?.hasApiKey ? '••••••••••••••••  (key set)' : 'sk-...'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="font-mono"
          />
          <p className="text-[13px] text-label-2">
            {config?.hasApiKey
              ? 'A key is set. Leave this empty to keep it, or enter a new key to replace it.'
              : 'Enter your OpenAI API key.'}
            {' '}Used for parsing, AI Agent and UI Agent. Saved encrypted in ~/.headlessos/llm.json so it survives
            restarts, and never sent back to the browser. Choosing None deletes it.
          </p>
        </Section>
      )}

      {/* Model Selection */}
      {provider === 'openai' && providerModels.length > 0 && (
        <RowSection title="Model">
          {providerModels.map((m) => (
            <Row
              key={m.id}
              label={`${m.name}${m.recommended ? ' ★' : ''}`}
              description={m.description}
              onClick={() => setModel(m.id)}
            >
              {model === m.id ? <SelectedCheck /> : null}
            </Row>
          ))}
        </RowSection>
      )}

      {/* Save */}
      <div className="flex flex-col items-start gap-3">
        <Button type="button" variant="primary" onClick={handleSave} disabled={saving || !canSave}>
          {saving ? 'Saving…' : 'Save Configuration'}
        </Button>

        {/* Info */}
        <p className="px-1 text-[13px] text-label-3">
          LLM parsing is used as a fallback when deterministic parsers cannot handle command output.
          Deterministic parsers are always tried first and are free.
        </p>
      </div>
    </div>
  );
}

// ─── About Page ─────────────────────────────────────────────────────────────

function AboutPage() {
  return (
    <div className="space-y-5">
      {/* Logo + Version */}
      <Section>
        <div className="flex items-center gap-4">
          <div className="lumen-lit grid h-14 w-14 shrink-0 place-items-center rounded-[18px]">
            <Monitor className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-[17px] font-semibold text-foreground">HeadlessOS</h2>
            <p className="text-[14px] text-label-2">Version 0.1.0 (Alpha)</p>
          </div>
        </div>
      </Section>

      {/* Info */}
      <RowSection>
        <Row label="Platform" className="min-h-[52px]"><RowValue>Web Desktop</RowValue></Row>
        <Row label="Engine" className="min-h-[52px]"><RowValue>React 19 + Vite</RowValue></Row>
        <Row label="Backend" className="min-h-[52px]"><RowValue>Fastify + SSH</RowValue></Row>
        <Row label="UI Framework" className="min-h-[52px]"><RowValue>TailwindCSS 4</RowValue></Row>
      </RowSection>

      <RowSection>
        <Row label="License" className="min-h-[52px]">
          <RowValue>MIT</RowValue>
          <ChevronRight className="h-4 w-4 text-label-3" strokeWidth={1.75} />
        </Row>
        <Row label="GitHub" className="min-h-[52px]">
          <RowValue>headlessOS</RowValue>
          <ChevronRight className="h-4 w-4 text-label-3" strokeWidth={1.75} />
        </Row>
      </RowSection>

      <p className="px-1 text-[13px] text-label-3">
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
    <div className="space-y-5">
      {/* Install from URL */}
      <Section title="Install plugin from URL">
        <p className="-mt-2 text-[14px] text-label-2">
          Enter a URL to a plugin manifest JSON file to install a community plugin.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={installUrl}
            onChange={(e) => setInstallUrl(e.target.value)}
            placeholder="https://example.com/plugin-manifest.json"
            className="flex-1 font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleInstallFromUrl()}
          />
          <Button
            type="button"
            variant="primary"
            onClick={handleInstallFromUrl}
            disabled={installing || !installUrl.trim()}
          >
            {installing ? 'Installing…' : 'Install'}
          </Button>
        </div>
      </Section>

      {/* Installed plugins list */}
      <RowSection title={`Installed Plugins (${plugins.length})`}>
        {plugins.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-label-2">
            No plugins installed. Install a plugin from a URL above.
          </p>
        ) : (
          plugins.map((plugin) => (
            <div key={plugin.id} className="flex min-h-[60px] items-center gap-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-success/14 text-success">
                <Puzzle className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-foreground">
                    {plugin.name}
                  </span>
                  <span className="font-mono text-[12px] text-label-3">
                    v{plugin.version}
                  </span>
                  <Badge
                    variant={plugin.state === 'active' ? 'success' : plugin.state === 'error' ? 'destructive' : 'secondary'}
                  >
                    {plugin.state}
                  </Badge>
                </div>
                {plugin.description && (
                  <p className="truncate text-[13px] text-label-2">{plugin.description}</p>
                )}
                {plugin.error && (
                  <p className="mt-0.5 text-[13px] text-danger">{plugin.error}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {plugin.state === 'active' ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => handleDeactivate(plugin.id)}>
                    Deactivate
                  </Button>
                ) : (
                  <Button type="button" variant="primary" size="sm" onClick={() => handleActivate(plugin.id)}>
                    Activate
                  </Button>
                )}
                <Button type="button" variant="destructive" size="sm" onClick={() => handleUninstall(plugin.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))
        )}
      </RowSection>

      {/* Plugin development info */}
      <Section title="Creating Plugins">
        <p className="-mt-2 text-[14px] leading-relaxed text-label-2">
          Plugins are JSON manifest files that define apps, permissions, and lifecycle hooks.
          A plugin can contribute new apps to the launcher, toolbar items, and settings pages.
          See the Plugin API documentation for the full schema reference.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {['fs:read', 'docker:read', 'terminal:access', 'ui:panel', 'llm:invoke'].map((perm) => (
            <span
              key={perm}
              className="rounded-md bg-fill px-2 py-0.5 font-mono text-[12px] text-label-2"
            >
              {perm}
            </span>
          ))}
          <span className="text-[12px] text-label-3">+18 more permissions</span>
        </div>
      </Section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW (root)
// ═════════════════════════════════════════════════════════════════════════════

interface SettingsViewProps {
  initialPage?: PageId;
}

export function SettingsView({ initialPage }: SettingsViewProps = {}) {
  const [page, setPage] = useState<PageId>(initialPage ?? 'general');

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ── */}
      <PaneSidebar width={232} className="py-2.5" header={<AccountCard />} aria-label="Settings">
        {SIDEBAR.map((entry) => (
          <PaneSidebarItem
            key={entry.id}
            icon={entry.icon}
            label={entry.label}
            active={page === entry.id}
            onClick={() => setPage(entry.id)}
          />
        ))}
      </PaneSidebar>

      {/* ── Content ── */}
      <main className="min-w-0 flex-1 overflow-y-auto px-7 pt-1 pb-7">
        {/* Cap the column so a maximized window doesn't stretch rows edge to edge */}
        <div className="max-w-[980px] space-y-5">
          <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.022em] text-foreground">
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
        </div>
      </main>
    </div>
  );
}
