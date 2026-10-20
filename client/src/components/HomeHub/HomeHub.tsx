// EX8.10: HomeHub — the LumenOS smart-home overlay, ported from the Claude Design
// prototype (HomeHub.dc.html) as React. Opened from the dock's Home button;
// Escape or a click outside the cards closes it.
// EX8.15: a glance — the same layout re-bound to real data: greeting with the
// local user, users on the selected server, a photo frame from ~/Pictures,
// Open-Meteo weather, a server health dial, recent apps, display brightness /
// night light, the AI assistant, the connection, and the saved servers in the
// room bar. The music card is still the sample. See phase-ex8.md for the table.
// @see docs/phases/phase-ex8.md

import { useEffect, useState, type MouseEvent } from 'react';
import { useDesktopStore } from '../../store/window-store';
import { useAppStore } from '../../store/app-store';
import { usePreferencesStore } from '../../store/preferences-store';
import { useNotificationStore } from '../../store/notification-store';
import { eventBus } from '../../lib/event-bus';
import { fetchHostInfo } from '../../lib/api';
import { APPS } from '../../lib/apps';
import { Glyph, hubIcon, pressedPill } from './hub-ui';
import { PlayerCard } from './cards';
import {
  AssistantCard, ConnectionCard, DisplayCard, HealthDialCard, PhotoFrameCard, RecentAppsCard, ServerBar,
  UserAvatars, WeatherGlanceCard, glanceHeadline, greetingFor, useServerPulse, useServerUsers,
} from './glance';

const CANVAS_W = 1536;
const CANVAS_H = 1150;

/** The prototype's fit: never wider than 1600px of viewport, never above 82% */
export function hubScale(vw: number, vh: number): number {
  return Math.min(vw / 1600, (vh - 24) / 1170, 0.82);
}

const NAV: Array<[string, string]> = [
  ['search', 'Search'], ['grid', 'Overview'], ['cal', 'Calendar'],
  ['remote3', 'Scenes'], ['bell', 'Alerts'], ['pie', 'Energy'],
];

const pillBar = {
  background: 'linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,.08)), rgba(120,110,104,.22)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255,255,255,.18)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 20px 40px -20px rgba(0,0,0,.5)',
};

/** The design's 60px fits ~15 characters in the greeting column; longer server names shrink to fit (min 40px) */
export function headlineSize(line1: string, line2: string): number {
  const longest = Math.max(line1.length, line2.length);
  return Math.max(40, Math.min(60, Math.floor((60 * 15) / longest)));
}

export function HomeHub() {
  const open = useDesktopStore((s) => s.homeHubOpen);
  if (!open) return null;
  return <HomeHubOverlay />;
}

