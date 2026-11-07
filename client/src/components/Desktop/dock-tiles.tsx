// EX8.16: Colour dock tiles — each app gets its own tile colour with a glyph
// that contrasts with it (macOS-style), instead of every app on the same glass
// plate. `dockIconStyle: 'glass'` keeps the EX8.4 plates.
// EX8.33: TileFace is shared with the launcher, so an app looks the same in both.
// @see docs/phases/phase-ex8.md

import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeftRight, Globe, Lock, Monitor, Palette } from 'lucide-react';
import { AppIcon } from '@/components/ui/FileIcon';
import { cn } from '@/lib/utils';

type Glyph =
  | { kind: 'icon'; size: number; white?: boolean }   // the app's own icon (optionally as a white silhouette)
  | { kind: 'terminal' }                              // a mono ">_" prompt
  | { kind: 'lucide'; node: ReactNode };              // a white line glyph

interface TileSpec { bg: string; glyph: Glyph }

const WHITE = 'linear-gradient(180deg,#FFFFFF,#E3E8EF)';

export const DOCK_TILES: Record<string, TileSpec> = {
  files: { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  dashboard: { bg: 'linear-gradient(180deg,#3B4352,#161A22)', glyph: { kind: 'icon', size: 34 } },
  terminal: { bg: 'linear-gradient(180deg,#3C3F46,#131418)', glyph: { kind: 'terminal' } },
  docker: { bg: 'linear-gradient(180deg,#4A95F8,#1D63ED)', glyph: { kind: 'icon', size: 34, white: true } },
  taskmanager: { bg: 'linear-gradient(180deg,#FFFFFF,#E8E3F6)', glyph: { kind: 'icon', size: 34 } },
  settings: { bg: 'linear-gradient(180deg,#A6ACB5,#5B616A)', glyph: { kind: 'icon', size: 32, white: true } },
  serveradmin: { bg: WHITE, glyph: { kind: 'icon', size: 34 } },
  fleet: { bg: 'linear-gradient(180deg,#5AA8FF,#1F63D6)', glyph: { kind: 'lucide', node: <Globe strokeWidth={1.9} className="size-[28px] text-white" /> } },
  // EX8.19: Fluent colour glyphs on white, like Files and Server Admin
  services: { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  agent: { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  'ui-agent': { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  'dynamic-ui': { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  observatory: { bg: WHITE, glyph: { kind: 'icon', size: 36 } },
  // EX8.33: the launcher's quick actions that aren't apps
  personalize: { bg: 'linear-gradient(180deg,#F472B6,#C026D3)', glyph: { kind: 'lucide', node: <Palette strokeWidth={1.9} className="size-[28px] text-white" /> } },
  desktop: { bg: 'linear-gradient(180deg,#2DD4BF,#0D9488)', glyph: { kind: 'lucide', node: <Monitor strokeWidth={1.9} className="size-[28px] text-white" /> } },
  switch: { bg: 'linear-gradient(180deg,#FBBF24,#EA7A0C)', glyph: { kind: 'lucide', node: <ArrowLeftRight strokeWidth={1.9} className="size-[28px] text-white" /> } },
  lock: { bg: 'linear-gradient(180deg,#818CF8,#4F46E5)', glyph: { kind: 'lucide', node: <Lock strokeWidth={1.9} className="size-[28px] text-white" /> } },
};

/** Tile chrome shared by the colour tiles: top highlight, hairline, soft drop */
const TILE_CHROME: CSSProperties = {
  border: '1px solid rgba(255,255,255,.22)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 0 rgba(0,0,0,.12), 0 6px 14px -8px rgba(0,0,0,.55)',
};

/** Background layer + glyph for an app's colour tile, or null when it has none */
export function colourTile(appId: string): { plate: ReactNode; glyph: ReactNode } | null {
  const spec = DOCK_TILES[appId];
  if (!spec) return null;
  const plate = <span className="absolute inset-0 rounded-[16px]" style={{ background: spec.bg, ...TILE_CHROME }} />;
  const g = spec.glyph;
  let glyph: ReactNode;
  if (g.kind === 'terminal') {
    glyph = <span className="font-mono text-[19px] font-bold leading-none tracking-[-0.04em] text-white">&gt;_</span>;
  } else if (g.kind === 'lucide') {
    glyph = g.node;
  } else {
    glyph = (
      <span style={g.white ? { filter: 'brightness(0) invert(1)' } : undefined} className="block">
        <AppIcon appId={appId} size={g.size} />
      </span>
    );
  }
  return { plate, glyph };
}

/** A tile's plate and glyph, filling a positioned 50px parent. Without a colour tile, `children` sits on glass. */
export function TileFace({ tile, noPlate = false, children }: {
  tile: ReturnType<typeof colourTile>;
  noPlate?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {tile ? tile.plate : !noPlate && <span className="lumen-plate absolute inset-0 rounded-[16px]" />}
      <span
        className={cn(
          'absolute inset-0 grid place-items-center [&>*]:block',
          // Colour tiles carry their own contrast; keep only a hint of lift on the glyph
          tile ? 'drop-shadow-[0_1px_1px_rgba(0,0,0,.18)]' : 'drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]',
        )}
      >
        {tile ? tile.glyph : children}
      </span>
    </>
  );
}
