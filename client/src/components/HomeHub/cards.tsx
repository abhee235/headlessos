// EX8.10: HomeHub cards. EX8.15 moved the camera, weather, air conditioner, TV,
// LED, Alexa and WiFi cards to real data in glance.tsx; EX8.26 turned the music
// player into the network traffic card. What stays here is that card and the arc
// helper the health dial draws with. Positions and sizes are HomeHub.dc.html's.
// @see docs/phases/phase-ex8.md

import { useEffect, useId, useState, type PointerEvent } from 'react';
import type { NetworkIoEntry } from '../../lib/api';
import { Glyph, HubCard, hubIcon } from './hub-ui';

// ─── Arc helper (EX8.15: used by the server health dial) ─────────────────────

/** SVG arc from angle a0 to a1 (degrees, 0 = up, clockwise) */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ─── Network traffic series (EX8.26) ─────────────────────────────────────────

/** One Task Manager reading: cumulative byte counters per interface */
export interface NetSample { serverId: string; at: number; ifaces: NetworkIoEntry[] }
/** Bytes per second over the `secs` since the previous reading, per interface */
export interface NetPoint { at: number; secs: number; rates: Record<string, { rx: number; tx: number }> }
export interface NetSeries { last: NetSample | null; points: NetPoint[]; ifaces: string[] }

export const NET_KEEP_MS = 15 * 60_000;
/** Readings further apart start a new baseline, and the graph breaks there */
export const NET_GAP_MS = 10_000;
export const EMPTY_SERIES: NetSeries = { last: null, points: [], ifaces: [] };

/** Busiest first by total bytes, loopback last */
function rankIfaces(ifaces: NetworkIoEntry[]): string[] {
  return [...ifaces]
    .sort((a, b) => Number(a.interface === 'lo') - Number(b.interface === 'lo') || (b.rxBytes + b.txBytes) - (a.rxBytes + a.txBytes))
    .map((i) => i.interface);
}

export function addNetSample(s: NetSeries, sample: NetSample): NetSeries {
  const prev = s.last;
  // Closer than 1 s (overlapping polls) would give a spiky rate: keep the older baseline
  if (prev && sample.at - prev.at < 1000) return s;
  const known = new Set(s.ifaces);
  const ifaces = [...s.ifaces, ...rankIfaces(sample.ifaces).filter((n) => !known.has(n))];
  let points = s.points;
  if (prev && sample.at - prev.at <= NET_GAP_MS) {
    const secs = (sample.at - prev.at) / 1000;
    const before = new Map(prev.ifaces.map((i) => [i.interface, i]));
    const rates: NetPoint['rates'] = {};
    for (const i of sample.ifaces) {
      const p = before.get(i.interface);
      if (p) rates[i.interface] = { rx: Math.max(0, i.rxBytes - p.rxBytes) / secs, tx: Math.max(0, i.txBytes - p.txBytes) / secs };
    }
    points = [...points, { at: sample.at, secs, rates }];
  }
  const from = sample.at - NET_KEEP_MS;
  if (points.length && points[0].at < from) points = points.filter((p) => p.at >= from);
  return { last: sample, points, ifaces };
}

/** Per server, for the app session: reopening the hub shows what was recorded before */
const netHistory = new Map<string, NetSeries>();

export function useNetSeries(serverId: string | null, sample: NetSample | null): NetSeries {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!sample) return;
    const before = netHistory.get(sample.serverId) ?? EMPTY_SERIES;
    const next = addNetSample(before, sample);
    if (next === before) return;
    netHistory.set(sample.serverId, next);
    setVersion((v) => v + 1);
  }, [sample]);
  return (serverId && netHistory.get(serverId)) || EMPTY_SERIES;
}

type InOut = { rx: number; tx: number };

/** Peak and average rates and bytes moved over the measured part of the range */
export function netStats(points: NetPoint[], iface: string): { peak: InOut; avg: InOut; total: InOut } | null {
  const peak = { rx: 0, tx: 0 }, total = { rx: 0, tx: 0 };
  let secs = 0;
  for (const p of points) {
    const r = p.rates[iface];
    if (!r) continue;
    peak.rx = Math.max(peak.rx, r.rx); peak.tx = Math.max(peak.tx, r.tx);
    total.rx += r.rx * p.secs; total.tx += r.tx * p.secs;
    secs += p.secs;
  }
  return secs ? { peak, avg: { rx: total.rx / secs, tx: total.tx / secs }, total } : null;
}

// ─── Formatting and geometry ─────────────────────────────────────────────────

