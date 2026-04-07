// M6.11: Lock Screen — Windows 11-style lock screen with clock
// @see docs/phases/phase-6.md

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/app-store';
import { Wallpaper } from '../Desktop/Wallpaper';
import { ChevronUp } from 'lucide-react';

export function LockScreen() {
  const unlockScreen = useAppStore(s => s.unlockScreen);
  const [time, setTime] = useState(new Date());
  const [hintVisible, setHintVisible] = useState(false);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Show "click anywhere" hint after 2s
  useEffect(() => {
    const timeout = setTimeout(() => setHintVisible(true), 2000);
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
  const dateStr = time.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-[99999] cursor-pointer select-none"
      onClick={handleUnlock}
    >
      {/* Wallpaper */}
      <Wallpaper />

      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {/* Clock + Date — centered, lower third */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-[28%] gap-1">
        <span className="text-white text-[72px] font-extralight leading-none tracking-tight drop-shadow-lg">
          {timeStr}
        </span>
        <span className="text-white/80 text-lg font-medium tracking-wide drop-shadow-md">
          {dateStr}
        </span>
      </div>

      {/* "Click anywhere" hint */}
      <div
        className={`absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-1000 ${
          hintVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <ChevronUp className="w-5 h-5 text-white/50 animate-[slideUpIn_1.5s_ease-in-out_infinite]" />
        <span className="text-white/50 text-xs font-medium tracking-widest uppercase">
          Click anywhere or press a key
        </span>
      </div>
    </div>
  );
}
