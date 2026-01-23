'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Howl } from 'howler';
import { useTradeStore } from '@/store/tradeStore';

interface Sounds {
  spin: Howl | null;
  tick: Howl | null;
  ding: Howl | null;
  boom: Howl | null;
  flip: Howl | null;
  backgroundMusic: Howl | null;
}

export function useSound() {
  const { settings } = useTradeStore();
  const soundsRef = useRef<Sounds>({
    spin: null,
    tick: null,
    ding: null,
    boom: null,
    flip: null,
    backgroundMusic: null,
  });

  // Initialize sounds on mount
  // Howler.js will automatically use the first format the browser supports
  useEffect(() => {
    if (typeof window !== 'undefined') {
      soundsRef.current = {
        spin: new Howl({
          src: ['/sounds/spin.mp3', '/sounds/spin.wav', '/sounds/spin.aiff'],
          loop: true,
          volume: 0.5,
        }),
        tick: new Howl({
          src: ['/sounds/tick.mp3', '/sounds/tick.wav', '/sounds/tick.aiff'],
          volume: 0.3,
        }),
        ding: new Howl({
          src: ['/sounds/ding.mp3', '/sounds/ding.wav', '/sounds/ding.aiff'],
          volume: 0.6,
        }),
        boom: new Howl({
          src: ['/sounds/boom.mp3', '/sounds/boom.wav', '/sounds/boom.aiff'],
          volume: 0.7,
        }),
        flip: new Howl({
          src: ['/sounds/flip.mp3', '/sounds/flip.wav', '/sounds/flip.aiff'],
          volume: 0.6,
        }),
        backgroundMusic: new Howl({
          src: ['/sounds/background.wav', '/sounds/background.mp3', '/sounds/background.aiff'],
          loop: true,
          volume: 0.15,
          preload: true,
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

  const playFlip = useCallback(() => {
    // Play flip trade sound
    if (settings.audioEnabled) {
      soundsRef.current.flip?.play();
    }
  }, [settings.audioEnabled]);

  // Background music controls
  const startBackgroundMusic = useCallback(() => {
    if (settings.musicEnabled && !soundsRef.current.backgroundMusic?.playing()) {
      soundsRef.current.backgroundMusic?.play();
    }
  }, [settings.musicEnabled]);

  const stopBackgroundMusic = useCallback(() => {
    const music = soundsRef.current.backgroundMusic;
    if (music && music.playing()) {
      // Fade out over 500ms for smooth stop
      music.fade(music.volume(), 0, 500);
      setTimeout(() => {
        music.stop();
        music.volume(0.15); // Reset volume for next play
      }, 500);
    } else {
      music?.stop();
    }
  }, []);

  // Handle music enabled/disabled changes
  // This effect runs after sounds are initialized (sounds init effect runs first)
  useEffect(() => {
    // Small delay to ensure sounds are initialized
    const timer = setTimeout(() => {
      // Ensure sounds are initialized before trying to control music
      if (!soundsRef.current.backgroundMusic) {
        return;
      }
      
      if (settings.musicEnabled) {
        // Only start if not already playing to prevent duplicates
        if (!soundsRef.current.backgroundMusic.playing()) {
          startBackgroundMusic();
        }
      } else {
        stopBackgroundMusic();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [settings.musicEnabled, startBackgroundMusic, stopBackgroundMusic]);

  return {
    startSpin,
    stopSpin,
    playTick,
    playDing,
    playBoom,
    playWin,
    playLose,
    playFlip,
    startBackgroundMusic,
    stopBackgroundMusic,
  };
}
