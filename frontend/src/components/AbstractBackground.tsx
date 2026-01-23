'use client';

import React from 'react';

export function AbstractBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Large rotated squares */}
      <div 
        className="absolute w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 border-4 border-[#CCFF00] opacity-5"
        style={{
          top: '10%',
          left: '-5%',
          transform: 'rotate(-15deg)',
          boxShadow: '8px 8px 0px 0px rgba(204, 255, 0, 0.1)',
        }}
      />
      <div 
        className="absolute w-24 h-24 sm:w-40 sm:h-40 md:w-56 md:h-56 border-4 border-[#FF006E] opacity-5"
        style={{
          top: '60%',
          right: '-3%',
          transform: 'rotate(12deg)',
          boxShadow: '8px 8px 0px 0px rgba(255, 0, 110, 0.1)',
        }}
      />
      
      {/* Medium circles */}
      <div 
        className="absolute w-20 h-20 sm:w-32 sm:h-32 md:w-40 md:h-40 border-4 border-[#FFD60A] opacity-5 rounded-full"
        style={{
          top: '25%',
          right: '15%',
          transform: 'rotate(-8deg)',
          boxShadow: '6px 6px 0px 0px rgba(255, 214, 10, 0.1)',
        }}
      />
      <div 
        className="absolute w-16 h-16 sm:w-28 sm:h-28 md:w-36 md:h-36 border-4 border-[#627EEA] opacity-5 rounded-full"
        style={{
          bottom: '20%',
          left: '10%',
          transform: 'rotate(18deg)',
          boxShadow: '6px 6px 0px 0px rgba(98, 126, 234, 0.1)',
        }}
      />
      
      {/* Small triangles (using rotated squares) */}
      <div 
        className="absolute w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[35px] border-b-[#14F195] opacity-5 sm:border-l-[30px] sm:border-r-[30px] sm:border-b-[52px]"
        style={{
          top: '40%',
          left: '5%',
          transform: 'rotate(-25deg)',
          filter: 'drop-shadow(4px 4px 0px rgba(20, 241, 149, 0.1))',
        }}
      />
      <div 
        className="absolute w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-b-[28px] border-b-[#FF9500] opacity-5 sm:border-l-[24px] sm:border-r-[24px] sm:border-b-[42px]"
        style={{
          bottom: '35%',
          right: '8%',
          transform: 'rotate(22deg)',
          filter: 'drop-shadow(4px 4px 0px rgba(255, 149, 0, 0.1))',
        }}
      />
      
      {/* XRP Blue accent */}
      <div 
        className="absolute w-12 h-12 sm:w-20 sm:h-20 md:w-24 md:h-24 border-4 border-[#00AAE4] opacity-5"
        style={{
          top: '75%',
          left: '20%',
          transform: 'rotate(45deg)',
          boxShadow: '4px 4px 0px 0px rgba(0, 170, 228, 0.1)',
        }}
      />
      
      {/* Additional small shapes for depth */}
      <div 
        className="absolute w-8 h-8 sm:w-12 sm:h-12 border-2 border-[#CCFF00] opacity-5"
        style={{
          top: '15%',
          right: '25%',
          transform: 'rotate(-30deg)',
        }}
      />
      <div 
        className="absolute w-10 h-10 sm:w-14 sm:h-14 border-2 border-[#FF006E] opacity-5 rounded-full"
        style={{
          bottom: '50%',
          right: '30%',
        }}
      />
    </div>
  );
}
