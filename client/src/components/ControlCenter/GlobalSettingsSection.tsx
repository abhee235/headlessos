// EX6-C.5: Global Settings Section — global-scope preferences only
// EX8.5: LumenOS v3 — .lumen-section cards with 60px hairline-separated rows.
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
    <div className="flex flex-col gap-5 text-foreground">
      <header className="px-1">
        <h2 className="text-[30px] leading-9 font-semibold tracking-[-0.022em]">Global Settings</h2>
        <p className="mt-1 text-[14px] text-label-2">
          Defaults applied to all sessions. Each session can override a small set of these
          (accent, wallpaper, terminal, polling) from its in-desktop Settings app.
        </p>
      </header>

      {/* Appearance + date */}
      <section className="lumen-section flex flex-col rounded-[20px] px-6 py-1.5">
        <div className="flex min-h-[60px] items-center gap-4">
          <Palette className="h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />
          <div className="flex flex-1 flex-col gap-0.5">
            <Label className="text-[15px] font-normal">Default accent colour</Label>
            <span className="text-[13px] text-label-2">{LUMEN_ACCENTS[accentColorIndex]?.name ?? LUMEN_ACCENTS[0].name}</span>
          </div>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Default accent color">
            {LUMEN_ACCENTS.map((preset, idx) => (
              <button
                key={preset.id}
                role="radio"
                aria-checked={accentColorIndex === idx}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => setAccentColorIndex(idx)}
                className={
                  'h-7 w-7 rounded-full transition-transform hover:scale-110 ' +
                  (accentColorIndex === idx ? 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-transparent' : '')
                }
                style={{ background: preset.swatch }}
              />
            ))}
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="flex min-h-[60px] items-center gap-4">
          <Calendar className="h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />
          <Label className="flex-1 text-[15px] font-normal" htmlFor="cc-date-format">
            Date format
          </Label>
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
        </div>
      </section>

      {/* Notifications */}
      <section className="lumen-section flex flex-col rounded-[20px] px-6 py-1.5">
        <div className="flex min-h-[60px] items-center gap-4">
          <Bell className="h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px]">Show toast notifications</span>
            <span className="text-[13px] text-label-2">Briefly slide notifications onto the desktop</span>
          </div>
          <Switch checked={showToasts} onCheckedChange={setShowToasts} aria-label="Show toast notifications" />
        </div>

        {showToasts && (
          <>
            <div className="h-px bg-border" />
            <div className="flex min-h-[60px] items-center gap-4">
              <span className="w-5 shrink-0" />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px]">Toast position</span>
                <span className="text-[13px] text-label-2">Where new toasts appear</span>
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
          </>
        )}
      </section>

      {/* Per-session settings pointer */}
      <section className="lumen-section flex items-start gap-4 rounded-[20px] px-6 py-5">
        <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />
        <div className="flex-1 space-y-2">
          <div className="text-[15px] font-semibold">Looking for wallpaper, terminal, or per-session overrides?</div>
          <p className="text-[13px] text-label-2">
            Open the active session and launch the <kbd className="rounded-[6px] border border-edge bg-fill px-1.5 font-mono text-xs">Settings</kbd> app from the launcher.
            You can scope changes to <em>this server</em> or <em>all sessions</em> there.
          </p>
          {activeServerId && (
            <Button
              variant="secondary"
              size="sm"
              onClick={goToDesktop}
              className="mt-1"
            >
              Open active session
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      </section>

      {/* EX6-D.4: Session backup / import */}
      <section className="lumen-section flex flex-col gap-2 rounded-[20px] px-6 py-5">
        <div className="flex items-center gap-4">
          <Upload className="h-5 w-5 shrink-0 text-label-2" strokeWidth={1.75} />
          <div className="flex-1">
            <Label className="text-[15px] font-normal">Import session from JSON</Label>
            <div className="text-[13px] text-label-2">
              Restore a session that was previously exported. Imported sessions land in the
              hibernated state and can be woken from the Sessions tab. To export, right-click
              a session tile in the switcher.
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            data-testid="cc-import-session"
          >
            Import…
          </Button>
        </div>
        {importStatus.kind === 'ok' && (
          <div className="pl-9 text-xs text-success" role="status">
            {importStatus.message}
          </div>
        )}
        {importStatus.kind === 'error' && (
          <div className="pl-9 text-xs text-danger" role="alert">
            {importStatus.message}
          </div>
        )}
      </section>
    </div>
  );
}
