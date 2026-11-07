// EX8.32: marks a Mac on <html>, so the stylesheet can use San Francisco there and nowhere else.
// A plain check, not font-name order: Chromium only finds SF through names it may treat as
// system-ui, and on Windows that would replace Manrope.
// @see docs/phases/phase-ex8.md

export function isMac(platform: string = navigator.platform): boolean {
  return platform.startsWith('Mac');
}

export function markPlatform(root: HTMLElement = document.documentElement, platform?: string): void {
  if (isMac(platform)) root.dataset.platform = 'mac';
}
