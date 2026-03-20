import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint - verify backend proxy config.
 * Visit /api/proxy-status to see if BACKEND_URL is correct and reachable.
 */
export async function GET() {
  let url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '';
  url = url.replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const backendUrl = url || 'http://localhost:8000';

  let healthOk = false;
  let healthStatus: number | undefined;
  let error: string | undefined;

  try {
    const res = await fetch(`${backendUrl}/health`, { cache: 'no-store' });
    healthOk = res.ok;
    healthStatus = res.status;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const hint = !url
    ? 'Set BACKEND_URL on Vercel to your Railway URL (e.g. https://xxx.up.railway.app)'
    : !healthOk
      ? 'BACKEND_URL may be wrong. Ensure it is your Railway backend URL, NOT the frontend URL (tradeyolo.fun).'
      : 'Backend is reachable ✓';

  return NextResponse.json({
    backendUrlConfigured: !!url,
    backendUrlPrefix: url ? url.replace(/^https?:\/\//, '').slice(0, 50) + '...' : 'not set',
    healthOk,
    healthStatus,
    error: error ?? null,
    hint,
  });
}
