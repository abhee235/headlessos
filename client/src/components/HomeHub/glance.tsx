// EX8.15: HomeHub glance — the HomeHub cards re-bound to real data. Positions,
// sizes and styling are the EX8.10 port of HomeHub.dc.html; only the content
// changes (see the card table in docs/phases/phase-ex8.md).

import { useEffect, useMemo, useState } from 'react';
import { Cpu, HardDrive, MemoryStick, Moon, Server } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchFiles, fetchLLMConfig, fetchSystemDashboard, fetchTaskManager, fetchTaskManagerUsers, fetchWeather,
  resolveServerUrl, type WeatherData,
} from '../../lib/api';
import { APPS } from '../../lib/apps';
import { AppIcon } from '@/components/ui/FileIcon';
import { fetchWallpapers } from '../Desktop/wallpapers';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { arcPath } from './cards';
import { CardTitle, Glyph, HubCard, Led, Photo, PowerButton, hubIcon, raisedTile } from './hub-ui';

// ─── Shared: the selected server's pulse ─────────────────────────────────────

export interface ServerPulse {
  cpu: number | null;
  memPct: number | null;
  diskPct: number | null;
  latencyMs: number | null;
}

/** Live CPU / memory / latency every 2 s and disk every 60 s while connected */
export function useServerPulse(serverId: string | null, connected: boolean): ServerPulse {
  const [pulse, setPulse] = useState<ServerPulse>({ cpu: null, memPct: null, diskPct: null, latencyMs: null });
  useEffect(() => {
    setPulse({ cpu: null, memPct: null, diskPct: null, latencyMs: null });
    if (!serverId || !connected) return;
    let alive = true;
    let busy = false;
    const live = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetchTaskManager(serverId);
        if (alive && r.success && r.data) {
          const m = r.data.memory;
          setPulse((p) => ({
            ...p,
            cpu: r.data!.cpu.overallPercent,
            memPct: m.totalMb > 0 ? (m.usedMb / m.totalMb) * 100 : null,
            latencyMs: r.totalLatencyMs ?? p.latencyMs,
          }));
        }
      } catch { /* keep the last values */ } finally { busy = false; }
    };
    const disk = async () => {
      try {
        const r = await fetchSystemDashboard(serverId);
        const disks = r.success ? r.data?.disks ?? [] : [];
        const root = disks.find((d) => d.mountPoint === '/') ?? disks[0];
        if (alive && root) setPulse((p) => ({ ...p, diskPct: root.usePercent }));
      } catch { /* optional */ }
    };
    void live(); void disk();
    const a = setInterval(live, 2000);
    const b = setInterval(disk, 60_000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [serverId, connected]);
  return pulse;
}

/** Load level → LED tone */
export function levelTone(pct: number | null): 'green' | 'amber' | 'red' | 'off' {
  if (pct === null) return 'off';
  if (pct >= 90) return 'red';
  if (pct >= 75) return 'amber';
  return 'green';
}

/** Greeting for the hour of day */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/** The two-line headline under the greeting */
export function glanceHeadline(o: { serverName: string | null; connected: boolean; pulse: ServerPulse }): [string, string] {
  if (!o.serverName) return ['No server', 'connected yet'];
  if (!o.connected) return ['Not connected to', o.serverName];
  const hot = [o.pulse.cpu, o.pulse.memPct, o.pulse.diskPct].filter((v) => v !== null && v >= 90).length;
  if (hot > 0) return [`${hot} ${hot === 1 ? 'thing needs' : 'things need'}`, 'attention'];
  return ['All calm on', o.serverName];
}

// ─── Users (the design's "Members") ──────────────────────────────────────────

const MEMBER_BG = [
  'linear-gradient(160deg,#5FB3D6,#2C6F92)', 'linear-gradient(160deg,#D9C59A,#9C8558)',
  'linear-gradient(160deg,#F2C64F,#B98A17)', 'linear-gradient(160deg,#C9CED6,#8A93A0)',
  'linear-gradient(160deg,#5A5A5A,#1E1E1E)', 'linear-gradient(160deg,#D9775F,#8F3826)',
  'linear-gradient(160deg,#4F8F7A,#21483B)',
];

