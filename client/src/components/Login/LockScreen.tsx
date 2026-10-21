// M6.11: Lock Screen — clock over the wallpaper
// EX8.5: LumenOS v3 — full-bleed wallpaper, date above a large bold clock in
// the upper third, and a glass "click or press any key" pill at the bottom.
// @see docs/phases/phase-6.md, docs/phases/phase-ex8.md

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/app-store';
import { Wallpaper } from '../Desktop/Wallpaper';
import { Lock } from 'lucide-react';

export function LockScreen() {
  const unlockScreen = useAppStore(s => s.unlockScreen);
  const [time, setTime] = useState(new Date());
  const [hintVisible, setHintVisible] = useState(false);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fade the hint in shortly after the screen appears
  useEffect(() => {
    const timeout = setTimeout(() => setHintVisible(true), 600);
    return () => clearTimeout(timeout);
  }, []);

  // Unlock on any key press or click
  const handleUnlock = useCallback(() => {
    unlockScreen();
  }, [unlockScreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore modifier keys alone
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      handleUnlock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUnlock]);

  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-[99999] cursor-default select-none"
      onClick={handleUnlock}
    >
      <Wallpaper />

      {/* Date + clock, centred in the upper third */}
      <div className="absolute inset-x-0 top-[13%] flex flex-col items-center gap-1 text-white [text-shadow:0_2px_24px_rgba(0,0,0,.25)]">
        <span className="text-[22px] font-medium tracking-[-0.01em] opacity-90">
          {dateStr}
        </span>
        <span className="text-[clamp(88px,11vw,132px)] leading-none font-bold tracking-[-0.03em] tabular-nums">
          {timeStr}
        </span>
      </div>

      {/* Sign-in hint */}
      <div
        className={`absolute bottom-14 left-1/2 -translate-x-1/2 transition-opacity duration-700 ${
          hintVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="glass-heavy flex h-11 items-center gap-2.5 rounded-full px-5 text-sm font-medium">
          <Lock className="h-4 w-4" strokeWidth={1.75} />
          Click or press any key to sign in
        </div>
      </div>
    </div>
  );
}
