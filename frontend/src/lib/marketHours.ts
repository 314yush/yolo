/**
 * Market Hours Utility
 *
 * Two schedules:
 *
 * **Commodities (XAU/XAG)** — America/New_York:
 * - Mon-Thu: 00:00-17:00 & 18:00-24:00 (1 hour break at 5pm ET)
 * - Friday: 00:00-17:00 only
 * - Saturday: CLOSED
 * - Sunday: 18:00-24:00 only
 *
 * **Forex weekend (USD/JPY)** — America/New_York:
 * - Closed Friday 17:00 ET through Sunday 17:00 ET (approx. retail forex weekend)
 * - Otherwise treated as open (no commodities-style intraday break)
 */

const WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Get current day (0=Sun..6=Sat) and hour (0-23) in America/New_York.
 * Uses Intl.DateTimeFormat for robust, locale-independent parsing.
 */
function getETParts(now: Date): { day: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const day = WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number]);
  return { day: day >= 0 ? day : 0, hour };
}

/** Asset names using the commodities (metals) schedule */
export const COMMODITIES_ASSETS = ['XAU', 'XAG'] as const;

/** Asset names closed on forex weekends only (Fri close – Sun open, ET) */
export const FX_WEEKEND_ASSETS = ['USDJPY'] as const;

/**
 * Forex “weekend”: closed Fri >= 17:00 ET until Sun >= 17:00 ET.
 */
export function isFxWeekendMarketOpen(): boolean {
  const now = new Date();
  const { day, hour } = getETParts(now);

  if (day === 5 && hour >= 17) return false;
  if (day === 6) return false;
  if (day === 0 && hour < 17) return false;

  return true;
}

/**
 * Get list of asset names that are currently closed (market hours).
 */
export function getMarketClosedAssets(): string[] {
  const closed: string[] = [];
  if (!isCommoditiesMarketOpen()) {
    closed.push(...COMMODITIES_ASSETS);
  }
  if (!isFxWeekendMarketOpen()) {
    closed.push(...FX_WEEKEND_ASSETS);
  }
  return closed;
}

/**
 * Check if the commodities market (XAU/XAG) is currently open.
 * Returns true if trading is allowed, false if market is closed.
 */
export function isCommoditiesMarketOpen(): boolean {
  const now = new Date();
  const { day, hour } = getETParts(now);

  // Saturday - fully closed
  if (day === 6) {
    return false;
  }

  // Sunday - only open 18:00-24:00 ET
  if (day === 0) {
    return hour >= 18;
  }

  // Friday - only open 00:00-17:00 ET
  if (day === 5) {
    return hour < 17;
  }

  // Mon-Thu - open 00:00-17:00 and 18:00-24:00 ET (1 hour break at 5pm)
  return hour < 17 || hour >= 18;
}

/**
 * Get ET date parts (year, month, day) for constructing dates.
 */
function getETDateParts(now: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '0', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '1', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '1', 10);
  return { year, month, day };
}

/**
 * Create a Date for a given ET date and hour. Uses UTC offset for ET (EST=-5, EDT=-4).
 * Approximates EDT as -4 for Mar-Nov; EST as -5 otherwise.
 */
function createETDate(year: number, month: number, day: number, hour: number): Date {
  const isDST = month >= 3 && month <= 10;
  const offset = isDST ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, hour + offset, 0, 0));
}

export function getNextMarketOpen(): Date | null {
  const now = new Date();
  const { day, hour } = getETParts(now);
  const { year, month, day: dayNum } = getETDateParts(now);

  // If market is open, return null
  if (isCommoditiesMarketOpen()) {
    return null;
  }

  // Saturday -> Sunday 6pm ET
  if (day === 6) {
    const nextDay = new Date(year, month - 1, dayNum);
    nextDay.setDate(nextDay.getDate() + 1);
    return createETDate(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate(), 18);
  }

  // Sunday before 6pm -> Sunday 6pm ET
  if (day === 0 && hour < 18) {
    return createETDate(year, month, dayNum, 18);
  }

  // Friday after 5pm -> Sunday 6pm ET
  if (day === 5 && hour >= 17) {
    const twoDaysLater = new Date(year, month - 1, dayNum);
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    return createETDate(twoDaysLater.getFullYear(), twoDaysLater.getMonth() + 1, twoDaysLater.getDate(), 18);
  }

  // Mon-Thu during 5pm-6pm break -> same day 6pm ET
  if (day >= 1 && day <= 4 && hour === 17) {
    return createETDate(year, month, dayNum, 18);
  }

  return null;
}

/**
 * Get a human-readable string for when the market opens.
 */
export function getMarketStatusMessage(): string {
  if (isCommoditiesMarketOpen()) {
    return 'Commodities market is open';
  }

  const nextOpen = getNextMarketOpen();
  if (!nextOpen) {
    return 'Commodities market is closed';
  }

  const now = new Date();
  const diff = nextOpen.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `Commodities market opens in ${hours}h ${minutes}m`;
  }
  return `Commodities market opens in ${minutes}m`;
}