/** 512 B, 3.1 KB, 12 KB: at most three digits so the numbers fit */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, bytes), u = 0;
  while (v >= 999.5 && u < units.length - 1) { v /= 1024; u++; }
  return `${u > 0 && v < 9.95 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

export const formatRate = (bps: number): string => `${formatSize(bps)}/s`;

/** The graph's top: the peak rounded up to a 1 / 2 / 5 step of B, KB, MB…, at least 1 KB/s */
export function niceRateCeil(peak: number): number {
  const v = Math.max(1024, peak);
  let unit = 1;
  while (v / unit >= 1000 && unit < 1024 ** 3) unit *= 1024;
  const x = v / unit;
  const mag = 10 ** Math.floor(Math.log10(x));
  const top = [1, 2, 5, 10].find((s) => s * mag >= x - 1e-9)! * mag;
  return top >= 1000 ? unit * 1024 : top * unit;
}

/** −m:ss before the end of the range, or "now" */
export function formatOffset(ms: number): string {
  const s = Math.round(ms / 1000);
  return s <= 0 ? 'now' : `−${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CHART_W = 274;
const CHART_H = 128;
const MID = CHART_H / 2;
const HEADROOM = 8;
const DOWN = '#1FA898';
const UP = '#7D63FF';

/**
 * Area and line paths for one interface over [start, start + span]: download
 * above the centre line, upload below, one run per stretch without a gap.
 */
export function trafficPaths(points: NetPoint[], iface: string, start: number, span: number, top: number) {
  const runs: Array<Array<{ x: number; rx: number; tx: number }>> = [];
  let prevAt = -Infinity;
  for (const p of points) {
    const r = p.rates[iface];
    if (!r) { prevAt = -Infinity; continue; }
    if (p.at - prevAt > NET_GAP_MS || !runs.length) runs.push([]);
    runs[runs.length - 1].push({ x: ((p.at - start) / span) * CHART_W, rx: r.rx, tx: r.tx });
    prevAt = p.at;
  }
  const h = (v: number) => (Math.min(v, top) / top) * (MID - HEADROOM);
  const f = (n: number) => n.toFixed(1);
  const side = (pick: (q: InOut) => number, dir: -1 | 1) => {
    let area = '', line = '';
    for (const run of runs) {
      if (run.length < 2) continue;
      const pts = run.map((q) => `${f(q.x)} ${f(MID + dir * h(pick(q)))}`);
      line += `M ${pts.join(' L ')} `;
      area += `M ${f(run[0].x)} ${MID} L ${pts.join(' L ')} L ${f(run[run.length - 1].x)} ${MID} Z `;
    }
    return { area: area.trim(), line: line.trim() };
  };
  return { down: side((q) => q.rx, -1), up: side((q) => q.tx, 1) };
}

// ─── Network traffic card (the design's music player) ────────────────────────

const RANGES = [1, 5, 15];

const dot = (c: string) => (
  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: c, flex: 'none' }} />
);

