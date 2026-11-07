// EX8.33: the logo is the app's real icon, wherever it shows
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';

vi.hoisted(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { HeadlessOSLogo } from '../../src/assets/logo';
import { SettingsView } from '../../src/components/Desktop/SettingsView';
import { TooltipProvider } from '../../src/components/ui/tooltip';

describe('HeadlessOSLogo', () => {
  it('is the same file the installed app uses as its icon', () => {
    const repo = resolve(__dirname, '../../..');
    const logo = readFileSync(resolve(repo, 'client/public/icons/app-logo.png'));
    const icon = readFileSync(resolve(repo, 'electron/icons/icon.png'));
    expect(logo.equals(icon)).toBe(true);
  });

  it('draws at the size it is given', () => {
    render(<HeadlessOSLogo size={64} />);
    const logo = screen.getByAltText('HeadlessOS');
    expect(logo).toHaveAttribute('src', 'icons/app-logo.png');
    expect(logo).toHaveAttribute('width', '64');
    expect(logo).toHaveAttribute('height', '64');
  });

  it('shows in Settings → About', () => {
    render(<TooltipProvider><SettingsView initialPage="about" /></TooltipProvider>);
    expect(screen.getByAltText('HeadlessOS')).toHaveAttribute('src', 'icons/app-logo.png');
  });
});
