'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { ASSETS, LEVERAGES, DIRECTIONS, WHEEL_TIMINGS } from '@/lib/constants';
import { useSound } from '@/hooks/useSound';

interface PickerWheelProps {
  onSpinComplete: () => void;
  onSpinStart: () => void;
  triggerSpin?: boolean;
}

export function PickerWheel({ onSpinComplete, onSpinStart, triggerSpin }: PickerWheelProps) {
  const { stage, selection, randomizeSelection, setStage } = useTradeStore();
  const hasTriggeredRef = React.useRef(false);
  const { startSpin, stopSpin, playTick } = useSound();
  
  const animationRef = useRef<number | null>(null);
  const [rotation1, setRotation1] = React.useState(0);
  const [rotation2, setRotation2] = React.useState(0);
  const [rotation3, setRotation3] = React.useState(0);
  const [showAssetChip, setShowAssetChip] = React.useState(false);
  const [showLeverageChip, setShowLeverageChip] = React.useState(false);
  const [showDirectionChip, setShowDirectionChip] = React.useState(false);

  // Calculate target rotation to land on selected item
  const calculateTargetRotation = useCallback(
    (itemIndex: number, totalItems: number, basespins: number) => {
      const segmentAngle = 360 / totalItems;
      // We want the selected segment to align with the pointer at the top
      // The pointer is at the top (270 degrees in standard SVG coordinates)
      const targetAngle = -(itemIndex * segmentAngle + segmentAngle / 2);
      const fullSpins = Math.floor(basespins) * 360;
      return fullSpins + targetAngle + 360; // Ensure positive rotation
    },
    []
  );

  const spinWheels = useCallback(() => {
    // 1. IMMEDIATELY select trade params
    const selected = randomizeSelection();
    
    // 2. Calculate target rotations to land on selected values
    const assetIndex = ASSETS.findIndex((a) => a.name === selected.asset.name);
    const leverageIndex = LEVERAGES.findIndex((l) => l.value === selected.leverage.value);
    const directionIndex = DIRECTIONS.findIndex((d) => d.name === selected.direction.name);

    const baseSpins1 = 5 + Math.random() * 2;
    const baseSpins2 = 6 + Math.random() * 3;
    const baseSpins3 = 4 + Math.random() * 2;

    const targetRotation1 = calculateTargetRotation(assetIndex, ASSETS.length, baseSpins1);
    const targetRotation2 = calculateTargetRotation(leverageIndex, LEVERAGES.length, baseSpins2);
    const targetRotation3 = calculateTargetRotation(directionIndex, DIRECTIONS.length, baseSpins3);

    // Reset chip visibility
    setShowAssetChip(false);
    setShowLeverageChip(false);
    setShowDirectionChip(false);

    setStage('spinning');
    onSpinStart();
    startSpin();

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;

      // Progress for each wheel (0 to 1)
      const progress1 = Math.min(elapsed / WHEEL_TIMINGS.ASSET_STOP, 1);
      const progress2 = Math.min(elapsed / WHEEL_TIMINGS.LEVERAGE_STOP, 1);
      const progress3 = Math.min(elapsed / WHEEL_TIMINGS.DIRECTION_STOP, 1);

      // Cubic ease-out for natural deceleration
      const eased1 = 1 - Math.pow(1 - progress1, 3);
      const eased2 = 1 - Math.pow(1 - progress2, 3);
      const eased3 = 1 - Math.pow(1 - progress3, 3);

      setRotation1(targetRotation1 * eased1);
      setRotation2(targetRotation2 * eased2);
      setRotation3(targetRotation3 * eased3);

      // Show chips when wheels stop
      if (progress1 >= 1 && !showAssetChip) {
        setShowAssetChip(true);
      }
      if (progress2 >= 1 && !showLeverageChip) {
        setShowLeverageChip(true);
      }
      if (progress3 >= 1 && !showDirectionChip) {
        setShowDirectionChip(true);
      }

      // Stop spin sound and play tick when ALL wheels have stopped
      if (progress3 >= 1) {
        stopSpin();
        playTick();
        // Animation complete
        setTimeout(() => {
          onSpinComplete();
        }, 500);
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [
    randomizeSelection,
    calculateTargetRotation,
    setStage,
    onSpinStart,
    startSpin,
    stopSpin,
    playTick,
    onSpinComplete,
    showAssetChip,
    showLeverageChip,
    showDirectionChip,
  ]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Trigger spin when prop changes (from external button)
  useEffect(() => {
    if (triggerSpin && stage === 'idle' && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      spinWheels();
    }
    // Reset the ref when triggerSpin becomes false
    if (!triggerSpin) {
      hasTriggeredRef.current = false;
    }
  }, [triggerSpin, stage, spinWheels]);

  const handleWheelClick = () => {
    if (stage !== 'idle') return;
    spinWheels();
  };

  // Render a ring segment
  const renderRingSegment = (
    index: number,
    total: number,
    innerRadius: number,
    outerRadius: number,
    color: string,
    label: string,
    fontSize: number,
    isImage: boolean = false
  ) => {
    const segmentAngle = 360 / total;
    const startAngle = ((index * segmentAngle - 90) * Math.PI) / 180;
    const endAngle = (((index + 1) * segmentAngle - 90) * Math.PI) / 180;
    const largeArc = segmentAngle > 180 ? 1 : 0;

    const x1Outer = 200 + outerRadius * Math.cos(startAngle);
    const y1Outer = 200 + outerRadius * Math.sin(startAngle);
    const x2Outer = 200 + outerRadius * Math.cos(endAngle);
    const y2Outer = 200 + outerRadius * Math.sin(endAngle);
    const x1Inner = 200 + innerRadius * Math.cos(startAngle);
    const y1Inner = 200 + innerRadius * Math.sin(startAngle);
    const x2Inner = 200 + innerRadius * Math.cos(endAngle);
    const y2Inner = 200 + innerRadius * Math.sin(endAngle);

    const textAngle = index * segmentAngle + segmentAngle / 2;
    const textRadius = (innerRadius + outerRadius) / 2;
    const textX = 200 + textRadius * Math.cos(((textAngle - 90) * Math.PI) / 180);
    const textY = 200 + textRadius * Math.sin(((textAngle - 90) * Math.PI) / 180);
    const imageSize = fontSize * 1.2; // Smaller size for cleaner look

    return (
      <g key={index}>
        <path
          d={`M ${x1Outer} ${y1Outer} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x2Inner} ${y2Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`}
          fill={color}
          stroke="#000"
          strokeWidth="3"
        />
        {isImage ? (
          <image
            href={label}
            x={textX - imageSize / 2}
            y={textY - imageSize / 2}
            width={imageSize}
            height={imageSize}
            transform={`rotate(${textAngle}, ${textX}, ${textY})`}
          />
        ) : (
          <text
            x={textX}
            y={textY}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#000"
            fontSize={fontSize}
            fontWeight="bold"
            transform={`rotate(${textAngle}, ${textX}, ${textY})`}
          >
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="flex flex-col items-center">
      {/* Selection chips */}
      <div className="flex flex-wrap gap-3 mb-8 justify-center min-h-[60px]">
        {showAssetChip && selection?.asset && (
          <div
            className="selection-chip px-6 py-3 text-black font-bold text-xl animate-bounce-in flex items-center gap-2"
            style={{ backgroundColor: selection.asset.color }}
          >
            <img src={selection.asset.icon} alt={selection.asset.name} className="w-6 h-6" />
            {selection.asset.name}
          </div>
        )}
        {showLeverageChip && selection?.leverage && (
          <div
            className="selection-chip px-6 py-3 text-black font-bold text-xl animate-bounce-in"
            style={{ backgroundColor: selection.leverage.color }}
          >
            {selection.leverage.name}
          </div>
        )}
        {showDirectionChip && selection?.direction && (
          <div
            className="selection-chip px-6 py-3 text-black font-bold text-xl animate-bounce-in"
            style={{ backgroundColor: selection.direction.color }}
          >
            {selection.direction.name}
          </div>
        )}
      </div>

      {/* Wheel container */}
      <div
        className="relative touch-none cursor-pointer"
        style={{ width: '400px', height: '400px' }}
        onClick={handleWheelClick}
      >
        <svg width="400" height="400" className="absolute inset-0 pointer-events-none">
          {/* OUTER RING - Assets */}
          <g
            style={{
              transform: `rotate(${rotation1}deg)`,
              transformOrigin: '200px 200px',
            }}
          >
            {ASSETS.map((asset, i) =>
              renderRingSegment(i, ASSETS.length, 130, 190, asset.color, asset.icon, 28, true)
            )}
          </g>

          {/* MIDDLE RING - Leverage */}
          <g
            style={{
              transform: `rotate(${rotation2}deg)`,
              transformOrigin: '200px 200px',
            }}
          >
            {LEVERAGES.map((leverage, i) =>
              renderRingSegment(i, LEVERAGES.length, 75, 125, leverage.color, leverage.name, 16)
            )}
          </g>

          {/* INNER RING - Direction */}
          <g
            style={{
              transform: `rotate(${rotation3}deg)`,
              transformOrigin: '200px 200px',
            }}
          >
            {DIRECTIONS.map((direction, i) =>
              renderRingSegment(i, DIRECTIONS.length, 30, 70, direction.color, direction.symbol, 20, false)
            )}
          </g>

          {/* Center dot */}
          <circle cx="200" cy="200" r="25" fill="#000" stroke="#fff" strokeWidth="4" />
        </svg>

        {/* Pointer at top */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10">
          <svg width="50" height="50" viewBox="0 0 50 50">
            <polygon points="25,40 8,8 42,8" fill="#CCFF00" stroke="#000" strokeWidth="4" />
          </svg>
        </div>

        {/* Outer border with shadow */}
        <div
          className="absolute inset-0 rounded-full border-8 border-black pointer-events-none"
          style={{ boxShadow: '8px 8px 0px 0px rgba(0,0,0,1)' }}
        />
      </div>

      {/* Status text */}
      {stage === 'spinning' && (
        <div className="mt-6 text-white text-sm opacity-50 text-center">
          {!showAssetChip && 'SPINNING ASSET...'}
          {showAssetChip && !showLeverageChip && 'SPINNING LEVERAGE...'}
          {showAssetChip && showLeverageChip && !showDirectionChip && 'SPINNING DIRECTION...'}
          {showAssetChip && showLeverageChip && showDirectionChip && 'OPENING POSITION...'}
        </div>
      )}
    </div>
  );
}
