// EX8.10: HomeHub — the LumenOS smart-home overlay, ported from the Claude Design
// prototype (HomeHub.dc.html) as React. A client-only sample: devices, members
// and rooms are local state; nothing is read from or sent to a server.
// Opened from the dock's Home button; Escape or a click outside the cards closes it.
// @see docs/phases/phase-ex8.md

import { useEffect, useState, type MouseEvent } from 'react';
import { useDesktopStore } from '../../store/window-store';
import { Glyph, hubIcon, pressedPill } from './hub-ui';
import {
  AirConditionerCard, AlexaCard, CameraCard, LedCard, PlayerCard, TvCard, WeatherCard, WifiCard,
} from './cards';

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

const ROOMS: Array<[string, string]> = [
  ['couch', 'Living room'], ['bath', 'Bathroom'], ['chair', 'Study'], ['car', 'Garage'], ['bin', 'Kitchen'],
];

const MEMBER_BG = [
  'linear-gradient(160deg,#5FB3D6,#2C6F92)', 'linear-gradient(160deg,#D9C59A,#9C8558)',
  'linear-gradient(160deg,#F2C64F,#B98A17)', 'linear-gradient(160deg,#C9CED6,#8A93A0)',
  'linear-gradient(160deg,#5A5A5A,#1E1E1E)', 'linear-gradient(160deg,#D9775F,#8F3826)',
  'linear-gradient(160deg,#4F8F7A,#21483B)',
];

const pillBar = {
  background: 'linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,.08)), rgba(120,110,104,.22)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255,255,255,.18)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18), 0 20px 40px -20px rgba(0,0,0,.5)',
};

export function HomeHub() {
  const open = useDesktopStore((s) => s.homeHubOpen);
  if (!open) return null;
  return <HomeHubOverlay />;
}

function HomeHubOverlay() {
  const close = useDesktopStore((s) => s.closeHomeHub);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [nav, setNav] = useState(1);
  const [room, setRoom] = useState(0);
  const k = hubScale(viewport.w, viewport.h);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [close]);

  // Clicks on the backdrop (not on a card) close the hub
  const onBg = (e: MouseEvent) => { if (e.target === e.currentTarget) close(); };

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
          {/* Top nav */}
          <nav
            aria-label="Home hub sections"
            style={{ ...pillBar, position: 'absolute', left: 546, top: 84, width: 444, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderRadius: 38 }}
          >
            {NAV.map(([icon, title], i) => (
              <button
                key={title}
                type="button"
                title={title}
                aria-label={title}
                aria-current={i === nav ? 'page' : undefined}
                onClick={() => setNav(i)}
                style={{ ...pressedPill(i === nav), width: i === nav ? 70 : 52, height: 52, borderRadius: 26, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .2s' }}
              >
                <Glyph src={hubIcon(icon)} size={24} />
              </button>
            ))}
          </nav>

          {/* Greeting + members */}
          <div style={{ position: 'absolute', left: 76, top: 192, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 31, lineHeight: '40px', fontWeight: 400, letterSpacing: '-.005em' }}>Good Morning Zia!</div>
            <div style={{ marginTop: 14, fontSize: 60, lineHeight: '70px', fontWeight: 400, letterSpacing: '-.01em' }}>Laid-back Eco<br />Home Vibes</div>
            <div style={{ marginTop: 38, fontSize: 31, lineHeight: '40px', fontWeight: 400 }}>Members</div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {MEMBER_BG.map((bg, i) => (
                  <div
                    key={bg}
                    style={{ width: 60, height: 60, marginLeft: i ? -20 : 0, borderRadius: 999, overflow: 'hidden', background: bg, position: 'relative', boxShadow: '0 4px 10px rgba(0,0,0,.25)', border: '2px solid rgba(255,255,255,.18)' }}
                  >
                    <img src={`hub/member-${i + 1}.jpg`} alt="" draggable={false} style={{ width: 60, height: 60, objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
              </div>
              <button type="button" title="Add member" aria-label="Add member" style={{ width: 56, height: 56, marginLeft: 16, borderRadius: 999, border: '1.5px dashed rgba(255,255,255,.35)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                <Glyph src={hubIcon('add', true)} size={22} style={{ opacity: 0.6 }} />
              </button>
            </div>
          </div>

          <CameraCard />
          <WeatherCard />
          <AirConditionerCard scale={k} />
          <TvCard />
          <LedCard />
          <AlexaCard />
          <WifiCard />
          <PlayerCard />

          {/* Room bar */}
          <nav
            aria-label="Rooms"
            style={{ ...pillBar, background: 'linear-gradient(160deg, rgba(255,255,255,.2), rgba(255,255,255,.06)), rgba(110,96,86,.24)', position: 'absolute', left: 768, top: 984, transform: 'translateX(-50%)', height: 84, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', whiteSpace: 'nowrap', borderRadius: 42 }}
          >
            {ROOMS.map(([icon, name], i) => {
              const on = i === room;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setRoom(i)}
                  style={{ ...pressedPill(on), height: 60, flex: 'none', padding: `0 ${on ? 24 : 18}px`, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 30, border: 'none', cursor: 'pointer', color: '#fff', font: 'inherit', fontSize: 18, fontWeight: 500, transition: 'all .2s' }}
                >
                  <Glyph src={hubIcon(icon)} size={24} />
                  {on && <span style={{ whiteSpace: 'nowrap' }}>{name}</span>}
                </button>
              );
            })}
            <button
              type="button"
              title="Add room"
              aria-label="Add room"
              className="[background:linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.12))] hover:[background:linear-gradient(180deg,rgba(255,255,255,.40),rgba(255,255,255,.18))]"
              style={{ width: 56, height: 56, flex: 'none', marginLeft: 6, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid rgba(255,255,255,.28)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 6px 14px -6px rgba(0,0,0,.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            >
              <Glyph src={hubIcon('add', true)} size={22} />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
