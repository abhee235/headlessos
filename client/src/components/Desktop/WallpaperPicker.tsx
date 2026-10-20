// WallpaperPicker — personalization window using AppWindow compound component
// Accessible from Desktop context menu → "Personalize"
// Layout: Sidebar (category nav) | Body (wallpaper grid) + Toolbar (upload) + Footer (hint)
// EX8.6: LumenOS v3 thumbnails — 16:10, radius 12px, name underneath, 3px accent ring when selected

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  BUILTIN_WALLPAPERS, fetchWallpapers, uploadWallpaper, deleteWallpaper, type WallpaperDefinition, type ImageWallpaper, } from './wallpapers';
import { WallpaperPreview } from './Wallpaper';
import { AppWindow } from '@/components/ui/app-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Paintbrush, Upload, Trash2, ImageIcon, Palette, Monitor, User } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';

type Category = 'builtin' | 'system' | 'user';

interface WallpaperPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WallpaperPicker({ open, onOpenChange }: WallpaperPickerProps) {
  const wallpaperId = usePreferencesStore((s) => s.wallpaperId);
  const setWallpaperId = usePreferencesStore((s) => s.setWallpaperId);

  const [activeCategory, setActiveCategory] = useState<Category>('builtin');
  const [systemWallpapers, setSystemWallpapers] = useState<ImageWallpaper[]>([]);
  const [userWallpapers, setUserWallpapers] = useState<ImageWallpaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch image wallpapers when dialog opens
  const loadWallpapers = useCallback(async () => {
    setLoading(true);
    try {
      const { system, user } = await fetchWallpapers();
      setSystemWallpapers(system);
      setUserWallpapers(user);
    } catch {
      // Server might not be running — just show builtins
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadWallpapers();
    }
  }, [open, loadWallpapers]);

  // Upload handler
  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      setUploading(true);
      try {
        const wp = await uploadWallpaper(file);
        setUserWallpapers((prev) => [...prev, wp]);
        setWallpaperId(wp.id);
        setActiveCategory('user');
        toast.success(`Uploaded ${wp.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [setWallpaperId],
  );

  // Delete handler
  const handleDelete = useCallback(
    async (wp: ImageWallpaper) => {
      try {
        await deleteWallpaper(wp.filename);
        setUserWallpapers((prev) => prev.filter((w) => w.id !== wp.id));
        if (wallpaperId === wp.id) {
          setWallpaperId(BUILTIN_WALLPAPERS[0].id);
        }
        toast.success(`Deleted ${wp.name}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [wallpaperId, setWallpaperId],
  );

  // Determine which wallpapers to show based on active category
  const currentWallpapers: WallpaperDefinition[] =
    activeCategory === 'builtin'
      ? BUILTIN_WALLPAPERS
      : activeCategory === 'system'
        ? systemWallpapers
        : userWallpapers;

  const categories: { key: Category; label: string; icon: typeof Palette; count: number }[] = [
    { key: 'builtin', label: 'Built-in', icon: Palette, count: BUILTIN_WALLPAPERS.length },
    { key: 'system', label: 'System', icon: Monitor, count: systemWallpapers.length },
    { key: 'user', label: 'User', icon: User, count: userWallpapers.length },
  ];

  return (
    <AppWindow
      open={open}
      onOpenChange={onOpenChange}
      title="Personalize"
      icon={Paintbrush}
      description="Choose your desktop background"
      size="lg"
      width={760}
      height={520}
    >
      {/* ── Sidebar: category navigation ── */}
      <AppWindow.Sidebar width={208}>
        <AppWindow.SidebarGroup label="Categories">
          {categories.map((cat) => (
            <AppWindow.SidebarItem
              key={cat.key}
              id={cat.key}
              icon={cat.icon}
              label={cat.label}
              badge={cat.count}
              active={activeCategory === cat.key}
              onClick={() => setActiveCategory(cat.key)}
            />
          ))}
        </AppWindow.SidebarGroup>
      </AppWindow.Sidebar>

      {/* ── Toolbar: upload action ── */}
      <AppWindow.Toolbar className="px-4">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <Upload strokeWidth={1.75} />
          )}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          onChange={handleUpload}
        />
        <div className="flex-1" />
        <span className="text-[12px] text-label-3 tabular-nums">
          {currentWallpapers.length} wallpaper{currentWallpapers.length !== 1 ? 's' : ''}
        </span>
      </AppWindow.Toolbar>

      {/* ── Body: wallpaper grid ── */}
      <AppWindow.Body className="px-4 pt-2 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-6 w-6 text-label-3" />
          </div>
        ) : currentWallpapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-label-2">
            <ImageIcon className="h-10 w-10 text-label-3" strokeWidth={1.5} />
            <p className="max-w-sm text-[13px]">
              {activeCategory === 'user'
                ? 'No user wallpapers yet — upload an image or drop files into ~/.headlessos/wallpapers/'
                : 'No wallpapers available in this category'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3.5 p-1">
            {currentWallpapers.map((wp) => {
              const isActive = wp.id === wallpaperId;
              const isUserImage = wp.type === 'image' && wp.category === 'user';

              return (
                <div key={wp.id} className="group relative min-w-0">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-solid"
                    onClick={() => setWallpaperId(wp.id)}
                    title={wp.name}
                    aria-pressed={isActive}
                  >
                    <WallpaperPreview
                      wallpaper={wp}
                      className={cn(
                        'aspect-[16/10] w-full rounded-xl transition-shadow duration-150',
                        isActive
                          ? 'ring-[3px] ring-accent-solid shadow-[0_8px_18px_-8px_rgba(0,0,0,.4)]'
                          : 'ring-1 ring-edge shadow-[0_8px_18px_-10px_rgba(0,0,0,.35)] group-hover:ring-edge-2',
                      )}
                    />
                    <span className={cn('truncate text-[14px] text-foreground', isActive && 'font-semibold')}>
                      {wp.name}
                    </span>
                  </button>

                  {isUserImage && (
                    <button
                      type="button"
                      className={cn(
                        'absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full',
                        'bg-mat-thick text-danger shadow-[var(--lumen-spec)] backdrop-blur-md',
                        'opacity-0 transition-[opacity,background] duration-150 hover:bg-fill-2',
                        'focus-visible:opacity-100 group-hover:opacity-100',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wp as ImageWallpaper);
                      }}
                      title={`Delete ${wp.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </AppWindow.Body>

      {/* ── Footer: hint ── */}
      <AppWindow.Footer>
        Drop images into{' '}
        <code className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[11px] text-label-2">
          ~/.headlessos/wallpapers/
        </code>{' '}
        to add user wallpapers automatically
      </AppWindow.Footer>
    </AppWindow>
  );
}
