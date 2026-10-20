// EX8.9: Deterministic parsers for `systemd-analyze time` and `systemd-analyze blame`
// @see docs/phases/phase-ex8.md (EX8.9 — Startup apps)

import type { BootTimes } from '../schemas/taskmanager.js';

const UNIT_MS: Record<string, number> = {
  h: 3_600_000,
  min: 60_000,
  s: 1_000,
  ms: 1,
  us: 0.001,
  µs: 0.001,
};

/** One duration token as systemd prints it: `2.1s`, `512ms`, `1min`, `1h`, `850us` */
const TOKEN = String.raw`\d+(?:\.\d+)?(?:h|min|ms|us|µs|s)`;
const TOKEN_RE = new RegExp(`^(\\d+(?:\\.\\d+)?)(h|min|ms|us|µs|s)$`);
/** A whole duration: one or more tokens separated by spaces, e.g. `1min 30.003s` */
const DURATION = `${TOKEN}(?:\\s+${TOKEN})*`;

/**
 * systemd duration → milliseconds (rounded to 0.001). `1min 2.5s` → 62500.
 * Returns null when any part is not a duration.
 */
export function parseSystemdDuration(text: string): number | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  let total = 0;
  for (const p of parts) {
    const m = p.match(TOKEN_RE);
    if (!m) return null;
    total += Number.parseFloat(m[1]!) * UNIT_MS[m[2]!]!;
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * Parses `systemd-analyze time`:
 * ```
 * Startup finished in 1.4s (firmware) + 0.7s (loader) + 2.1s (kernel) + 3.2s (userspace) = 7.4s
 * graphical.target reached after 3.1s in userspace
 * ```
 * Segments that are absent (VMs and containers print only kernel/userspace)
 * are null. An `(initrd)` segment is folded into `kernelMs`, since the schema
 * has no initrd field and both run before userspace. Returns null when boot
 * has not finished or the output is not recognised.
 */
export function parseSystemdAnalyzeTime(raw: string): BootTimes | null {
  const line = raw.split('\n').find((l) => l.includes('Startup finished in'));
  if (!line) return null;

  const totalMatch = line.match(new RegExp(`=\\s*(${DURATION})\\s*$`));
  const totalMs = totalMatch ? parseSystemdDuration(totalMatch[1]!) : null;
  if (totalMs === null) return null;

  const seg: Record<string, number> = {};
  const segRe = new RegExp(`(${DURATION})\\s+\\((\\w+)\\)`, 'g');
  for (const m of line.matchAll(segRe)) {
    const ms = parseSystemdDuration(m[1]!);
    if (ms !== null) seg[m[2]!] = (seg[m[2]!] ?? 0) + ms;
  }

  const kernel = seg.kernel ?? null;
  const initrd = seg.initrd ?? null;
  return {
    totalMs,
    firmwareMs: seg.firmware ?? null,
    loaderMs: seg.loader ?? null,
    kernelMs: kernel === null && initrd === null ? null : (kernel ?? 0) + (initrd ?? 0),
    userspaceMs: seg.userspace ?? null,
  };
}

/**
 * Parses `systemd-analyze blame` into unit → milliseconds:
 * ```
 *  1min 30.003s NetworkManager-wait-online.service
 *       3.214s snapd.service
 *        512ms ssh.service
 * ```
 */
export function parseSystemdBlame(raw: string): Map<string, number> {
  const out = new Map<string, number>();
  const lineRe = new RegExp(`^\\s*(${DURATION})\\s+(\\S+)\\s*$`);
  for (const line of raw.split('\n')) {
    const m = line.replace(/\r$/, '').match(lineRe);
    if (!m) continue;
    const ms = parseSystemdDuration(m[1]!);
    if (ms !== null && !out.has(m[2]!)) out.set(m[2]!, ms);
  }
  return out;
}

/** Startup impact from a unit's blame time: ≥ 1 s high, ≥ 300 ms medium, else low. */
export function startupImpact(delayMs: number | null): 'high' | 'medium' | 'low' | null {
  if (delayMs === null) return null;
  if (delayMs >= 1000) return 'high';
  if (delayMs >= 300) return 'medium';
  return 'low';
}
