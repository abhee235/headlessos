// EX8.15: Display level (Home hub → Display). 50 is the normal look; the slider
// dims below it and brightens above it, through one backdrop brightness() layer.
// @see docs/phases/phase-ex8.md

/** Level 0–100 → CSS brightness: 50 = 1 (normal), 0 = 0.4, 100 = 1.35 (capped so text doesn't wash out) */
export function displayBrightness(level: number): number {
  const l = Math.max(0, Math.min(100, level));
  return l <= 50 ? 0.4 + (l / 50) * 0.6 : 1 + ((l - 50) / 50) * 0.35;
}
