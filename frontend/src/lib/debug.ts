/**
 * Development-only logging. No-op in production.
 */
export const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};
