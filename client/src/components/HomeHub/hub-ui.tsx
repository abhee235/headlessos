// EX8.10: HomeHub — shared pieces. The overlay is a fixed 1536×1150 canvas
// (the prototype's coordinates), scaled to the viewport, so cards are placed
// with absolute pixel positions exactly as in HomeHub.dc.html.
// @see docs/phases/phase-ex8.md

import type { CSSProperties, ReactNode } from 'react';

/** Fluent hub glyphs in client/public/icons/hub (relative: works under file:// too) */
export function hubIcon(name: string, filled = false): string {
  return `icons/hub/${name}-${filled ? 'filled' : 'regular'}.svg`;
}

/** A monochrome SVG drawn white (the prototype's `filter: brightness(0) invert(1)`) */
export function Glyph({ src, size, style }: { src: string; size: number; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width: size,
        height: size,
        flex: 'none',
        background: `center / contain no-repeat url(${src})`,
        filter: 'brightness(0) invert(1)',
        ...style,
      }}
    />
  );
}

const glass = (tint: string): CSSProperties => ({
  position: 'absolute',
  background: `linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.04) 60%), ${tint}`,
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  border: '1px solid rgba(255,255,255,.16)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16), 0 20px 40px -20px rgba(0,0,0,.5)',
});

/** A frosted card at prototype coordinates */
export function HubCard({
  left, top, width, height, radius = 28, tint, clip = false, children, label,
}: {
  left: number; top: number; width: number; height: number; radius?: number;
  tint: string; clip?: boolean; children: ReactNode; label?: string;
}) {
  return (
    <section
      aria-label={label}
      style={{ ...glass(tint), left, top, width, height, borderRadius: radius, overflow: clip ? 'hidden' : undefined }}
    >
      {children}
    </section>
  );
}

/** Raised 44px tile behind a glyph (humidity, wind) */
export const raisedTile: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08))',
  border: '1px solid rgba(255,255,255,.2)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3), 0 6px 14px -6px rgba(0,0,0,.45)',
};

/** Selected pill in the top nav and the room bar */
export const pressedPill = (on: boolean): CSSProperties => ({
  background: on ? 'rgba(40,38,40,.55)' : 'transparent',
  boxShadow: on ? 'inset 0 1px 3px rgba(0,0,0,.35), 0 1px 0 rgba(255,255,255,.08)' : 'none',
});

/** EX8.15: LED colours — green (the design), amber / red for load, warm for night light (EX8.29: shared with Fleet) */
export const LED_TONES = {
  green: ['radial-gradient(circle at 50% 40%, #46F04A, #18C21F 70%)', 'rgba(40,230,60,.75)'],
  amber: ['radial-gradient(circle at 50% 40%, #FFD36A, #E5A11A 70%)', 'rgba(245,184,61,.75)'],
  red: ['radial-gradient(circle at 50% 40%, #FF7A70, #D9362C 70%)', 'rgba(229,83,75,.8)'],
  warm: ['radial-gradient(circle at 50% 40%, #FFC07A, #F08A2C 70%)', 'rgba(240,138,44,.75)'],
} as const;

/** Status LED for a device card */
export function Led({ on, left, top, tone = 'green' }: { on: boolean; left: number; top: number; tone?: keyof typeof LED_TONES }) {
  const [fill, glow] = LED_TONES[tone];
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left,
        top,
        width: 34,
        height: 34,
        borderRadius: 999,
        background: on ? fill : 'rgba(255,255,255,.18)',
        boxShadow: on ? `0 0 0 5px rgba(0,0,0,.22), 0 0 18px ${glow}` : '0 0 0 5px rgba(0,0,0,.18)',
        transition: 'background .2s, box-shadow .2s',
      }}
    />
  );
}

/** 30px power glyph; pink-white when on, dim when off */
export function PowerButton({ on, onToggle, right, top, label, ariaLabel, title = 'Power' }: {
  on: boolean; onToggle: () => void; right: number; top: number; label: string;
  /** EX8.15: when the button does something other than power (e.g. "Open Task Manager") */
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={ariaLabel ? undefined : on}
      aria-label={ariaLabel ?? `${label} power`}
      title={title}
      style={{ position: 'absolute', right, top, width: 30, height: 30, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      <Glyph
        src={hubIcon('power')}
        size={30}
        style={{
          filter: on
            ? 'brightness(0) invert(92%) sepia(18%) saturate(420%) hue-rotate(295deg)'
            : 'brightness(0) invert(1) opacity(.45)',
        }}
      />
    </button>
  );
}

export function Photo({ src, alt, style }: { src: string; alt: string; style: CSSProperties }) {
  return <img src={src} alt={alt} draggable={false} style={{ display: 'block', objectFit: 'cover', ...style }} />;
}

/** Card title + subtitle at the prototype's 21px / 15px */
export function CardTitle({ left, top, title, subtitle }: { left: number; top: number; title: string; subtitle?: string }) {
  return (
    <>
      <div style={{ position: 'absolute', left, top, fontSize: 21, lineHeight: '26px', fontWeight: 500 }}>{title}</div>
      {subtitle && (
        <div style={{ position: 'absolute', left, top: top + 30, fontSize: 15, lineHeight: '20px', color: 'rgba(255,255,255,.82)' }}>
          {subtitle}
        </div>
      )}
    </>
  );
}
