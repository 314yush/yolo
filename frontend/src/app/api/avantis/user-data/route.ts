import { NextRequest, NextResponse } from 'next/server';

const NETWORK =
  process.env.NEXT_PUBLIC_AVANTIS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const V2 = process.env.NEXT_PUBLIC_AVANTIS_V2 === 'true';

const AVANTIS_CORE = V2
  ? NETWORK === 'mainnet'
    ? 'https://core.avantisfi.com'
    : 'https://core-testnet.avantisfi.com'
  : 'https://core.avantisfi.com';

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
