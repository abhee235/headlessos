// WallpaperPicker — personalization window using AppWindow compound component
// Accessible from Desktop context menu → "Personalize"
// Layout: Sidebar (category nav) | Body (wallpaper grid) + Toolbar (upload) + Footer (hint)

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import {
  BUILTIN_WALLPAPERS,
  fetchWallpapers,
  uploadWallpaper,
  deleteWallpaper,
  type WallpaperDefinition,
  type ImageWallpaper,
} from './wallpapers';
import { WallpaperPreview } from './Wallpaper';
import { AppWindow } from '@/components/ui/app-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Check,
  Paintbrush,
  Upload,
  Trash2,
  Loader2,
  ImageIcon,
  Palette,
  Monitor,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

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
      <AppWindow.Sidebar width={180}>
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
      <AppWindow.Toolbar>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5 text-xs"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
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
        <span className="text-[11px] text-[rgb(var(--muted-foreground))]">
          {currentWallpapers.length} wallpaper{currentWallpapers.length !== 1 ? 's' : ''}
        </span>
      </AppWindow.Toolbar>

      {/* ── Body: wallpaper grid ── */}
      <AppWindow.Body>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[rgb(var(--muted-foreground))]" />
          </div>
        ) : currentWallpapers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-[rgb(var(--muted-foreground))]">
            <ImageIcon className="w-10 h-10 opacity-40" />
            <p className="text-sm">
              {activeCategory === 'user'
                ? 'No user wallpapers yet — upload an image or drop files into ~/.headlessos/wallpapers/'
                : 'No wallpapers available in this category'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 pb-2">
            {currentWallpapers.map((wp) => {
              const isActive = wp.id === wallpaperId;
              const isUserImage = wp.type === 'image' && wp.category === 'user';

              return (
                <div key={wp.id} className="relative group">
                  <button
                    className={cn(
                      'relative w-full rounded-xl overflow-hidden cursor-pointer transition-all duration-200',
                      'ring-2 ring-offset-2 ring-offset-[rgb(var(--background))]',
                      'hover:ring-[rgb(var(--primary))]/50 hover:scale-[1.02]',
                      'active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-[rgb(var(--ring))]',
                      isActive ? 'ring-[rgb(var(--primary))]' : 'ring-transparent',
                    )}
                    onClick={() => setWallpaperId(wp.id)}
                    title={wp.name}
                  >
                    <WallpaperPreview wallpaper={wp} className="w-full aspect-video" />

                    {isActive && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[rgb(var(--primary))] flex items-center justify-center shadow-lg">
                        <Check className="w-3 h-3 text-[rgb(var(--primary-foreground))]" />
                      </div>
                    )}

                    <div className={cn(
                      'absolute bottom-0 inset-x-0 px-2 py-1.5',
                      'bg-gradient-to-t from-black/70 to-transparent',
                      'text-[11px] font-medium text-white/90 text-left',
                    )}>
                      {wp.name}
                    </div>
                  </button>

                  {isUserImage && (
                    <button
                      className={cn(
                        'absolute top-1.5 left-1.5 w-6 h-6 rounded-full',
                        'bg-black/60 hover:bg-red-600 transition-colors',
                        'flex items-center justify-center',
                        'opacity-0 group-hover:opacity-100',
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wp as ImageWallpaper);
                      }}
                      title={`Delete ${wp.name}`}
                    >
                      <Trash2 className="w-3 h-3 text-white" />
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
        <code className="px-1 py-0.5 rounded bg-[rgb(var(--muted))] text-[10px]">
          ~/.headlessos/wallpapers/
        </code>{' '}
        to add user wallpapers automatically
      </AppWindow.Footer>
    </AppWindow>
  );
}
