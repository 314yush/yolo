'use client';

import { useEffect, useCallback } from 'react';
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

// Singleton pattern: shared sound instances across all components
let globalSounds: Sounds = {
  spin: null,
  tick: null,
  ding: null,
  boom: null,
  flip: null,
  backgroundMusic: null,
};

let soundsInitialized = false;
let musicAutoStartDone = false;

// Initialize sounds once (singleton)
function initializeSounds() {
  if (soundsInitialized || typeof window === 'undefined') {
    return;
  }

  globalSounds = {
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

  soundsInitialized = true;
}

export function useSound() {
  const { settings } = useTradeStore();
  
  // Initialize sounds on first mount
  useEffect(() => {
    initializeSounds();
  }, []);

  const startSpin = useCallback(() => {
    if (settings.audioEnabled) {
      globalSounds.spin?.play();
    }
  }, [settings.audioEnabled]);

  const stopSpin = useCallback(() => {
    const spinSound = globalSounds.spin;
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
      globalSounds.tick?.play();
    }
  }, [settings.audioEnabled]);

  const playDing = useCallback(() => {
    if (settings.audioEnabled) {
      globalSounds.ding?.play();
    }
  }, [settings.audioEnabled]);

  const playBoom = useCallback(() => {
    if (settings.audioEnabled) {
      globalSounds.boom?.play();
    }
  }, [settings.audioEnabled]);

  const playWin = useCallback(() => {
    // Play a celebratory sound
    if (settings.audioEnabled) {
      globalSounds.ding?.play();
    }
  }, [settings.audioEnabled]);

  const playLose = useCallback(() => {
    // Play a loss sound
    if (settings.audioEnabled) {
      globalSounds.boom?.play();
    }
  }, [settings.audioEnabled]);

  const playFlip = useCallback(() => {
    // Play flip trade sound
    if (settings.audioEnabled) {
      globalSounds.flip?.play();
    }
  }, [settings.audioEnabled]);

  // Background music controls
  const startBackgroundMusic = useCallback(() => {
    if (settings.musicEnabled && globalSounds.backgroundMusic && !globalSounds.backgroundMusic.playing()) {
      globalSounds.backgroundMusic.play();
    }
  }, [settings.musicEnabled]);

  const stopBackgroundMusic = useCallback(() => {
    const music = globalSounds.backgroundMusic;
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

  // Auto-start music on initial load (only once)
  useEffect(() => {
    if (musicAutoStartDone || !globalSounds.backgroundMusic) {
      return;
    }

    const timer = setTimeout(() => {
      if (settings.musicEnabled && !globalSounds.backgroundMusic?.playing()) {
        musicAutoStartDone = true;
        startBackgroundMusic();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [settings.musicEnabled, startBackgroundMusic]);

  // Handle settings changes after initial auto-start
  useEffect(() => {
    if (!musicAutoStartDone || !globalSounds.backgroundMusic) {
      return;
    }

    if (settings.musicEnabled) {
      if (!globalSounds.backgroundMusic.playing()) {
        startBackgroundMusic();
      }
    } else {
      stopBackgroundMusic();
    }
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
