// EX8.10: HomeHub cards — camera, weather, air conditioner, TV, ambient LED,
// Alexa, WiFi and the music player. Positions and sizes are HomeHub.dc.html's.
// All state is local sample data; nothing here talks to a server.
// @see docs/phases/phase-ex8.md

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CardTitle, Glyph, HubCard, Led, Photo, PowerButton, hubIcon, raisedTile,
} from './hub-ui';

const PHOTO = (n: string) => `hub/${n}.jpg`;

// ─── Camera ──────────────────────────────────────────────────────────────────

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
};

export function CameraCard() {
  const [rec, setRec] = useState(false);
  const [mic, setMic] = useState(false);
  const buttons: Array<{ icon: string; title: string; on?: boolean; onClick?: () => void }> = [
    { icon: 'record', title: 'Record', on: rec, onClick: () => setRec((v) => !v) },
    { icon: 'mic', title: 'Talk', on: mic, onClick: () => setMic((v) => !v) },
    { icon: 'expand', title: 'Full screen' },
    { icon: 'power', title: 'Camera power' },
  ];
  return (
    <section
      aria-label="Camera 1"
      style={{ position: 'absolute', left: 563, top: 191, width: 426, height: 368, borderRadius: 30, overflow: 'hidden', background: '#3b3a36', boxShadow: '0 24px 48px -20px rgba(0,0,0,.6)' }}
    >
      <Photo src={PHOTO('hub-camera')} alt="Living room camera feed" style={{ width: 426, height: 368 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(0,0,0,.08), transparent 25%, transparent 70%, rgba(0,0,0,.18))' }} />
      <div style={{ ...chip, left: 24, gap: 8, padding: '0 12px 0 16px' }}>
        <span>Camera 1</span>
        <Glyph src={hubIcon('chev')} size={14} />
      </div>
      <div style={{ ...chip, right: 24, gap: 7, padding: '0 14px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: '#FF3B3B', boxShadow: '0 0 8px rgba(255,59,59,.8)', opacity: rec ? 1 : 0.95 }} />
        Live
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 23, display: 'flex', justifyContent: 'center', gap: 17 }}>
        {buttons.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-label={b.title}
            aria-pressed={b.onClick ? !!b.on : undefined}
            onClick={b.onClick}
            style={{
              width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer',
              background: b.on ? 'rgba(255,255,255,.38)' : 'rgba(110,110,110,.42)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)',
            }}
          >
            <Glyph src={hubIcon(b.icon, !!b.on)} size={20} />
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Weather ─────────────────────────────────────────────────────────────────

const DAYS: Array<[string, 'cloud' | 'rain', string]> = [
  ['Sat', 'cloud', '30° | 22°'],
  ['Sun', 'rain', '28° | 20°'],
  ['Mon', 'cloud', '31° | 23°'],
  ['Tue', 'rain', '29° | 19°'],
];

function SunCloud({ sun, cloud, cloudIcon, w, h }: { sun: number; cloud: number; cloudIcon: string; w: number; h: number }) {
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <span style={{ position: 'absolute', left: 0, top: sun < 30 ? -3 : 0, width: sun, height: sun, background: 'center / contain no-repeat url(icons/hub/sun-gold.svg)', filter: `drop-shadow(0 0 ${sun < 30 ? 6 : 10}px rgba(255,186,60,${sun < 30 ? 0.6 : 0.65}))` }} />
      <span style={{ position: 'absolute', right: 0, bottom: 0, width: cloud, height: cloud, background: `center / contain no-repeat url(icons/hub/${cloudIcon}-white.svg)`, filter: `drop-shadow(0 ${sun < 30 ? 2 : 3}px ${sun < 30 ? 3 : 5}px rgba(0,0,0,${sun < 30 ? 0.28 : 0.3}))` }} />
    </div>
  );
}

export function WeatherCard() {
  const [day, setDay] = useState(0);
  return (
    <HubCard label="Weather" left={1013} top={191} width={446} height={370} radius={30} tint="rgba(110,118,126,.22)">
      <div style={{ position: 'absolute', left: 22, top: 34 }}>
        <SunCloud sun={36} cloud={46} cloudIcon="cloud" w={62} h={56} />
      </div>
      <div style={{ position: 'absolute', left: 96, top: 30, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontSize: 33, lineHeight: '38px', fontWeight: 600 }}>23</span>
        <span style={{ fontSize: 18, lineHeight: '24px', marginTop: 4, fontWeight: 500 }}>°C |°F</span>
      </div>
      <div style={{ position: 'absolute', left: 96, top: 68, fontSize: 19, lineHeight: '24px', color: 'rgba(255,255,255,.82)' }}>Sun</div>
      <div style={{ position: 'absolute', right: 22, top: 28, fontSize: 31, lineHeight: '38px', fontWeight: 400 }}>Friday</div>
      <div style={{ position: 'absolute', right: 22, top: 76, fontSize: 19, lineHeight: '24px', color: 'rgba(255,255,255,.88)' }}>20 June 2025</div>
      {[
        { left: 24, icon: 'drop', value: '56%', label: 'Humidity' },
        { left: 222, icon: 'wind', value: '25 km/h', label: 'Wind Speed' },
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
        {DAYS.map(([name, cloud, temps], i) => {
          const on = i === day;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setDay(i)}
              style={{
                height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderRadius: 14, border: `1px solid ${on ? 'rgba(255,255,255,.18)' : 'transparent'}`, cursor: 'pointer', color: '#fff', font: 'inherit',
                background: on ? 'rgba(255,255,255,.24)' : 'transparent', boxShadow: on ? 'inset 0 1px 0 rgba(255,255,255,.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 23, lineHeight: '26px', fontWeight: on ? 600 : 500 }}>{name}</span>
              <SunCloud sun={21} cloud={25} cloudIcon={cloud} w={34} h={28} />
              <span style={{ fontSize: 15, lineHeight: '18px', fontVariantNumeric: 'tabular-nums' }}>{temps}</span>
            </button>
          );
        })}
      </div>
    </HubCard>
  );
}

// ─── Air conditioner (draggable temperature gauge) ───────────────────────────

const T0 = 10, T1 = 26, A0 = -100, A1 = 100, CX = 100, CY = 100, R = 86;

/** SVG arc from angle a0 to a1 (degrees, 0 = up, clockwise) */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Pointer position on the gauge → whole degrees between T0 and T1 */
export function tempFromPoint(x: number, y: number): number {
  let a = (Math.atan2(x - CX, -(y - CY)) * 180) / Math.PI;
  a = Math.max(A0, Math.min(A1, a));
  return Math.round(T0 + ((a - A0) / (A1 - A0)) * (T1 - T0));
}

const MODES: Array<[string, string]> = [['fan', 'Fan'], ['timer', 'Timer'], ['sun', 'Mode']];

export function AirConditionerCard({ scale }: { scale: number }) {
  const [on, setOn] = useState(true);
  const [temp, setTemp] = useState(18);
  const [mode, setMode] = useState(2);
  const ka = A0 + (A1 - A0) * ((temp - T0) / (T1 - T0));
  const kx = CX + R * Math.sin((ka * Math.PI) / 180);
  const ky = CY - R * Math.cos((ka * Math.PI) / 180);

  const onGauge = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const set = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      setTemp(tempFromPoint((ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale));
    };
    set(e);
    const up = () => { window.removeEventListener('pointermove', set); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', set);
    window.addEventListener('pointerup', up);
  };

  return (
    <HubCard label="Air Conditioner" left={77} top={583} width={326} height={370} tint="rgba(96,78,66,.24)">
      <Led on={on} left={24} top={30} />
      <CardTitle left={78} top={28} title="Air Conditioner" subtitle="Living Room" />
      <PowerButton on={on} onToggle={() => setOn((v) => !v)} right={22} top={36} label="Air Conditioner" />
      <div
        role="slider"
        aria-label="Temperature"
        aria-valuemin={T0}
        aria-valuemax={T1}
        aria-valuenow={temp}
        tabIndex={0}
        onPointerDown={onGauge}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setTemp((t) => Math.min(T1, t + 1));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setTemp((t) => Math.max(T0, t - 1));
        }}
        style={{ position: 'absolute', left: 63, top: 113, width: 200, height: 170, cursor: 'pointer', touchAction: 'none', outline: 'none' }}
      >
        <svg width="200" height="170" viewBox="0 0 200 170" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <defs>
            <linearGradient id="hub-g" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#5E3BE6" />
              <stop offset="1" stopColor="#9C8BFF" />
            </linearGradient>
          </defs>
          <path d={arcPath(CX, CY, 68, A0, A1)} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="7" strokeDasharray="1.2 4.2" />
          <path d={arcPath(CX, CY, R, ka, A1)} fill="none" stroke="rgba(235,235,240,.85)" strokeWidth="9" strokeLinecap="round" />
          <path d={arcPath(CX, CY, R, A0, ka)} fill="none" stroke="url(#hub-g)" strokeWidth="9" strokeLinecap="round" />
        </svg>
        <span style={{ position: 'absolute', left: kx, top: ky, width: 24, height: 24, margin: '-12px 0 0 -12px', borderRadius: 999, background: '#7D63FF', border: '4px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,.4)' }} />
        <div style={{ position: 'absolute', left: 52, top: 52, width: 96, height: 96, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 30%, rgba(80,70,64,.55), rgba(40,34,30,.55))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>
          <span style={{ fontSize: 38, lineHeight: 1, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{temp}°</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 298, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {MODES.map(([icon, label], i) => (
          <button
            key={label}
            type="button"
            aria-pressed={i === mode}
            onClick={() => setMode(i)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff', font: 'inherit', opacity: i === mode ? 1 : 0.9 }}
          >
            <Glyph src={hubIcon(icon)} size={22} />
            <span style={{ fontSize: 17, lineHeight: '20px' }}>{label}</span>
          </button>
        ))}
      </div>
    </HubCard>
  );
}

// ─── TV ──────────────────────────────────────────────────────────────────────

const TV_APPS = [
  { name: 'Cine', mark: 'C', bg: '#0B0B0B', color: '#E50914', size: 30 },
  { name: 'Reel', mark: 'reel', bg: '#0F171E', color: '#fff', size: 17 },
  { name: 'Lumen TV', mark: 'tv+', bg: '#000', color: '#fff', size: 20 },
  { name: 'Max', mark: 'max', bg: '#0A0A14', color: '#fff', size: 19 },
];

export function TvCard() {
  const [on, setOn] = useState(true);
  return (
    <HubCard label="TV" left={427} top={583} width={445} height={178} tint="rgba(90,92,96,.24)">
      <Glyph src={hubIcon('monitor')} size={30} style={{ position: 'absolute', left: 24, top: 34 }} />
      <CardTitle left={70} top={24} title="TV" subtitle="Singer SmartTV" />
      <PowerButton on={on} onToggle={() => setOn((v) => !v)} right={22} top={32} label="TV" />
      <div style={{ position: 'absolute', left: 24, top: 98, display: 'flex', gap: 10 }}>
        {TV_APPS.map((a) => (
          <button
            key={a.name}
            type="button"
            title={a.name}
            style={{ width: 58, height: 58, borderRadius: 12, border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', background: a.bg, boxShadow: '0 6px 14px -6px rgba(0,0,0,.6)', color: a.color, fontFamily: 'inherit', fontSize: a.size, fontWeight: 800, letterSpacing: '-.03em' }}
          >
            {a.mark}
          </button>
        ))}
        <button type="button" title="Add app" aria-label="Add app" style={{ width: 58, height: 58, borderRadius: 12, border: '1.5px dashed rgba(255,255,255,.4)', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Glyph src={hubIcon('add', true)} size={22} style={{ opacity: 0.85 }} />
        </button>
      </div>
    </HubCard>
  );
}

// ─── Ambient LED (hue slider) ────────────────────────────────────────────────

export function LedCard() {
  const [on, setOn] = useState(true);
  const [hue, setHue] = useState(50);
  const dot = `hsl(${Math.round((hue / 100) * 330)}, 90%, 58%)`;
  return (
    <HubCard label="Ambient LED" left={427} top={781} width={445} height={172} tint="rgba(96,82,72,.24)">
      <Led on={on} left={24} top={30} />
      <CardTitle left={78} top={24} title="Ambient LED" subtitle="Living room ambiance" />
      <PowerButton on={on} onToggle={() => setOn((v) => !v)} right={22} top={32} label="Ambient LED" />
      <div style={{ position: 'absolute', left: 24, top: 98, fontSize: 17, lineHeight: '20px', color: 'rgba(255,255,255,.9)' }}>Colors</div>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 134, height: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, height: 12, borderRadius: 6, background: 'linear-gradient(90deg, #FF2A2A, #FF8A1F 14%, #F5E625 28%, #39D63B 42%, #20C7D9 56%, #2F6BFF 68%, #7B3BFF 80%, #D93BF2 90%, #FF2A7A)' }} />
        <div style={{ position: 'absolute', left: `calc(${hue}% - 13px)`, width: 26, height: 26, borderRadius: 999, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.45)', pointerEvents: 'none' }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: dot }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={hue}
          aria-label="LED colour"
          onChange={(e) => setHue(+e.target.value)}
          style={{ position: 'absolute', left: 0, right: 0, top: -8, width: '100%', height: 32, margin: 0, opacity: 0, cursor: 'pointer' }}
        />
      </div>
    </HubCard>
  );
}

// ─── Alexa + WiFi ────────────────────────────────────────────────────────────

export function AlexaCard() {
  const [on, setOn] = useState(true);
  return (
    <HubCard label="Alexa" left={896} top={583} width={211} height={178} tint="rgba(100,108,118,.24)" clip>
      <div style={{ position: 'absolute', left: 22, top: 22, fontSize: 21, lineHeight: '26px', fontWeight: 500 }}>Alexa</div>
      <PowerButton on={on} onToggle={() => setOn((v) => !v)} right={22} top={20} label="Alexa" />
      <Photo src={PHOTO('hub-alexa')} alt="Speaker" style={{ position: 'absolute', left: 59, top: 66, width: 92, height: 92, borderRadius: 999 }} />
    </HubCard>
  );
}

export function WifiCard() {
  const [on, setOn] = useState(true);
  return (
    <HubCard label="WiFi" left={896} top={781} width={211} height={172} tint="rgba(100,102,110,.24)" clip>
      <div style={{ position: 'absolute', left: 22, top: 22, fontSize: 21, lineHeight: '26px', fontWeight: 500 }}>WiFi</div>
      <PowerButton on={on} onToggle={() => setOn((v) => !v)} right={22} top={20} label="WiFi" />
      <Photo src={PHOTO('hub-router')} alt="Router" style={{ position: 'absolute', left: 50, top: 64, width: 110, height: 96, borderRadius: 12 }} />
    </HubCard>
  );
}

// ─── Music player ────────────────────────────────────────────────────────────

const TRACK_SECONDS = 236;

export function formatTrackTime(t: number): string {
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function PlayerCard() {
  const [play, setPlay] = useState(false);
  const [pos, setPos] = useState(90);
  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    const id = setInterval(() => {
      if (playRef.current) setPos((p) => (p >= TRACK_SECONDS ? 0 : p + 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const btns: Array<{ icon: string; title: string; size: number; filled?: boolean; onClick: () => void }> = [
    { icon: 'repeat', title: 'Repeat', size: 20, onClick: () => {} },
    { icon: 'rew', title: 'Back 10s', size: 20, onClick: () => setPos((p) => Math.max(0, p - 10)) },
    { icon: play ? 'pause' : 'play', title: play ? 'Pause' : 'Play', size: 22, filled: true, onClick: () => setPlay((v) => !v) },
    { icon: 'ff', title: 'Forward 10s', size: 20, onClick: () => setPos((p) => Math.min(TRACK_SECONDS, p + 10)) },
    { icon: 'shuffle', title: 'Shuffle', size: 20, onClick: () => {} },
  ];

  return (
    <HubCard label="Now playing" left={1131} top={583} width={328} height={370} tint="rgba(104,96,96,.24)">
      <div style={{ position: 'absolute', left: 24, top: 22, fontSize: 15, lineHeight: '20px', color: 'rgba(255,255,255,.88)' }}>Arash</div>
      <div style={{ position: 'absolute', left: 24, top: 48, fontSize: 20, lineHeight: '26px', fontWeight: 500 }}>One day I’m gonna fly away</div>
      <div style={{ position: 'absolute', left: 24, top: 96, width: 280, height: 134, borderRadius: 16, overflow: 'hidden', border: '3px solid rgba(255,255,255,.92)', boxShadow: '0 10px 24px -10px rgba(0,0,0,.6)' }}>
        <Photo src={PHOTO('hub-album')} alt="Album art" style={{ width: 274, height: 128 }} />
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, top: 266, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {btns.map((b, i) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-label={b.title}
            onClick={b.onClick}
            style={{ width: 40, height: 40, padding: 0, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', opacity: i === 2 ? 1 : 0.92 }}
          >
            <Glyph src={hubIcon(b.icon, b.filled)} size={b.size} />
          </button>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 24, right: 24, top: 318, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.88)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{formatTrackTime(pos)}</span>
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={TRACK_SECONDS}
          aria-valuenow={pos}
          tabIndex={0}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPos(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * TRACK_SECONDS));
          }}
          style={{ flex: 1, position: 'relative', height: 12, display: 'flex', alignItems: 'center', cursor: 'pointer', outline: 'none' }}
        >
          <div style={{ position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.4)' }} />
          <div style={{ position: 'absolute', left: 0, width: `${((pos / TRACK_SECONDS) * 100).toFixed(1)}%`, height: 3, borderRadius: 3, background: '#fff' }} />
        </div>
        <span>3:56</span>
      </div>
    </HubCard>
  );
}
