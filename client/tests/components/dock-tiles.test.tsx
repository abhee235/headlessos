// EX8.16: colour dock tiles
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { colourTile, DOCK_TILES } from '../../src/components/Desktop/dock-tiles';

describe('colourTile', () => {
  it('gives every pinned default app its own tile colour', () => {
    for (const id of ['dashboard', 'files', 'terminal', 'docker', 'taskmanager', 'settings']) {
      expect(DOCK_TILES[id]?.bg, id).toMatch(/^linear-gradient/);
      expect(colourTile(id)?.plate, id).toBeTruthy();
    }
  });

  it('lets squircle icons be the tile, and leaves unknown apps on glass', () => {
    expect(colourTile('observatory')?.plate).toBeNull();
    expect(colourTile('container-files')).toBeNull();
  });

  it('draws the terminal as a white mono prompt', () => {
    const t = colourTile('terminal')!;
    const { container } = render(<>{t.glyph}</>);
    expect(container.textContent).toBe('>_');
  });
});
