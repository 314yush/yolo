/**
 * Market Hours Utility
 * 
 * Checks if commodities (XAU/XAG) market is currently open.
 * 
 * Schedule (America/New_York timezone):
 * - Mon-Thu: 00:00-17:00 & 18:00-24:00 (1 hour break at 5pm ET)
 * - Friday: 00:00-17:00 only
 * - Saturday: CLOSED
 * - Sunday: 18:00-24:00 only
 */

/**
 * Check if the commodities market (XAU/XAG) is currently open.
 * Returns true if trading is allowed, false if market is closed.
 */
export function isCommoditiesMarketOpen(): boolean {
  const now = new Date();
  
  // Get current time in ET (Eastern Time)
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hour = etTime.getHours();
  
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
 * Get the next time the commodities market will open.
 * Useful for displaying "Market opens in X hours" messages.
 */
export function getNextMarketOpen(): Date | null {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  
  // If market is open, return null
  if (isCommoditiesMarketOpen()) {
    return null;
  }
  
  // Saturday -> Sunday 6pm ET
  if (day === 6) {
    const sunday = new Date(etTime);
    sunday.setDate(sunday.getDate() + 1);
    sunday.setHours(18, 0, 0, 0);
    return sunday;
  }
  
  // Sunday before 6pm -> Sunday 6pm ET
  if (day === 0 && hour < 18) {
    const later = new Date(etTime);
    later.setHours(18, 0, 0, 0);
    return later;
  }
  
  // Friday after 5pm -> Sunday 6pm ET
  if (day === 5 && hour >= 17) {
    const sunday = new Date(etTime);
    sunday.setDate(sunday.getDate() + 2);
    sunday.setHours(18, 0, 0, 0);
    return sunday;
  }
  
  // Mon-Thu during 5pm-6pm break -> same day 6pm ET
  if (day >= 1 && day <= 4 && hour === 17) {
    const later = new Date(etTime);
    later.setHours(18, 0, 0, 0);
    return later;
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
