import { NextRequest, NextResponse } from 'next/server';

const NETWORK =
  process.env.NEXT_PUBLIC_AVANTIS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const V2 = process.env.NEXT_PUBLIC_AVANTIS_V2 === 'true';

const HISTORY_BASE = V2
  ? NETWORK === 'mainnet'
    ? 'https://api.avantisfi.com/v2/history/portfolio/history'
    : 'https://testnet-api.avantisfi.com/v2/history/portfolio/history'
  : 'https://api.avantisfi.com/v2/history/portfolio/history';

/**
 * Proxy Avantis portfolio history (closed trades) to avoid CORS.
 * GET /api/avantis/history/0x.../1
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string; page: string }> }
) {
  const { address, page } = await params;
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!page || !/^\d+$/.test(page)) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  try {
    const url = `${HISTORY_BASE}/${address}/${page}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Avantis history proxy failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