export function useServerUsers(serverId: string | null, connected: boolean): string[] {
  const [users, setUsers] = useState<string[]>([]);
  useEffect(() => {
    setUsers([]);
    if (!serverId || !connected) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchTaskManagerUsers(serverId);
        if (!alive || !r.success || !r.data) return;
        const { accounts, sessions, currentUser } = r.data;
        const names = [currentUser, ...sessions.map((s) => s.user)];
        // People first: accounts that can log in, after the ones with sessions
        for (const a of accounts) if (a.kind !== 'service') names.push(a.name);
        setUsers([...new Set(names)].slice(0, 7));
      } catch { /* leave empty */ }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [serverId, connected]);
  return users;
}

export function UserAvatars({ users, onAdd }: { users: string[]; onAdd: () => void }) {
  return (
    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex' }}>
        {users.map((u, i) => (
          <div
            key={u}
            title={u}
            style={{ width: 60, height: 60, marginLeft: i ? -20 : 0, borderRadius: 999, overflow: 'hidden', background: MEMBER_BG[i % MEMBER_BG.length], position: 'relative', boxShadow: '0 4px 10px rgba(0,0,0,.25)', border: '2px solid rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 600 }}
          >
            {u.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
      <button type="button" title="Manage users" aria-label="Manage users" onClick={onAdd} style={{ width: 56, height: 56, marginLeft: users.length ? 16 : 0, borderRadius: 999, border: '1.5px dashed rgba(255,255,255,.35)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Glyph src={hubIcon('add', true)} size={22} style={{ opacity: 0.6 }} />
      </button>
    </div>
  );
}

// ─── Photo frame (the design's camera) ───────────────────────────────────────

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

const chip = {
  position: 'absolute' as const,
  top: 25,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 16,
  background: 'rgba(120,120,120,.45)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,.18)',
  fontSize: 14,
  fontWeight: 500,
  whiteSpace: 'nowrap' as const,
  color: '#fff',
};

const camButton = (on: boolean) => ({
  width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer',
  background: on ? 'rgba(255,255,255,.38)' : 'rgba(110,110,110,.42)',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)',
});

export function PhotoFrameCard({ serverId, connected, username, onOpenFolder }: {
  serverId: string | null; connected: boolean; username: string | undefined;
  onOpenFolder: (source: 'pictures' | 'wallpapers', path: string) => void;
}) {
  const home = username === 'root' ? '/root' : `/home/${username ?? ''}`;
  const folder = `${home}/Pictures`;
  const [pictures, setPictures] = useState<string[]>([]);
  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [source, setSource] = useState<'pictures' | 'wallpapers'>('pictures');
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    fetchWallpapers().then((w) => setWallpapers([...w.user, ...w.system].map((x) => x.url))).catch(() => {});
  }, []);
  useEffect(() => {
    setPictures([]);
    if (!serverId || !connected || !username) return;
    fetchFiles(serverId, folder)
      .then((entries) => setPictures(entries.filter((e) => e.type === 'file' && IMAGE_RE.test(e.name)).map((e) => `${folder}/${e.name}`)))
      .catch(() => setPictures([]));
  }, [serverId, connected, username, folder]);

  const usePictures = source === 'pictures' && pictures.length > 0;
  const list = useMemo(
    () => (usePictures
      ? pictures.map((p) => resolveServerUrl(`/api/servers/${serverId}/files/download?path=${encodeURIComponent(p)}`))
      : wallpapers),
    [usePictures, pictures, wallpapers, serverId],
  );
  const src = list.length ? list[index % list.length] : null;
  const next = list.length ? list[(index + 1) % list.length] : null;

  useEffect(() => { setIndex(0); }, [usePictures]);
  useEffect(() => {
    if (!playing || list.length < 2) return;
    const id = setInterval(() => setIndex((i) => i + 1), 8000);
    return () => clearInterval(id);
  }, [playing, list.length]);

  const label = usePictures ? 'Pictures' : 'Wallpapers';
  return (
    <section
      aria-label="Photo frame"
      style={{ position: 'absolute', left: 563, top: 191, width: 426, height: 368, borderRadius: 30, overflow: 'hidden', background: '#3b3a36', boxShadow: '0 24px 48px -20px rgba(0,0,0,.6)' }}
    >
      {src && <Photo key={src} src={src} alt={`${label} slideshow`} style={{ width: 426, height: 368, animation: 'hub-in .6s ease-out' }} />}
      {next && next !== src && <link rel="prefetch" href={next} />}
      {!src && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 15, color: 'rgba(255,255,255,.7)' }}>No pictures yet</div>
      )}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.08), transparent 25%, transparent 70%, rgba(0,0,0,.18))' }} />
      <button
        type="button"
        title={pictures.length ? 'Switch between ~/Pictures and wallpapers' : `No images in ${folder} — showing wallpapers`}
        onClick={() => setSource((s) => (s === 'pictures' ? 'wallpapers' : 'pictures'))}
        disabled={!pictures.length}
        style={{ ...chip, left: 24, gap: 8, padding: '0 12px 0 16px', cursor: pictures.length ? 'pointer' : 'default', font: 'inherit', fontSize: 14, fontWeight: 500 }}
      >
        <span>{label}</span>
        <Glyph src={hubIcon('chev')} size={14} />
      </button>
      <div style={{ ...chip, right: 24, gap: 7, padding: '0 14px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: playing ? '#FF3B3B' : 'rgba(255,255,255,.5)', boxShadow: playing ? '0 0 8px rgba(255,59,59,.8)' : 'none' }} />
        Slideshow
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 23, display: 'flex', justifyContent: 'center', gap: 17 }}>
        <button type="button" title="Previous" aria-label="Previous photo" onClick={() => setIndex((i) => (i - 1 + list.length) % Math.max(1, list.length))} style={camButton(false)}>
          <Glyph src={hubIcon('rew')} size={20} />
        </button>
        <button type="button" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} aria-pressed={playing} onClick={() => setPlaying((v) => !v)} style={camButton(playing)}>
          <Glyph src={hubIcon(playing ? 'pause' : 'play', true)} size={20} />
        </button>
        <button type="button" title="Next" aria-label="Next photo" onClick={() => setIndex((i) => i + 1)} style={camButton(false)}>
          <Glyph src={hubIcon('ff')} size={20} />
        </button>
        <button type="button" title={usePictures ? 'Open in Files' : 'Change wallpaper'} aria-label={usePictures ? 'Open the folder in Files' : 'Open wallpaper settings'} onClick={() => onOpenFolder(usePictures ? 'pictures' : 'wallpapers', folder)} style={camButton(false)}>
          <Glyph src={hubIcon('expand')} size={20} />
        </button>
      </div>
    </section>
  );
}

