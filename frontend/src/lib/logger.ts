/**
 * Production-safe logger. No-op when NODE_ENV is production or in locked-down environments.
 * Use instead of console.* to avoid exposing logs to end users.
 */
const isProduction =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';

const noop = () => {};

export const logger = {
  log: isProduction ? noop : (...args: unknown[]) => console.log(...args),
  debug: isProduction ? noop : (...args: unknown[]) => console.debug(...args),
  info: isProduction ? noop : (...args: unknown[]) => console.info(...args),
  warn: isProduction ? noop : (...args: unknown[]) => console.warn(...args),
  error: isProduction ? noop : (...args: unknown[]) => console.error(...args),
};