export function NetworkTrafficCard({ serverId, connected, sample }: {
  serverId: string | null; connected: boolean; sample: NetSample | null;
}) {
  const series = useNetSeries(serverId, sample);
  const gid = useId().replace(/:/g, '');
  const [range, setRange] = useState(5);
  const [iface, setIface] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null); // 0–1 across the range

  const ifaces = series.ifaces;
  const name = iface && ifaces.includes(iface) ? iface : ifaces[0] ?? null;
  const span = range * 60_000;
  const end = series.last?.at ?? 0;
  const start = end - span;
  const shown = name ? series.points.filter((p) => p.rates[name] && p.at > start - NET_GAP_MS) : [];
  const inRange = shown.filter((p) => p.at >= start);
  const stats = name ? netStats(inRange, name) : null;
  const top = niceRateCeil(stats ? Math.max(stats.peak.rx, stats.peak.tx) : 0);
  const paths = name ? trafficPaths(shown, name, start, span, top) : null;

  // The readout: the moment under the pointer, else the latest
  let pick: NetPoint | null = inRange[inRange.length - 1] ?? null;
  if (hover !== null) {
    const t = start + hover * span;
    pick = inRange.reduce<NetPoint | null>((best, p) => (!best || Math.abs(p.at - t) < Math.abs(best.at - t) ? p : best), null);
    if (pick && Math.abs(pick.at - t) > NET_GAP_MS) pick = null;
  }
  const rate = pick && name ? pick.rates[name] : null;
  const label = ['Network', name, hover !== null ? formatOffset((1 - hover) * span) : null].filter(Boolean).join(' · ');
  const nextIface = ifaces.length > 1 ? ifaces[(ifaces.indexOf(name ?? '') + 1) % ifaces.length] : null;
  const nextRange = RANGES[(RANGES.indexOf(range) + 1) % RANGES.length];

  const empty = !connected ? 'Not connected' : !paths?.down.line ? 'Measuring…' : null;
  const fracOf = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const h = (v: number) => (Math.min(v, top) / top) * (MID - HEADROOM);
  const scale = formatRate(top).replace('.0 ', ' ');
  const cols: Array<[string, (s: NonNullable<typeof stats>) => InOut, (n: number) => string, string]> = [
    ['Peak', (s) => s.peak, formatRate, 'Highest rate in the range'],
    ['Average', (s) => s.avg, formatRate, 'Average rate over the measured part of the range'],
    ['Total', (s) => s.total, formatSize, 'Bytes moved in the measured part of the range'],
  ];

  return (
    <HubCard label="Network traffic" left={1131} top={583} width={328} height={370} tint="rgba(104,96,96,.24)">
      {nextIface ? (
        <button
          type="button"
          onClick={() => setIface(nextIface)}
          title={`Show ${nextIface}`}
          aria-label={`Interface ${name}, show ${nextIface}`}
          style={{ position: 'absolute', left: 24, top: 22, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 15, lineHeight: '20px', color: 'rgba(255,255,255,.88)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <Glyph src={hubIcon('chev')} size={14} />
        </button>
      ) : (
        <div style={{ position: 'absolute', left: 24, top: 22, maxWidth: 280, fontSize: 15, lineHeight: '20px', color: 'rgba(255,255,255,.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
          {label}
        </div>
      )}
      <div style={{ position: 'absolute', left: 24, top: 48, display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, lineHeight: '26px', fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {dot(DOWN)}<span>↓ {rate ? formatRate(rate.rx) : '–'}</span>
        <span style={{ width: 8 }} />
        {dot(UP)}<span>↑ {rate ? formatRate(rate.tx) : '–'}</span>
      </div>
      <div
        data-testid="net-chart"
        onPointerMove={(e) => { if (!empty) setHover(fracOf(e)); }}
        onPointerLeave={() => setHover(null)}
        style={{ position: 'absolute', left: 24, top: 96, width: 280, height: 134, borderRadius: 16, overflow: 'hidden', border: '3px solid rgba(255,255,255,.92)', boxShadow: '0 10px 24px -10px rgba(0,0,0,.6)', background: 'rgba(24,18,14,.42)', cursor: empty ? 'default' : 'crosshair' }}
      >
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 15, color: 'rgba(255,255,255,.72)' }}>{empty}</div>
        ) : (
          <>
            <svg
              width={CHART_W}
              height={CHART_H}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              role="img"
              aria-label={`Download above and upload below the line on ${name}, last ${range} minutes, scale ${scale}`}
              style={{ display: 'block' }}
            >
              <defs>
                <linearGradient id={`${gid}-d`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={MID}>
                  <stop offset="0" stopColor={DOWN} stopOpacity=".6" />
                  <stop offset="1" stopColor={DOWN} stopOpacity=".08" />
                </linearGradient>
                <linearGradient id={`${gid}-u`} gradientUnits="userSpaceOnUse" x1="0" y1={CHART_H} x2="0" y2={MID}>
                  <stop offset="0" stopColor={UP} stopOpacity=".6" />
                  <stop offset="1" stopColor={UP} stopOpacity=".08" />
                </linearGradient>
              </defs>
              <path d={paths!.down.area} fill={`url(#${gid}-d)`} />
              <path d={paths!.up.area} fill={`url(#${gid}-u)`} />
              <line x1="0" x2={CHART_W} y1={MID} y2={MID} stroke="rgba(255,255,255,.35)" strokeWidth="1" />
              <path d={paths!.down.line} fill="none" stroke={DOWN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={paths!.up.line} fill="none" stroke={UP} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && (
                <g pointerEvents="none">
                  <line x1={hover * CHART_W} x2={hover * CHART_W} y1="0" y2={CHART_H} stroke="rgba(255,255,255,.85)" strokeWidth="1" />
                  {rate && pick && (
                    <>
                      <circle cx={((pick.at - start) / span) * CHART_W} cy={MID - h(rate.rx)} r="4" fill={DOWN} stroke="#fff" strokeWidth="2" />
                      <circle cx={((pick.at - start) / span) * CHART_W} cy={MID + h(rate.tx)} r="4" fill={UP} stroke="#fff" strokeWidth="2" />
                    </>
                  )}
                </g>
              )}
            </svg>
            <span style={{ position: 'absolute', right: 8, top: 5, fontSize: 11, lineHeight: '14px', color: 'rgba(255,255,255,.72)', pointerEvents: 'none' }}>{scale}</span>
          </>
        )}
      </div>
      {/* Peak / average / total over the range, where the music buttons were */}
      <dl style={{ position: 'absolute', left: 24, right: 24, top: 246, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: 8, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {cols.map(([title, get, fmt, hint]) => {
          const v = stats ? get(stats) : null;
          return (
            <div key={title} title={hint}>
              <dt style={{ fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.72)' }}>{title}</dt>
              <dd style={{ margin: '2px 0 0', fontSize: 15, lineHeight: '20px' }}>↓ {v ? fmt(v.rx) : '–'}</dd>
              <dd style={{ margin: 0, fontSize: 15, lineHeight: '20px' }}>↑ {v ? fmt(v.tx) : '–'}</dd>
            </div>
          );
        })}
      </dl>
      {/* The time axis; clicking it changes the range */}
      <button
        type="button"
        onClick={() => { setRange(nextRange); setHover(null); }}
        title={`Last ${range} min (click for ${nextRange} min)`}
        aria-label={`Range: last ${range} minutes. Show ${nextRange} minutes`}
        style={{ position: 'absolute', left: 24, right: 24, top: 314, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', fontSize: 12, lineHeight: '16px', color: 'rgba(255,255,255,.88)', fontVariantNumeric: 'tabular-nums' }}
      >
        <span>{formatOffset(span)}</span>
        <span aria-hidden style={{ flex: 1, borderTop: '2px dotted rgba(255,255,255,.4)' }} />
        <span>now</span>
      </button>
    </HubCard>
  );
}