function HomeHubOverlay() {
  const close = useDesktopStore((s) => s.closeHomeHub);
  // EX8.17: opened by the idle timer → any key returns to the desktop
  const away = useDesktopStore((s) => s.homeHubReason === 'idle');
  const openWindow = useDesktopStore((s) => s.openWindow);
  const toggleStartMenu = useDesktopStore((s) => s.toggleStartMenu);
  const toggleShowDesktop = useDesktopStore((s) => s.toggleShowDesktop);
  const servers = useAppStore((s) => s.servers);
  const activeServerId = useAppStore((s) => s.activeServerId);
  const goToLogin = useAppStore((s) => s.goToLogin);
  const showToasts = usePreferencesStore((s) => s.showToasts);
  const setShowToasts = usePreferencesStore((s) => s.setShowToasts);
  const openPanel = useNotificationStore((s) => s.openPanel);

  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [username, setUsername] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // The hub's subject: the active session's server by default; the room bar re-points it
  const [serverId, setServerId] = useState<string | null>(activeServerId ?? servers[0]?.id ?? null);
  const k = hubScale(viewport.w, viewport.h);

  const server = servers.find((s) => s.id === serverId) ?? null;
  const status = server?.state?.status;
  const connected = status === 'connected';
  const pulse = useServerPulse(serverId, connected);
  const users = useServerUsers(serverId, connected);
  const [line1, line2] = glanceHeadline({ serverName: server?.name ?? null, connected, pulse });

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || away) close(); };
    const tick = setInterval(() => setNow(new Date()), 60_000);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(tick); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [close, away]);

  useEffect(() => {
    fetchHostInfo().then((r) => { if (r.success && r.data) setUsername(r.data.username); }).catch(() => {});
  }, []);

  // Clicks on the backdrop (not on a card) close the hub
  const onBg = (e: MouseEvent) => { if (e.target === e.currentTarget) close(); };

  /** Close the hub, then open an app window on the hub's server */
  const launch = (appId: string, meta?: Record<string, string>) => {
    const target = appId === 'settings' ? (serverId ?? '') : serverId;
    if (target === null) return;
    close();
    const appName = APPS.find((a) => a.id === appId)?.name ?? appId;
    openWindow(appId, target, appName, appId, meta);
  };
  const thenClose = (fn: () => void) => () => { close(); fn(); };

  const navActions: Record<string, () => void> = {
    Search: thenClose(() => eventBus.emit('palette:toggle', {})),
    Overview: () => {},
    Calendar: thenClose(openPanel),
    Scenes: thenClose(toggleStartMenu),
    Alerts: () => setShowToasts(!showToasts),
    Energy: () => launch('taskmanager'),
  };
  const navTitles: Record<string, string> = {
    Search: 'Search', Overview: 'Overview', Calendar: 'Calendar and notifications', Scenes: 'Launcher',
    Alerts: showToasts ? 'Notifications on (click to mute)' : 'Notifications muted (click to turn on)', Energy: 'Task Manager',
  };

  const name = username ? username.charAt(0).toUpperCase() + username.slice(1) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Home hub"
      onClick={onBg}
      className="animate-[hub-in_.25s_ease-out]"
      style={{
        position: 'absolute', inset: 0, zIndex: 10050, overflow: 'hidden', display: 'grid', placeItems: 'center',
        color: '#fff', fontFamily: "'Manrope Variable', 'Manrope', system-ui, sans-serif",
        // The app's body sets tabular digits; the prototype uses proportional ones
        fontVariantNumeric: 'normal',
        background: 'radial-gradient(ellipse 50% 60% at 18% 28%, rgba(214,140,62,.42), transparent 70%), radial-gradient(ellipse 60% 50% at 85% 20%, rgba(110,130,150,.25), transparent 70%), linear-gradient(180deg, rgba(38,26,18,.55), rgba(20,14,10,.72))',
        backdropFilter: 'blur(34px) saturate(120%)',
        WebkitBackdropFilter: 'blur(34px) saturate(120%)',
      }}
    >
      {away && (
        <div
          role="status"
          style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1, height: 30, padding: '0 14px', borderRadius: 15, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,.88)', background: 'rgba(20,16,14,.4)', border: '1px solid rgba(255,255,255,.14)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', pointerEvents: 'none' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#F5B83D' }} />
          Away · press any key to return
        </div>
      )}
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%', width: CANVAS_W, height: CANVAS_H,
          margin: `-${CANVAS_H / 2}px 0 0 -${CANVAS_W / 2}px`, transform: `scale(${k.toFixed(4)})`,
          transformOrigin: 'center center', pointerEvents: 'none',
        }}
      >
        <div
          data-testid="hub-canvas"
          onClick={onBg}
          className="animate-[hub-rise_.35s_ease-out]"
          style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, pointerEvents: 'auto' }}
        >
          {/* Top nav: each icon opens the matching HeadlessOS feature */}
          <nav
            aria-label="Home hub sections"
            style={{ ...pillBar, position: 'absolute', left: 546, top: 84, width: 444, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderRadius: 38 }}
          >
            {NAV.map(([icon, title]) => {
              const on = title === 'Overview';
              return (
                <button
                  key={title}
                  type="button"
                  title={navTitles[title]}
                  aria-label={navTitles[title]}
                  aria-current={on ? 'page' : undefined}
                  aria-pressed={title === 'Alerts' ? showToasts : undefined}
                  onClick={navActions[title]}
                  style={{ ...pressedPill(on), width: on ? 70 : 52, height: 52, borderRadius: 26, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .2s', opacity: title === 'Alerts' && !showToasts ? 0.5 : 1 }}
                >
                  <Glyph src={hubIcon(icon)} size={24} />
                </button>
              );
            })}
          </nav>

          {/* Greeting + users */}
          <div style={{ position: 'absolute', left: 76, top: 192, display: 'flex', flexDirection: 'column', maxWidth: 470 }}>
            <div style={{ fontSize: 31, lineHeight: '40px', fontWeight: 400, letterSpacing: '-.005em' }}>
              {greetingFor(now.getHours())}{name ? ` ${name}` : ''}!
            </div>
            <div style={{ marginTop: 14, fontSize: headlineSize(line1, line2), lineHeight: '70px', fontWeight: 400, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${line1} ${line2}`}>
              {line1}<br />{line2}
            </div>
            <div style={{ marginTop: 38, fontSize: 31, lineHeight: '40px', fontWeight: 400 }}>Users</div>
            <UserAvatars users={users} onAdd={() => launch('serveradmin')} />
          </div>

          <PhotoFrameCard
            serverId={serverId}
            connected={connected}
            username={server?.username}
            onOpenFolder={(source, path) => (source === 'pictures' ? launch('files', { initialPath: path }) : launch('settings', { initialPage: 'wallpaper' }))}
          />
          <WeatherGlanceCard onSetCity={() => launch('settings', { initialPage: 'general' })} />
          <HealthDialCard serverName={server?.name ?? null} connected={connected} pulse={pulse} onOpen={() => launch('taskmanager')} />
          <RecentAppsCard
            serverName={server?.name ?? null}
            canLaunch={connected}
            onLaunch={(id) => launch(id)}
            onMore={thenClose(toggleStartMenu)}
            onShowDesktop={thenClose(toggleShowDesktop)}
          />
          <DisplayCard />
          <AssistantCard canOpen={connected} onOpen={() => launch('agent')} onSettings={() => launch('settings', { initialPage: 'ai' })} />
          <ConnectionCard serverId={serverId} status={status} latencyMs={pulse.latencyMs} />
          <PlayerCard />

          {/* Room bar: saved servers */}
          <nav
            aria-label="Servers"
            style={{ ...pillBar, background: 'linear-gradient(160deg, rgba(255,255,255,.2), rgba(255,255,255,.06)), rgba(110,96,86,.24)', position: 'absolute', left: 768, top: 984, transform: 'translateX(-50%)', height: 84, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', whiteSpace: 'nowrap', borderRadius: 42 }}
          >
            <ServerBar
              servers={servers}
              selected={serverId}
              onSelect={setServerId}
              onAdd={thenClose(goToLogin)}
              pressed={pressedPill}
            />
          </nav>
        </div>
      </div>
    </div>
  );
}
