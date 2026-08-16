import { NextRequest, NextResponse } from 'next/server';

const AVANTIS_CORE = 'https://core.avantisfi.com';

/**
 * Proxy Avantis user-data (open positions) to avoid CORS.
 * GET /api/avantis/user-data?trader=0x...
 */
export async function GET(req: NextRequest) {
  const trader = req.nextUrl.searchParams.get('trader');
  if (!trader || !/^0x[a-fA-F0-9]{40}$/.test(trader)) {
    return NextResponse.json({ error: 'Missing or invalid trader address' }, { status: 400 });
  }

  try {
    const res = await fetch(`${AVANTIS_CORE}/user-data?trader=${encodeURIComponent(trader)}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Avantis proxy failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
