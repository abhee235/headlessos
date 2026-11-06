// EX8.31: the dock makes way for a maximized window, and comes back when it's wanted
// @see docs/phases/phase-ex8.md

import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/app-store';
import { useDesktopStore } from '../../store/window-store';

/** Stops a pointer on its way to a status bar from raising the dock */
export const DOCK_REVEAL_DELAY = 150;
/** Covers the gap between the handle and the dock */
export const DOCK_HIDE_DELAY = 500;

/** A dock menu opens in a portal, so the pointer leaves the dock to reach it */
const menuOpen = () => document.querySelector('[role="menu"]') !== null;

/** A maximized window takes the dock's space. Another session's windows aren't on screen. */
export function useDockMakingWay(): boolean {
  const activeServerId = useAppStore((s) => s.activeServerId);
  return useDesktopStore((s) =>
    s.windows.some((w) => w.serverId === activeServerId && w.maximized && !w.minimized),
  );
}

export function useDockAutoHide(makingWay: boolean, panelOpen: boolean) {
  const revealed = useDesktopStore((s) => s.dockRevealed);
  const setRevealed = useDesktopStore((s) => s.setDockRevealed);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => clearTimeout(timer.current), []);

  const show = useCallback(() => {
    cancel();
    setRevealed(true);
  }, [cancel, setRevealed]);

  const showSoon = useCallback((event: { buttons: number }) => {
    cancel();
    if (event.buttons !== 0) return; // a drag or a text selection reaching the edge
    timer.current = setTimeout(() => setRevealed(true), DOCK_REVEAL_DELAY);
  }, [cancel, setRevealed]);

  const hideSoon = useCallback(() => {
    cancel();
    const hideUnlessInUse = () => {
      if (menuOpen()) timer.current = setTimeout(hideUnlessInUse, DOCK_HIDE_DELAY);
      else setRevealed(false);
    };
    timer.current = setTimeout(hideUnlessInUse, DOCK_HIDE_DELAY);
  }, [cancel, setRevealed]);

  // Focus moving out of the dock lets it go, but not onto the menu bar button, which keeps it up
  const hideOnBlur = useCallback((event: { relatedTarget: EventTarget | null }) => {
    if (!(event.relatedTarget as Element | null)?.closest?.('[data-dock]')) hideSoon();
  }, [hideSoon]);

  // A press elsewhere sends the dock away: a touch screen has no pointer to leave, and after
  // the menu bar button the pointer never reached the dock
  useEffect(() => {
    if (!makingWay || !revealed) return;
    const onPress = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.('[data-dock]')) {
        cancel();
        setRevealed(false);
      }
    };
    document.addEventListener('pointerdown', onPress);
    return () => document.removeEventListener('pointerdown', onPress);
  }, [makingWay, revealed, cancel, setRevealed]);

  // The next maximized window starts with the dock out of the way
  useEffect(() => {
    if (!makingWay) {
      cancel();
      setRevealed(false);
    }
  }, [makingWay, cancel, setRevealed]);

  useEffect(() => cancel, [cancel]);

  return { hidden: makingWay && !revealed && !panelOpen, show, showSoon, hideSoon, hideOnBlur };
}
