'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Howl } from 'howler';

interface Sounds {
  spin: Howl | null;
  tick: Howl | null;
  ding: Howl | null;
  boom: Howl | null;
}

export function useSound() {
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
    soundsRef.current.spin?.play();
  }, []);

  const stopSpin = useCallback(() => {
    soundsRef.current.spin?.stop();
  }, []);

  const playTick = useCallback(() => {
    soundsRef.current.tick?.play();
  }, []);

  const playDing = useCallback(() => {
    soundsRef.current.ding?.play();
  }, []);

  const playBoom = useCallback(() => {
    soundsRef.current.boom?.play();
  }, []);

  const playWin = useCallback(() => {
    // Play a celebratory sound
    soundsRef.current.ding?.play();
  }, []);

  const playLose = useCallback(() => {
    // Play a loss sound
    soundsRef.current.boom?.play();
  }, []);

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