// ─── Weather ─────────────────────────────────────────────────────────────────

type Sky = 'sun' | 'suncloud' | 'cloud' | 'rain' | 'moon';

/** WMO weather code → icon + label */
export function skyFor(code: number, isDay = true): { sky: Sky; label: string } {
  const night = (s: Sky): Sky => (!isDay && (s === 'sun' || s === 'suncloud') ? 'moon' : s);
  if (code === 0) return { sky: night('sun'), label: 'Clear' };
  if (code === 1) return { sky: night('suncloud'), label: 'Mainly clear' };
  if (code === 2) return { sky: night('suncloud'), label: 'Partly cloudy' };
  if (code === 3) return { sky: 'cloud', label: 'Overcast' };
  if (code === 45 || code === 48) return { sky: 'cloud', label: 'Fog' };
  if (code >= 51 && code <= 57) return { sky: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { sky: 'rain', label: 'Rain' };
  if (code >= 71 && code <= 77) return { sky: 'cloud', label: 'Snow' };
  if (code >= 80 && code <= 82) return { sky: 'rain', label: 'Showers' };
  if (code === 85 || code === 86) return { sky: 'cloud', label: 'Snow showers' };
  if (code >= 95) return { sky: 'rain', label: 'Thunderstorm' };
  return { sky: 'suncloud', label: 'Cloudy' };
}

function SkyIcon({ sky, big }: { sky: Sky; big: boolean }) {
  const [w, h, sun, cloud] = big ? [62, 56, 36, 46] : [34, 28, 21, 25];
  const sunEl = (
    <span style={{ position: 'absolute', left: 0, top: big ? 0 : -3, width: sun, height: sun, background: 'center / contain no-repeat url(icons/hub/sun-gold.svg)', filter: `drop-shadow(0 0 ${big ? 10 : 6}px rgba(255,186,60,.62))` }} />
  );
  const cloudEl = (icon: 'cloud' | 'rain') => (
    <span style={{ position: 'absolute', right: 0, bottom: 0, width: cloud, height: cloud, background: `center / contain no-repeat url(icons/hub/${icon}-white.svg)`, filter: `drop-shadow(0 ${big ? 3 : 2}px ${big ? 5 : 3}px rgba(0,0,0,.3))` }} />
  );
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      {sky === 'moon' && <Moon aria-hidden style={{ position: 'absolute', left: big ? 8 : 4, top: big ? 4 : 0, width: sun, height: sun, color: '#FFE08A', fill: '#FFE08A', filter: 'drop-shadow(0 0 8px rgba(255,224,138,.5))' }} />}
      {(sky === 'sun' || sky === 'suncloud' || sky === 'rain') && sunEl}
      {(sky === 'suncloud' || sky === 'cloud') && cloudEl('cloud')}
      {sky === 'rain' && cloudEl('rain')}
    </div>
  );
}

