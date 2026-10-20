// EX8.10: HomeHub — client-only smart-home overlay
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HomeHub, hubScale } from '../../src/components/HomeHub/HomeHub';
import { arcPath, formatTrackTime, tempFromPoint } from '../../src/components/HomeHub/cards';
import { useDesktopStore } from '../../src/store/window-store';

describe('HomeHub maths', () => {
  it('scales like the prototype: width, height or the 0.82 cap', () => {
    expect(hubScale(1440, 900)).toBeCloseTo(0.7487, 3);
    expect(hubScale(2560, 1600)).toBe(0.82);
    expect(hubScale(1000, 1400)).toBeCloseTo(0.625, 3);
  });

  it('maps the gauge ends to 10° and 26°, the top to 18°', () => {
    // centre (100,100): straight up is the midpoint, far left/right clamp to the ends
    expect(tempFromPoint(100, 10)).toBe(18);
    expect(tempFromPoint(0, 120)).toBe(10);
    expect(tempFromPoint(200, 120)).toBe(26);
  });

  it('draws arcs with the large-arc flag only past 180°', () => {
    expect(arcPath(100, 100, 86, -100, 100)).toMatch(/ A 86 86 0 1 1 /);
    expect(arcPath(100, 100, 86, -100, 0)).toMatch(/ A 86 86 0 0 1 /);
  });

  it('formats track time as m:ss', () => {
    expect(formatTrackTime(90)).toBe('1:30');
    expect(formatTrackTime(236)).toBe('3:56');
  });
});

describe('HomeHub overlay', () => {
  beforeEach(() => act(() => useDesktopStore.setState({ homeHubOpen: false, startMenuOpen: false })));

  it('renders only while open; opening it closes the launcher', () => {
    const { rerender } = render(<HomeHub />);
    expect(screen.queryByRole('dialog', { name: 'Home hub' })).toBeNull();

    act(() => useDesktopStore.setState({ startMenuOpen: true }));
    act(() => useDesktopStore.getState().toggleHomeHub());
    rerender(<HomeHub />);
    expect(screen.getByRole('dialog', { name: 'Home hub' })).toBeInTheDocument();
    expect(useDesktopStore.getState().startMenuOpen).toBe(false);
  });

  it('closes on Escape and on a backdrop click, not on a card click', () => {
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    render(<HomeHub />);
    fireEvent.click(screen.getByRole('region', { name: 'Weather' }));
    expect(useDesktopStore.getState().homeHubOpen).toBe(true);

    fireEvent.click(screen.getByTestId('hub-canvas'));
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);

    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useDesktopStore.getState().homeHubOpen).toBe(false);
  });

  it('toggles a device and switches rooms', () => {
    act(() => useDesktopStore.setState({ homeHubOpen: true }));
    render(<HomeHub />);
    const power = screen.getByRole('button', { name: 'TV power' });
    expect(power).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(power);
    expect(power).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Garage' }));
    expect(screen.getByRole('button', { name: 'Garage' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Garage')).toBeInTheDocument();
  });
});
