'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Howl } from 'howler';
import { useTradeStore } from '@/store/tradeStore';

interface Sounds {
  spin: Howl | null;
  tick: Howl | null;
  ding: Howl | null;
  boom: Howl | null;
}

export function useSound() {
  const { settings } = useTradeStore();
  const soundsRef = useRef<Sounds>({
    spin: null,
    tick: null,
    ding: null,
    boom: null,
  });

  // Initialize sounds on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      soundsRef.current = {
        spin: new Howl({
          src: ['/sounds/spin.mp3'],
          loop: true,
          volume: 0.5,
        }),
        tick: new Howl({
          src: ['/sounds/tick.mp3'],
          volume: 0.3,
        }),
        ding: new Howl({
          src: ['/sounds/ding.mp3'],
          volume: 0.6,
        }),
        boom: new Howl({
          src: ['/sounds/boom.mp3'],
          volume: 0.7,
        }),
      };
    }

    return () => {
      // Cleanup sounds on unmount
      Object.values(soundsRef.current).forEach((sound) => {
        if (sound) {
          sound.unload();
        }
      });
    };
  }, []);

  const startSpin = useCallback(() => {
    if (settings.audioEnabled) {
      soundsRef.current.spin?.play();
    }
  }, [settings.audioEnabled]);

  const stopSpin = useCallback(() => {
    const spinSound = soundsRef.current.spin;
    if (spinSound && spinSound.playing()) {
      // Fade out over 200ms for smooth stop
      spinSound.fade(spinSound.volume(), 0, 200);
      setTimeout(() => {
        spinSound.stop();
        spinSound.volume(0.5); // Reset volume for next play
      }, 200);
    } else {
      spinSound?.stop();
    }
  }, []);

  const playTick = useCallback(() => {
    if (settings.audioEnabled) {
      soundsRef.current.tick?.play();
    }
  }, [settings.audioEnabled]);

  const playDing = useCallback(() => {
    if (settings.audioEnabled) {
      soundsRef.current.ding?.play();
    }
  }, [settings.audioEnabled]);

  const playBoom = useCallback(() => {
    if (settings.audioEnabled) {
      soundsRef.current.boom?.play();
    }
  }, [settings.audioEnabled]);

  const playWin = useCallback(() => {
    // Play a celebratory sound
    if (settings.audioEnabled) {
      soundsRef.current.ding?.play();
    }
  }, [settings.audioEnabled]);

  const playLose = useCallback(() => {
    // Play a loss sound
    if (settings.audioEnabled) {
      soundsRef.current.boom?.play();
    }
  }, [settings.audioEnabled]);

  return {
    startSpin,
    stopSpin,
    playTick,
    playDing,
    playBoom,
    playWin,
    playLose,
  };
}
