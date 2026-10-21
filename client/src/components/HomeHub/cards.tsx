// EX8.10: HomeHub cards. EX8.15 moved the camera, weather, air conditioner, TV,
// LED, Alexa and WiFi cards to real data in glance.tsx; what stays here is the
// music player (still sample data) and the arc helper the health dial draws with.
// Positions and sizes are HomeHub.dc.html's.
// @see docs/phases/phase-ex8.md

import { useEffect, useRef, useState } from 'react';
import { Glyph, HubCard, Photo, hubIcon } from './hub-ui';

const PHOTO = (n: string) => `hub/${n}.jpg`;

// ─── Arc helper (EX8.15: used by the server health dial) ─────────────────────

/** SVG arc from angle a0 to a1 (degrees, 0 = up, clockwise) */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
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
