// EX6-C.5: Global Settings Section — global-scope preferences only
// @see docs/phases/phase-ex6.md
//
// Per ADR-022: 7 keys are session-overridable (accent, wallpaper, terminal
// font/size, autoRefreshInterval, defaultLaunchAppId, pinnedAppIds). Everything
// else (LLM provider, account, date format, toasts, hasSeenOnboarding) is
// always global. This section exposes the global defaults; per-session
// overrides are surfaced inside each session's in-desktop Settings app.

import { ExternalLink, Palette, Image as ImageIcon, Bell, Calendar, Upload } from 'lucide-react';
import { useState } from 'react';
import { usePreferencesStore } from '../../store/preferences-store';
import { LUMEN_ACCENTS } from '../../lib/lumen-theme';
import { useAppStore } from '../../store/app-store';
import { importSessionViaPicker } from '../../lib/session-io';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function GlobalSettingsSection() {
  const accentColorIndex = usePreferencesStore((s) => s.accentColorIndex);
  const setAccentColorIndex = usePreferencesStore((s) => s.setAccentColorIndex);
  const dateFormat = usePreferencesStore((s) => s.dateFormat);
  const setDateFormat = usePreferencesStore((s) => s.setDateFormat);
  const showToasts = usePreferencesStore((s) => s.showToasts);
  const setShowToasts = usePreferencesStore((s) => s.setShowToasts);
  const toastPosition = usePreferencesStore((s) => s.toastPosition);
  const setToastPosition = usePreferencesStore((s) => s.setToastPosition);

  const goToDesktop = useAppStore((s) => s.goToDesktop);
  const activeServerId = useAppStore((s) => s.activeServerId);

  // EX6-D.4: import status
  const [importStatus, setImportStatus] = useState<{ kind: 'idle' | 'ok' | 'error'; message?: string }>({ kind: 'idle' });
  const handleImport = async () => {
    setImportStatus({ kind: 'idle' });
    const result = await importSessionViaPicker();
    if (result.ok && result.serverId) {
      setImportStatus({ kind: 'ok', message: `Imported session for "${result.serverId}". Activate from Sessions tab.` });
    } else if (result.error) {
      setImportStatus({ kind: 'error', message: result.error });
    }
  };

  return (
    <div className="space-y-8 text-foreground">
      <header className="border-b border-border pb-4">
        <h2 className="text-xl font-semibold">Global Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults applied to all sessions. Each session can override a small set of these
          (accent, wallpaper, terminal, polling) from its in-desktop Settings app.
        </p>
      </header>

      {/* Default accent */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Default accent color</Label>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Default accent color">
          {LUMEN_ACCENTS.map((preset, idx) => (
            <button
              key={preset.id}
              role="radio"
              aria-checked={accentColorIndex === idx}
              aria-label={preset.name}
              onClick={() => setAccentColorIndex(idx)}
              className={
                'h-8 w-8 rounded-full transition-transform hover:scale-110 ' +
                (accentColorIndex === idx ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : '')
              }
              style={{ background: preset.swatch }}
            />
          ))}
        </div>
      </section>

      {/* Date format */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium" htmlFor="cc-date-format">
            Date format
          </Label>
        </div>
        <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as typeof dateFormat)}>
          <SelectTrigger id="cc-date-format" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relative">Relative (3 minutes ago)</SelectItem>
            <SelectItem value="iso">ISO (2026-04-18 14:30)</SelectItem>
            <SelectItem value="locale">Locale (Apr 18, 2026, 2:30 PM)</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Notifications */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Notifications</Label>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <div className="text-sm font-medium">Show toast notifications</div>
            <div className="text-xs text-muted-foreground">Briefly slide notifications onto the desktop</div>
          </div>
          <Switch checked={showToasts} onCheckedChange={setShowToasts} />
        </div>

        {showToasts && (
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Toast position</div>
              <div className="text-xs text-muted-foreground">Where new toasts appear</div>
            </div>
            <Select value={toastPosition} onValueChange={(v) => setToastPosition(v as typeof toastPosition)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top-right">Top right</SelectItem>
                <SelectItem value="top-left">Top left</SelectItem>
                <SelectItem value="bottom-right">Bottom right</SelectItem>
                <SelectItem value="bottom-left">Bottom left</SelectItem>
                <SelectItem value="top-center">Top center</SelectItem>
                <SelectItem value="bottom-center">Bottom center</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      {/* Per-session settings pointer */}
      <section className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <ImageIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium">Looking for wallpaper, terminal, or per-session overrides?</div>
            <p className="text-xs text-muted-foreground">
              Open the active session and launch the <kbd>Settings</kbd> app from the start menu.
              You can scope changes to <em>this server</em> or <em>all sessions</em> there.
            </p>
            {activeServerId && (
              <Button
                variant="outline"
                size="sm"
                onClick={goToDesktop}
                className="mt-1"
              >
                Open active session
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* EX6-D.4: Session backup / import */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Session backup</Label>
        </div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-medium">Import session from JSON</div>
              <div className="text-xs text-muted-foreground">
                Restore a session that was previously exported. Imported sessions land in the
                hibernated state and can be woken from the Sessions tab. To export, right-click
                a session tile in the switcher.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              data-testid="cc-import-session"
            >
              Import…
            </Button>
          </div>
          {importStatus.kind === 'ok' && (
            <div className="text-xs text-green-600 dark:text-green-400" role="status">
              {importStatus.message}
            </div>
          )}
          {importStatus.kind === 'error' && (
            <div className="text-xs text-destructive" role="alert">
              {importStatus.message}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