export function dayMonthYear(d: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat([], { day: 'numeric', month: 'long', year: 'numeric', timeZone }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

function weekdayOf(isoDate: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString([], { weekday: style });
}

export function WeatherGlanceCard({ onSetCity }: { onSetCity: () => void }) {
  const location = usePreferencesStore((s) => s.weatherLocation);
  const units = usePreferencesStore((s) => s.weatherUnits);
  const setUnits = usePreferencesStore((s) => s.setWeatherUnits);
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(0);

  useEffect(() => {
    setData(null); setError(null);
    if (!location) return;
    let alive = true;
    const load = () => fetchWeather(location.latitude, location.longitude, units)
      .then((r) => { if (alive) { if (r.success && r.data) setData(r.data); else setError(r.error ?? 'Weather unavailable'); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Weather unavailable'); });
    void load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [location, units]);

  const tz = data?.timezone;
  const now = new Date();
  const weekday = now.toLocaleDateString([], { weekday: 'long', timeZone: tz });
  // Day-first, as in the design ("20 June 2025"), whatever the locale's order
  const dateLine = dayMonthYear(now, tz);

  if (!location || (!data && error)) {
    return (
      <HubCard label="Weather" left={1013} top={191} width={446} height={370} radius={30} tint="rgba(110,118,126,.22)">
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
          <SkyIcon sky="suncloud" big />
          <div style={{ fontSize: 19, lineHeight: '26px', color: 'rgba(255,255,255,.88)' }}>
            {location ? error : 'Set your city to see the weather here'}
          </div>
          <button type="button" onClick={onSetCity} style={{ height: 40, padding: '0 20px', borderRadius: 20, border: '1px solid rgba(255,255,255,.22)', background: 'rgba(255,255,255,.18)', color: '#fff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {location ? 'Change city' : 'Set city'}
          </button>
        </div>
      </HubCard>
    );
  }

  const cur = data?.current;
  const sky = cur ? skyFor(cur.code, cur.isDay) : { sky: 'suncloud' as Sky, label: '…' };
  const windUnit = units === 'fahrenheit' ? 'mph' : 'km/h';
  return (
    <HubCard label="Weather" left={1013} top={191} width={446} height={370} radius={30} tint="rgba(110,118,126,.22)">
      <div style={{ position: 'absolute', left: 22, top: 34 }}><SkyIcon sky={sky.sky} big /></div>
      <div style={{ position: 'absolute', left: 96, top: 30, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 33, lineHeight: '38px', fontWeight: 600 }}>{cur ? cur.temperature : '–'}</span>
        <button
          type="button"
          onClick={() => setUnits(units === 'celsius' ? 'fahrenheit' : 'celsius')}
          title="Switch °C / °F"
          style={{ fontSize: 18, lineHeight: '24px', marginTop: 4, fontWeight: 500, background: 'transparent', border: 'none', padding: 0, color: '#fff', cursor: 'pointer', font: 'inherit' }}
        >
          <span style={{ opacity: units === 'celsius' ? 1 : 0.55 }}>°C</span> |<span style={{ opacity: units === 'fahrenheit' ? 1 : 0.55 }}>°F</span>
        </button>
      </div>
      <div style={{ position: 'absolute', left: 96, top: 68, maxWidth: 190, fontSize: 19, lineHeight: '24px', color: 'rgba(255,255,255,.82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={location.name}>
        {sky.label} · {location.name}
      </div>
      <div style={{ position: 'absolute', right: 22, top: 28, fontSize: 31, lineHeight: '38px', fontWeight: 400 }}>{weekday}</div>
      <div style={{ position: 'absolute', right: 22, top: 76, fontSize: 19, lineHeight: '24px', color: 'rgba(255,255,255,.88)' }}>{dateLine}</div>
      {[
        { left: 24, icon: 'drop', value: cur ? `${cur.humidity}%` : '–', label: 'Humidity' },
        { left: 222, icon: 'wind', value: cur ? `${cur.windSpeed} ${windUnit}` : '–', label: 'Wind Speed' },
      ].map((m) => (
        <div key={m.label} style={{ position: 'absolute', left: m.left, top: 128, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={raisedTile}><Glyph src={hubIcon(m.icon)} size={20} /></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, lineHeight: '26px', fontWeight: 600 }}>{m.value}</span>
            <span style={{ fontSize: 15, lineHeight: '18px', color: 'rgba(255,255,255,.82)' }}>{m.label}</span>
          </div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: 24, right: 24, top: 205, height: 1, background: 'rgba(255,255,255,.22)' }} />
      <div style={{ position: 'absolute', left: 24, right: 24, top: 237, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {(data?.daily ?? []).map((d, i) => {
          const on = i === day;
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={on}
              onClick={() => setDay(i)}
              title={`${weekdayOf(d.date, 'long')}: ${skyFor(d.code).label}`}
              style={{
                height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 14, border: `1px solid ${on ? 'rgba(255,255,255,.18)' : 'transparent'}`, cursor: 'pointer', color: '#fff', font: 'inherit',
                background: on ? 'rgba(255,255,255,.24)' : 'transparent', boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 23, lineHeight: '26px', fontWeight: on ? 600 : 500 }}>{weekdayOf(d.date)}</span>
              <SkyIcon sky={skyFor(d.code).sky} big={false} />
              <span style={{ fontSize: 15, lineHeight: '18px', fontVariantNumeric: 'tabular-nums' }}>{d.max}° | {d.min}°</span>
            </button>
          );
        })}
      </div>
    </HubCard>
  );
}

// ─── Server health dial (the design's air conditioner) ───────────────────────

const A0 = -100, A1 = 100, CX = 100, CY = 100, R = 86;
const METRICS = [
  { id: 'cpu', label: 'CPU', Icon: Cpu },
  { id: 'mem', label: 'Memory', Icon: MemoryStick },
  { id: 'disk', label: 'Disk', Icon: HardDrive },
] as const;

export function HealthDialCard({ serverName, connected, pulse, onOpen }: {
  serverName: string | null; connected: boolean; pulse: ServerPulse; onOpen: () => void;
}) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['id']>('cpu');
  const raw = metric === 'cpu' ? pulse.cpu : metric === 'mem' ? pulse.memPct : pulse.diskPct;
  const value = raw === null ? null : Math.max(0, Math.min(100, raw));
  const ka = A0 + (A1 - A0) * ((value ?? 0) / 100);
  const kx = CX + R * Math.sin((ka * Math.PI) / 180);
  const ky = CY - R * Math.cos((ka * Math.PI) / 180);
  const tone = connected ? levelTone(value) : 'off';
  const label = METRICS.find((m) => m.id === metric)!.label;

  return (
    <HubCard label="Server health" left={77} top={583} width={326} height={370} tint="rgba(96,78,66,.24)">
      <Led on={tone !== 'off'} tone={tone === 'off' ? undefined : tone} left={24} top={30} />
      <CardTitle left={78} top={28} title="Server health" subtitle={serverName ?? 'No server'} />
      <PowerButton on={connected} onToggle={onOpen} right={22} top={36} label="Server health" ariaLabel="Open Task Manager" title="Open Task Manager" />
      <div
        role="meter"
        aria-label={`${label} use`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value)}
        style={{ position: 'absolute', left: 63, top: 113, width: 200, height: 170 }}
      >
        <svg width="200" height="170" viewBox="0 0 200 170" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id="hub-g-health" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#5E3BE6" />
              <stop offset="1" stopColor="#9C8BFF" />
            </linearGradient>
          </defs>
          <path d={arcPath(CX, CY, 68, A0, A1)} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="7" strokeDasharray="1.2 4.2" />
          <path d={arcPath(CX, CY, R, ka, A1)} fill="none" stroke="rgba(235,235,240,.85)" strokeWidth="9" strokeLinecap="round" />
          {value !== null && value > 0.5 && <path d={arcPath(CX, CY, R, A0, ka)} fill="none" stroke="url(#hub-g-health)" strokeWidth="9" strokeLinecap="round" />}
        </svg>
        <span style={{ position: 'absolute', left: kx, top: ky, width: 24, height: 24, margin: '-12px 0 0 -12px', borderRadius: 999, background: '#7D63FF', border: '4px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)', transition: 'left .6s ease, top .6s ease' }} />
        <div style={{ position: 'absolute', left: 52, top: 52, width: 96, height: 96, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 30%, rgba(80,70,64,.55), rgba(40,34,30,.55))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>
          <span style={{ fontSize: 34, lineHeight: 1, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
            {value === null ? '–' : Math.round(value)}<span style={{ fontSize: 18 }}>%</span>
          </span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 298, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {METRICS.map(({ id, label: l, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === metric}
            onClick={() => setMetric(id)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff', font: 'inherit', opacity: id === metric ? 1 : 0.62 }}
          >
            <Icon aria-hidden style={{ width: 22, height: 22 }} strokeWidth={1.75} />
            <span style={{ fontSize: 17, lineHeight: '20px', fontWeight: id === metric ? 600 : 400 }}>{l}</span>
          </button>
        ))}
      </div>
    </HubCard>
  );
}

// ─── Recent apps (the design's TV) ───────────────────────────────────────────

const TILE_BG = ['#0B0B0B', '#0F171E', '#000', '#0A0A14'];

export function recentAppIds(recent: Array<{ appId: string; timestamp: number }>, fallback: string[]): string[] {
  const known = new Set(APPS.map((a) => a.id));
  const ids = [...recent].sort((a, b) => b.timestamp - a.timestamp).map((r) => r.appId).filter((id) => known.has(id));
  return [...new Set([...ids, ...fallback.filter((id) => known.has(id))])].slice(0, 4);
}

export function RecentAppsCard({ serverName, canLaunch, onLaunch, onMore, onShowDesktop }: {
  serverName: string | null; canLaunch: boolean;
  onLaunch: (appId: string) => void; onMore: () => void; onShowDesktop: () => void;
}) {
  const recent = usePreferencesStore((s) => s.recentApps);
  const pinned = usePreferencesStore((s) => s.pinnedAppIds);
  const ids = recentAppIds(recent, pinned);
  return (
    <HubCard label="Recent apps" left={427} top={583} width={445} height={178} tint="rgba(90,92,96,.24)">
      <Glyph src={hubIcon('monitor')} size={30} style={{ position: 'absolute', left: 24, top: 34 }} />
      <CardTitle left={70} top={24} title="Recent apps" subtitle={serverName ?? 'Connect a server to open apps'} />
      <PowerButton on onToggle={onShowDesktop} right={22} top={32} label="Recent apps" ariaLabel="Show desktop" title="Show desktop" />
      <div style={{ position: 'absolute', left: 24, top: 98, display: 'flex', gap: 10 }}>
        {ids.map((id, i) => {
          const name = APPS.find((a) => a.id === id)?.name ?? id;
          return (
            <button
              key={id}
              type="button"
              title={name}
              aria-label={`Open ${name}`}
              disabled={!canLaunch}
              onClick={() => onLaunch(id)}
              style={{ width: 58, height: 58, borderRadius: 12, border: 'none', display: 'grid', placeItems: 'center', cursor: canLaunch ? 'pointer' : 'default', background: TILE_BG[i % TILE_BG.length], boxShadow: '0 6px 14px -6px rgba(0,0,0,.6)', opacity: canLaunch ? 1 : 0.5 }}
            >
              <AppIcon appId={id} size={34} />
            </button>
          );
        })}
        <button type="button" title="All apps" aria-label="All apps" onClick={onMore} style={{ width: 58, height: 58, borderRadius: 12, border: '1.5px dashed rgba(255,255,255,.4)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Glyph src={hubIcon('add', true)} size={22} style={{ opacity: 0.85 }} />
        </button>
      </div>
    </HubCard>
  );
}

// ─── Display (the design's ambient LED) ──────────────────────────────────────

export function DisplayCard() {
  const brightness = usePreferencesStore((s) => s.displayBrightness);
  const setBrightness = usePreferencesStore((s) => s.setDisplayBrightness);
  const night = usePreferencesStore((s) => s.nightLight);
  const setNight = usePreferencesStore((s) => s.setNightLight);
  const pos = ((brightness - 40) / 60) * 100;
  return (
    <HubCard label="Display" left={427} top={781} width={445} height={172} tint="rgba(96,82,72,.24)">
      <Led on={night} tone="warm" left={24} top={30} />
      <CardTitle left={78} top={24} title="Display" subtitle={night ? 'Night light on' : 'Night light off'} />
      <PowerButton on={night} onToggle={() => setNight(!night)} right={22} top={32} label="Night light" />
      <div style={{ position: 'absolute', left: 24, right: 24, top: 98, display: 'flex', justifyContent: 'space-between', fontSize: 17, lineHeight: '20px', color: 'rgba(255,255,255,.9)' }}>
        <span>Brightness</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{brightness}%</span>
      </div>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 134, height: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 12, borderRadius: 6, background: 'linear-gradient(90deg, #17181C, #5C5F66 45%, #F4F0E6)' }} />
        <div style={{ position: 'absolute', left: `calc(${pos}% - 13px)`, width: 26, height: 26, borderRadius: 999, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.45)', pointerEvents: 'none' }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: `hsl(40 30% ${20 + (brightness - 40) * 1.1}%)` }} />
        </div>
        <input
          type="range"
          min={40}
          max={100}
          value={brightness}
          aria-label="Display brightness"
          onChange={(e) => setBrightness(+e.target.value)}
          style={{ position: 'absolute', left: 0, right: 0, top: -8, width: '100%', height: 32, margin: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
    </HubCard>
  );
}

// ─── Assistant (the design's Alexa) ──────────────────────────────────────────

export function AssistantCard({ canOpen, onOpen, onSettings }: { canOpen: boolean; onOpen: () => void; onSettings: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    fetchLLMConfig().then((r) => setConfigured(!!r.data && r.data.provider !== 'none' && r.data.hasApiKey)).catch(() => setConfigured(false));
  }, []);
  return (
    <HubCard label="Assistant" left={896} top={583} width={211} height={178} tint="rgba(100,108,118,.24)" clip>
      <div style={{ position: 'absolute', left: 22, top: 22, fontSize: 21, lineHeight: '26px', fontWeight: 500 }}>Assistant</div>
      <PowerButton on={!!configured} onToggle={onSettings} right={22} top={20} label="Assistant" ariaLabel={configured ? 'AI settings' : 'Set up AI'} title={configured ? 'AI settings' : 'Set up AI'} />
      <button
        type="button"
        onClick={canOpen ? onOpen : onSettings}
        title={configured ? 'Open the AI agent' : 'Set up an AI provider'}
        aria-label={configured ? 'Open the AI agent' : 'Set up an AI provider'}
        style={{ position: 'absolute', left: 59, top: 66, width: 92, height: 92, borderRadius: 999, border: '1px solid rgba(255,255,255,.16)', display: 'grid', placeItems: 'center', cursor: 'pointer', background: 'radial-gradient(circle at 50% 35%, rgba(70,70,80,.9), rgba(20,20,26,.95))', boxShadow: configured ? '0 0 0 3px rgba(125,99,255,.25), 0 10px 22px -10px rgba(0,0,0,.7)' : '0 10px 22px -10px rgba(0,0,0,.7)', opacity: configured === false ? 0.75 : 1 }}
      >
        <AppIcon appId="agent" size={52} />
      </button>
    </HubCard>
  );
}

// ─── Connection (the design's WiFi) ──────────────────────────────────────────

export function ConnectionCard({ serverId, status, latencyMs }: { serverId: string | null; status: string | undefined; latencyMs: number | null }) {
  const connect = useAppStore((s) => s.connectServer);
  const disconnect = useAppStore((s) => s.disconnectServer);
  const connected = status === 'connected';
  const busy = status === 'connecting';
  const caption = !serverId ? 'No server' : busy ? 'Connecting…' : connected ? (latencyMs !== null ? `${latencyMs} ms` : 'Online') : 'Offline';
  const toggle = async () => {
    if (!serverId || busy) return;
    try {
      if (connected) await disconnect(serverId);
      else await connect(serverId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection failed');
    }
  };
  return (
    <HubCard label="Connection" left={896} top={781} width={211} height={172} tint="rgba(100,102,110,.24)" clip>
      <div style={{ position: 'absolute', left: 22, top: 22, fontSize: 21, lineHeight: '26px', fontWeight: 500 }}>Connection</div>
      <PowerButton on={connected} onToggle={() => void toggle()} right={22} top={20} label="Connection" ariaLabel={connected ? 'Disconnect' : 'Connect'} title={connected ? 'Disconnect' : 'Connect'} />
      <Photo src="hub/hub-router.jpg" alt="" style={{ position: 'absolute', left: 50, top: 64, width: 110, height: 96, borderRadius: 12, opacity: connected ? 1 : 0.55 }} />
      <span style={{ position: 'absolute', left: '50%', top: 132, transform: 'translateX(-50%)', height: 22, padding: '0 10px', borderRadius: 11, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(20,20,24,.62)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.16)', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: connected ? '#34D27B' : busy ? '#F5B83D' : 'rgba(255,255,255,.4)' }} />
        {caption}
      </span>
    </HubCard>
  );
}

// ─── Servers (the design's rooms bar) ────────────────────────────────────────

export function ServerBar({ servers, selected, onSelect, onAdd, pressed }: {
  servers: Array<{ id: string; name: string }>; selected: string | null;
  onSelect: (id: string) => void; onAdd: () => void;
  pressed: (on: boolean) => React.CSSProperties;
}) {
  const shown = servers.slice(0, 6);
  return (
    <>
      {shown.map((s) => {
        const on = s.id === selected;
        return (
          <button
            key={s.id}
            type="button"
            title={s.name}
            aria-label={s.name}
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(s.id)}
            style={{ ...pressed(on), height: 60, flex: 'none', padding: `0 ${on ? 24 : 18}px`, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 30, border: 'none', cursor: 'pointer', color: '#fff', font: 'inherit', fontSize: 18, fontWeight: 500, transition: 'all .2s' }}
          >
            <Server aria-hidden style={{ width: 24, height: 24, flex: 'none' }} strokeWidth={1.75} />
            {on && <span style={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>}
          </button>
        );
      })}
      <button
        type="button"
        title="Add a server"
        aria-label="Add a server"
        onClick={onAdd}
        className="[background:linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.12))] hover:[background:linear-gradient(180deg,rgba(255,255,255,.40),rgba(255,255,255,.18))]"
        style={{ width: 56, height: 56, flex: 'none', marginLeft: 6, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid rgba(255,255,255,.28)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 6px 14px -6px rgba(0,0,0,.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <Glyph src={hubIcon('add', true)} size={22} />
      </button>
    </>
  );
}
