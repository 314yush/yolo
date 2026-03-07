'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useTradeStore } from '@/store/tradeStore';
import { ASSETS, LEVERAGES, DIRECTIONS, WHEEL_TIMINGS } from '@/lib/constants';
import { useSound } from '@/hooks/useSound';
import { vibrateShort } from '@/lib/haptics';
import { getMarketClosedAssets } from '@/lib/marketHours';

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
  const spinCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    vibrateShort();
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
        // Animation complete - 600ms delay (500ms + 100ms) before PnL transition for smoother UX
        spinCompleteTimeoutRef.current = setTimeout(() => {
          spinCompleteTimeoutRef.current = null;
          onSpinComplete();
        }, 600);
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

  // Cleanup animation and timers on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (spinCompleteTimeoutRef.current) {
        clearTimeout(spinCompleteTimeoutRef.current);
        spinCompleteTimeoutRef.current = null;
      }
      // Stop spin sound when navigating away during spin
      stopSpin();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

  // Trigger spin when prop changes (from external button)
  useEffect(() => {
    if (triggerSpin && stage === 'idle' && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        spinWheels();
      }, 0);
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

  const marketClosedAssets = getMarketClosedAssets();

  // Render a ring segment with responsive sizing
  const renderRingSegment = (
    index: number,
    total: number,
    innerRadius: number,
    outerRadius: number,
    color: string,
    label: string,
    baseFontSize: number,
    isImage: boolean = false,
    assetName?: string
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
    
    // Scale font size relative to base - will scale with SVG container
    // Use em units so it scales with the SVG's font-size style
    const fontSizeEm = (baseFontSize / 16).toFixed(2); // Convert to em relative to 16px base
    const fontSize = `${fontSizeEm}em`;
    const imageSize = baseFontSize * 1.2;
    // Scale stroke width proportionally - thinner on small screens  
    const strokeWidth = baseFontSize <= 16 ? '2' : '3';

    return (
      <g key={index}>
        <path
          d={`M ${x1Outer} ${y1Outer} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x2Inner} ${y2Inner} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner} Z`}
          fill={color}
          stroke="#000"
          strokeWidth={strokeWidth}
        />
        {isImage ? (
          <image
            href={label}
            x={textX - imageSize / 2}
            y={textY - imageSize / 2}
            width={imageSize}
            height={imageSize}
            transform={`rotate(${textAngle}, ${textX}, ${textY})`}
            style={{
              maxWidth: `clamp(${imageSize * 0.5}px, ${imageSize * 0.7}vw, ${imageSize}px)`,
              maxHeight: `clamp(${imageSize * 0.5}px, ${imageSize * 0.7}vw, ${imageSize}px)`,
            }}
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
            style={{
              fontSize: fontSize,
            }}
          >
            {label}
          </text>
        )}
        {assetName && marketClosedAssets.includes(assetName) && (
          <g transform={`rotate(${textAngle}, ${textX}, ${textY})`}>
            <rect
              x={textX - 22}
              y={textY - 14}
              width={44}
              height={12}
              rx={2}
              fill="#FF006E"
              stroke="#000"
              strokeWidth="1"
            />
            <text
              x={textX}
              y={textY - 8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize="8"
              fontWeight="bold"
            >
              CLOSED
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div
      className="flex flex-col items-center w-full h-full"
      style={{
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Selection display - compact inline */}
      {(showAssetChip || showLeverageChip || showDirectionChip) && (
        <div
          className="shrink-0 flex items-center justify-center z-20 px-4"
          style={{
            paddingTop: 'clamp(0.25rem, 0.5vh, 0.375rem)',
            paddingBottom: 'clamp(0.25rem, 0.5vh, 0.375rem)',
          }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Selected trade parameters"
        >
          {/* Combined selection display - inline text with color indicators */}
          <div
            className="flex items-center justify-center text-white font-bold font-mono animate-bounce-in whitespace-nowrap overflow-hidden text-ellipsis"
            style={{
              fontSize: 'clamp(0.875rem, 2.5vw, 1.125rem)',
              gap: 'clamp(0.25rem, 1vw, 0.5rem)',
            }}
          >
            {showAssetChip && selection?.asset && (
              <span
                className="flex items-center gap-1"
                role="status"
                aria-label={`Selected asset: ${selection.asset.name}`}
              >
                <span style={{ color: selection.asset.color }}>●</span>
                <span>{selection.asset.name}</span>
              </span>
            )}
            {showLeverageChip && selection?.leverage && (
              <>
                <span className="text-white/30">•</span>
                <span
                  className="text-white"
                  role="status"
                  aria-label={`Selected leverage: ${selection.leverage.name}`}
                >
                  {selection.leverage.name}
                </span>
              </>
            )}
            {showDirectionChip && selection?.direction && (
              <>
                <span className="text-white/30">•</span>
                <span
                  style={{ color: selection.direction.color }}
                  role="status"
                  aria-label={`Selected direction: ${selection.direction.name}`}
                >
                  {selection.direction.name}
                </span>
              </>
            )}
            {/* Inline gamification message */}
            {showAssetChip && showLeverageChip && showDirectionChip && (
              <>
                <span className="text-white/30">•</span>
                <span className="text-[#CCFF00]">Good luck!</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Wheel container - flex center, shrinks to fit */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
      <div
        className="relative touch-none cursor-pointer"
        style={{
          width: 'clamp(200px, min(80vw, calc(100dvh - 240px)), 450px)',
          height: 'clamp(200px, min(80vw, calc(100dvh - 240px)), 450px)',
          maxWidth: 'clamp(200px, min(80vw, calc(100dvh - 240px)), 450px)',
          maxHeight: 'clamp(200px, min(80vw, calc(100dvh - 240px)), 450px)',
        }}
        onClick={handleWheelClick}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && stage === 'idle') {
            e.preventDefault();
            handleWheelClick();
          }
        }}
        role="button"
        tabIndex={stage === 'idle' ? 0 : -1}
        aria-label="Spin the wheel to select trade parameters"
        aria-disabled={stage !== 'idle'}
        aria-busy={stage === 'spinning' || stage === 'executing'}
      >
        <svg 
          className="w-full h-full" 
          viewBox="0 0 400 400" 
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          role="img"
          aria-label="Trading wheel with asset, leverage, and direction segments"
          style={{
            fontSize: 'clamp(10px, min(2.5vw, 2.5dvh), 16px)',
          }}
        >
          {/* OUTER RING - Assets */}
          <g
            style={{
              transform: `rotate(${rotation1}deg)`,
              transformOrigin: '200px 200px',
            }}
          >
            {ASSETS.map((asset, i) =>
              renderRingSegment(i, ASSETS.length, 130, 190, asset.color, asset.icon, 28, true, asset.name)
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
              renderRingSegment(i, LEVERAGES.length, 75, 125, leverage.color, leverage.name, 24)
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
              renderRingSegment(i, DIRECTIONS.length, 30, 70, direction.color, direction.symbol, 28, false)
            )}
          </g>

          {/* Center dot - scales with wheel */}
          <circle 
            cx="200" 
            cy="200" 
            r="25" 
            fill="#000" 
            stroke="#fff" 
            strokeWidth="4"
          />
        </svg>

        {/* Pointer at top - Scales with wheel */}
        <div 
          className="absolute z-10"
          style={{
            top: '0',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'clamp(2rem, 8vw, 3.5rem)',
            height: 'clamp(2rem, 8vw, 3.5rem)',
          }}
        >
          <svg className="w-full h-full" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
            <polygon points="25,10 8,42 42,42" fill="#CCFF00" stroke="#000" strokeWidth="4" />
          </svg>
        </div>

        {/* Outer border with shadow */}
        <div className="absolute inset-0 rounded-full border-8 border-black pointer-events-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]" />
      </div>
      </div>

      {/* Status text - compact */}
      {stage === 'spinning' && (
        <div
          className="shrink-0 text-white/60 text-center font-medium px-4 z-20"
          style={{
            fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
            paddingTop: 'clamp(0.25rem, 0.5vh, 0.375rem)',
            paddingBottom: 'clamp(0.25rem, 0.5vh, 0.375rem)',
          }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {!showAssetChip && <span>SPINNING ASSET...</span>}
          {showAssetChip && !showLeverageChip && <span>SPINNING LEVERAGE...</span>}
          {showAssetChip && showLeverageChip && !showDirectionChip && <span>SPINNING DIRECTION...</span>}
          {showAssetChip && showLeverageChip && showDirectionChip && <span>OPENING POSITION...</span>}
        </div>
      )}
    </div>
  );
}
