// M17.7: whether macOS is likely to ask before HeadlessOS reaches a host, and the desktop app's
// note and setting for it (M17.8). Only the Mac desktop app has the bridge functions.
// @see docs/phases/phase-17.md

/** The failure M15.8 gives a blocked connection on a Mac */
export const LOCAL_NETWORK_HELP = 'local-network-access-on-macos';

const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal'];

function ipv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every((n) => n <= 255) ? nums : null;
}

/**
 * A guess at whether `host` is on a local network, which macOS asks about: private and link-local
 * IPv4, IPv6 unique-local and link-local, and home-network names. Loopback isn't: macOS doesn't ask.
 * It only decides whether to explain the prompt, so a miss costs nothing more than the note.
 */
export function isLocalNetworkHost(raw: string): boolean {
  const host = raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return false;
  const v4 = ipv4(host);
  if (v4) {
    const [a, b] = v4;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.includes(':')) {
    if (host === '::1') return false;
    return /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host);
  }
  if (/^\d+(\.\d+)*$/.test(host)) return false;
  return !host.includes('.') || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

type Bridge = { electronAPI?: { explainLocalNetwork?: () => Promise<boolean>; openLocalNetworkSettings?: () => Promise<void> } };
const bridge = () => (window as unknown as Bridge).electronAPI;

/** M17.7: the Mac desktop app's note before macOS asks; undefined elsewhere */
export function desktopExplainLocalNetwork(): (() => Promise<boolean>) | undefined {
  return bridge()?.explainLocalNetwork;
}

/** M17.8: opens System Settings at the Local Network setting; undefined elsewhere */
export function desktopOpenLocalNetworkSettings(): (() => Promise<void>) | undefined {
  return bridge()?.openLocalNetworkSettings;
}
