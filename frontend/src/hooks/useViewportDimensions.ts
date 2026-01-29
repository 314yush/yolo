'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Viewport dimensions and safe area information
 */
export interface ViewportDimensions {
  // Raw viewport dimensions
  width: number;
  height: number;
  
  // Aspect ratio (height / width)
  aspectRatio: number;
  
  // Screen type based on aspect ratio
  screenType: 'tall' | 'standard' | 'wide';
  
  // Safe area insets (for notches, home indicators, browser chrome)
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  
  // Available dimensions after safe areas
  availableWidth: number;
  availableHeight: number;
  
  // Dynamic viewport height (accounts for browser chrome)
  dvh: number;
  
  // Chart-specific calculations
  chartDimensions: {
    // Recommended chart height based on available space
    height: number;
    // Full width (no constraints)
    width: number;
    // Minimum and maximum heights
    minHeight: number;
    maxHeight: number;
  };
  
  // Browser detection
  browser: {
    isSafari: boolean;
    isChrome: boolean;
    isFirefox: boolean;
    isCryptoWallet: boolean;
    isMetaMask: boolean;
    isTrustWallet: boolean;
    isCoinbaseWallet: boolean;
  };
  
  // Orientation
  isLandscape: boolean;
  isPortrait: boolean;
}

// Fixed heights from PnL screen layout
const FIXED_HEIGHTS = {
  header: 60,
  chartHeader: 40,
  chips: 32,
  pnl: 120,
  info: 48,
  buttons: 80,
  spacer: 160, // Spacer for floating buttons
};

const TOTAL_FIXED_HEIGHT = 
  FIXED_HEIGHTS.header + 
  FIXED_HEIGHTS.chartHeader + 
  FIXED_HEIGHTS.chips + 
  FIXED_HEIGHTS.pnl + 
  FIXED_HEIGHTS.info + 
  FIXED_HEIGHTS.buttons;

// Chart height constraints
const CHART_MIN_HEIGHT = 200;
const CHART_MAX_HEIGHT = 400;

/**
 * Get safe area insets from CSS environment variables
 */
function getSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  if (typeof window === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const computedStyle = getComputedStyle(document.documentElement);
  
  // Helper to get CSS env value
  const getEnvValue = (property: string): number => {
    // Create a temporary element to measure the CSS env value
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.visibility = 'hidden';
    div.style.height = `env(${property}, 0px)`;
    document.body.appendChild(div);
    const value = div.offsetHeight;
    document.body.removeChild(div);
    return value;
  };

  return {
    top: getEnvValue('safe-area-inset-top'),
    bottom: getEnvValue('safe-area-inset-bottom'),
    left: getEnvValue('safe-area-inset-left'),
    right: getEnvValue('safe-area-inset-right'),
  };
}

/**
 * Detect browser type including crypto wallet browsers
 */
function detectBrowser(): ViewportDimensions['browser'] {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSafari: false,
      isChrome: false,
      isFirefox: false,
      isCryptoWallet: false,
      isMetaMask: false,
      isTrustWallet: false,
      isCoinbaseWallet: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();
  
  // Check for crypto wallet browsers
  const isMetaMask = ua.includes('metamask') || !!(window as any).ethereum?.isMetaMask;
  const isTrustWallet = ua.includes('trust') || !!(window as any).ethereum?.isTrust;
  const isCoinbaseWallet = ua.includes('coinbasewallet') || !!(window as any).ethereum?.isCoinbaseWallet;
  const isCryptoWallet = isMetaMask || isTrustWallet || isCoinbaseWallet || !!(window as any).ethereum;
  
  // Standard browser detection
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isChrome = ua.includes('chrome') && !ua.includes('edge') && !ua.includes('opr');
  const isFirefox = ua.includes('firefox');

  return {
    isSafari,
    isChrome,
    isFirefox,
    isCryptoWallet,
    isMetaMask,
    isTrustWallet,
    isCoinbaseWallet,
  };
}

/**
 * Get dynamic viewport height (accounts for mobile browser chrome)
 * Uses dvh if available, falls back to vh with adjustments
 */
function getDynamicViewportHeight(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  // Try to use CSS dvh via measurement
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.visibility = 'hidden';
  div.style.height = '100dvh';
  document.body.appendChild(div);
  const dvh = div.offsetHeight;
  document.body.removeChild(div);

  // If dvh is valid and different from window.innerHeight, use it
  // Otherwise fall back to innerHeight
  if (dvh > 0) {
    return dvh;
  }

  return window.innerHeight;
}

/**
 * Determine screen type based on aspect ratio
 */
function getScreenType(aspectRatio: number): 'tall' | 'standard' | 'wide' {
  if (aspectRatio > 2.0) {
    return 'tall'; // Very tall screens (most modern phones)
  } else if (aspectRatio >= 1.5) {
    return 'standard'; // Standard mobile screens
  } else {
    return 'wide'; // Landscape or tablet-like
  }
}

