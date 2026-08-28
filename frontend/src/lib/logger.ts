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

const CLIENT_ERROR_ENDPOINT = '/api/client-error';
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;

export interface ErrorReportContext {
  digest?: string;
  componentStack?: string;
  boundary?: string;
}

/**
 * Report a caught error so it survives production, where `logger` is a no-op and
 * the layout script strips console. Sends a fire-and-forget beacon to
 * /api/client-error, which writes it to the server log (Vercel runtime logs).
 */
export function reportError(error: unknown, context?: ErrorReportContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`[${context?.boundary ?? 'error'}]`, err, context ?? '');

  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  try {
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: err.message.slice(0, MAX_MESSAGE_LENGTH),
        name: err.name,
        stack: err.stack ? err.stack.slice(0, MAX_STACK_LENGTH) : null,
        digest: context?.digest ?? null,
        componentStack: context?.componentStack
          ? context.componentStack.slice(0, MAX_STACK_LENGTH)
          : null,
        boundary: context?.boundary ?? null,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never break rendering.
  }
}
