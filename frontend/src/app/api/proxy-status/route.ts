import { NextResponse } from 'next/server';

/**
 * Development-only diagnostic. Returns 404 in production builds so the
 * environment shape is never exposed publicly.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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
    privyConfigured: !!process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    avantisNetwork: 'mainnet (Base 8453, no testnet path)',
    checklist: [
      'Privy dashboard: add http://localhost:3000 (and your LAN URL if used) under Allowed URLs.',
      'Privy dashboard: embedded wallet UIs must be off, or every trade prompts a modal.',
      'frontend/.env.local: BACKEND_URL, NEXT_PUBLIC_BASE_RPC_URL (match Vercel).',
    ],
  });
}