/**
 * Calculate optimal chart height based on available space
 */
function calculateChartHeight(
  availableHeight: number,
  screenType: 'tall' | 'standard' | 'wide',
  isLandscape: boolean
): number {
  // Calculate remaining space after fixed elements
  const remainingHeight = availableHeight - TOTAL_FIXED_HEIGHT;
  
  // Base calculation
  let chartHeight = remainingHeight;
  
  // Adjust based on screen type
  if (screenType === 'tall') {
    // On tall screens, use more vertical space for the chart
    chartHeight = Math.min(remainingHeight, CHART_MAX_HEIGHT);
  } else if (screenType === 'standard') {
    // Standard screens: balanced approach
    chartHeight = Math.min(remainingHeight * 0.9, CHART_MAX_HEIGHT);
  } else {
    // Wide/landscape: limit height but could expand width
    chartHeight = Math.min(remainingHeight * 0.7, CHART_MAX_HEIGHT);
  }
  
  // In landscape, prefer a shorter but wider chart
  if (isLandscape) {
    chartHeight = Math.min(chartHeight, 280);
  }
  
  // Apply min/max constraints
  return Math.max(CHART_MIN_HEIGHT, Math.min(chartHeight, CHART_MAX_HEIGHT));
}

/**
 * Hook to get viewport dimensions, safe areas, and chart sizing
 */
export function useViewportDimensions(): ViewportDimensions {
  const [dimensions, setDimensions] = useState<ViewportDimensions>(() => {
    // Initial SSR-safe values
    return {
      width: 0,
      height: 0,
      aspectRatio: 1.78, // Default to 16:9
      screenType: 'standard',
      safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
      availableWidth: 0,
      availableHeight: 0,
      dvh: 0,
      chartDimensions: {
        height: 320,
        width: 0,
        minHeight: CHART_MIN_HEIGHT,
        maxHeight: CHART_MAX_HEIGHT,
      },
      browser: {
        isSafari: false,
        isChrome: false,
        isFirefox: false,
        isCryptoWallet: false,
        isMetaMask: false,
        isTrustWallet: false,
        isCoinbaseWallet: false,
      },
      isLandscape: false,
      isPortrait: true,
    };
  });

  const updateDimensions = useCallback(() => {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dvh = getDynamicViewportHeight();
    const safeAreaInsets = getSafeAreaInsets();
    const browser = detectBrowser();
    
    // Calculate available dimensions
    const availableWidth = width - safeAreaInsets.left - safeAreaInsets.right;
    const availableHeight = dvh - safeAreaInsets.top - safeAreaInsets.bottom;
    
    // Aspect ratio (height / width)
    const aspectRatio = height / width;
    const screenType = getScreenType(aspectRatio);
    
    // Orientation
    const isLandscape = width > height;
    const isPortrait = !isLandscape;
    
    // Calculate chart dimensions
    const chartHeight = calculateChartHeight(availableHeight, screenType, isLandscape);
    
    setDimensions({
      width,
      height,
      aspectRatio,
      screenType,
      safeAreaInsets,
      availableWidth,
      availableHeight,
      dvh,
      chartDimensions: {
        height: chartHeight,
        width: availableWidth, // Full width minus safe areas
        minHeight: CHART_MIN_HEIGHT,
        maxHeight: CHART_MAX_HEIGHT,
      },
      browser,
      isLandscape,
      isPortrait,
    });
  }, []);

  useEffect(() => {
    // Initial measurement
    updateDimensions();

    // Listen for resize events
    window.addEventListener('resize', updateDimensions);
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', updateDimensions);
    
    // Some browsers fire resize with a delay after orientation change
    const handleOrientationChange = () => {
      setTimeout(updateDimensions, 100);
    };
    window.addEventListener('orientationchange', handleOrientationChange);

    // Use ResizeObserver for more reliable size detection
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateDimensions();
      });
      resizeObserver.observe(document.documentElement);
    }

    return () => {
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('orientationchange', updateDimensions);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateDimensions]);

  return dimensions;
}

/**
 * Get chart height CSS value with fallbacks for browser compatibility
 */
export function getChartHeightCSS(baseHeight: number = 320): string {
  // Use CSS calc with dvh for modern browsers, vh fallback for older ones
  return `clamp(${CHART_MIN_HEIGHT}px, calc(100dvh - ${TOTAL_FIXED_HEIGHT}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)), ${CHART_MAX_HEIGHT}px)`;
}

/**
 * Get full-width chart CSS value with safe area handling
 */
export function getChartWidthCSS(): string {
  return `calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))`;
}

export default useViewportDimensions;
