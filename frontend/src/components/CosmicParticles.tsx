'use client';

import React from 'react';

const PARTICLE_COUNT = 60;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  size: 1 + Math.random() * 2,
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  delay: `${Math.random() * 4}s`,
  duration: 3 + Math.random() * 4,
  opacity: 0.15 + Math.random() * 0.35,
}));

export function CosmicParticles() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-[#CCFF00] animate-particle-float"
          style={{
            width: p.size,
            height: p.size,
            left: p.left,
            top: p.top,
            animationDelay: p.delay,
            animationDuration: `${p.duration}s`,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 4}px rgba(204, 255, 0, 0.6)`,
          }}
        />
      ))}
    </div>
  );
}
