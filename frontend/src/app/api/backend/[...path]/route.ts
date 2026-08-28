import { NextRequest, NextResponse } from 'next/server';

/**
 * Path prefixes this proxy is allowed to forward. Derived from the frontend's
 * actual usage of `/api/backend` (see src/lib/activityApi.ts) plus the public
 * read-only price endpoints the backend exposes.
 *
 * `/admin` is never forwardable — see BLOCKED_PREFIXES.
 */
const ALLOWED_PREFIXES = ['activity', 'trades', 'pairs', 'price', 'health'] as const;

const BLOCKED_PREFIXES = ['admin'] as const;

/**
 * Headers forwarded upstream. Client-supplied auth (notably `X-Admin-Key`) is
 * dropped so the browser can never escalate through this proxy.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type'] as const;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// BACKEND_URL is the canonical server-side variable. NEXT_PUBLIC_API_URL is a
// deprecated alias kept so existing deployments do not break.
function getBackendUrl(): string | null {
  const configured = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;

  if (!configured) {
    if (isProduction()) return null;
    return 'http://localhost:8000';
  }

  let raw = configured.replace(/\/+$/, '');
  // Ensure URL has protocol - without it, fetch treats as relative and 404s
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw;
}

function normalizeSegments(path: string[] | undefined): string[] {
  return (path ?? []).filter((segment) => segment.length > 0);
}

function isPathAllowed(segments: string[]): boolean {
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment === '.' || segment === '..')) return false;

  const head = segments[0].toLowerCase();
  if ((BLOCKED_PREFIXES as readonly string[]).includes(head)) return false;
  return (ALLOWED_PREFIXES as readonly string[]).includes(head);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest('GET', req, params, null);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const body = await req.text();
  return proxyRequest('POST', req, params, body);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const body = await req.text();
  return proxyRequest('PUT', req, params, body);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const body = await req.text();
  return proxyRequest('PATCH', req, params, body);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest('DELETE', req, params, null);
}

async function proxyRequest(
  method: string,
  req: NextRequest,
  params: Promise<{ path: string[] }>,
  body: string | null
): Promise<NextResponse> {
  const { path } = await params;
  const segments = normalizeSegments(path);

  if (!isPathAllowed(segments)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const base = getBackendUrl();
  if (!base) {
    console.error(
      '[api/backend] BACKEND_URL is not set in production. Configure it on the deployment ' +
        'target (e.g. Vercel project env vars) pointing at the FastAPI backend.'
    );
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  }

  const pathStr = segments.map(encodeURIComponent).join('/');
  const url = `${base}/${pathStr}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  if (body && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  try {
    const res = await fetch(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ?? undefined,
      cache: 'no-store',
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend request failed';
    console.error('[api/backend] Upstream request failed:', message);
    return NextResponse.json({ error: 'Backend request failed' }, { status: 502 });
  }
}
