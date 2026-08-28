import { NextRequest, NextResponse } from 'next/server';

/**
 * Sink for client-side error reports (see `reportError` in src/lib/logger.ts).
 * Writes to the server log so production errors are visible in Vercel runtime
 * logs instead of being swallowed by the console-disabling layout script.
 */

const MAX_BODY_BYTES = 8 * 1024;

interface ClientErrorReport {
  message: unknown;
  name: unknown;
  stack: unknown;
  digest: unknown;
  componentStack: unknown;
  boundary: unknown;
  path: unknown;
}

function asString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: Partial<ClientErrorReport>;
  try {
    parsed = JSON.parse(raw) as Partial<ClientErrorReport>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const message = asString(parsed.message, 500) ?? 'Unknown client error';

  console.error('[client-error]', {
    message,
    name: asString(parsed.name, 100),
    boundary: asString(parsed.boundary, 100),
    path: asString(parsed.path, 200),
    digest: asString(parsed.digest, 100),
    stack: asString(parsed.stack, 2000),
    componentStack: asString(parsed.componentStack, 2000),
    userAgent: req.headers.get('user-agent'),
  });

  return new NextResponse(null, { status: 204 });
}
