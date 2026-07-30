import { NextRequest, NextResponse } from 'next/server';

const NETWORK =
  process.env.NEXT_PUBLIC_AVANTIS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

const TX_BUILDER =
  NETWORK === 'mainnet'
    ? 'https://tx-builder.avantisfi.com'
    : 'https://tx-builder-testnet.avantisfi.com';

export async function GET(req: NextRequest) {
  const trader = req.nextUrl.searchParams.get('trader');
  const delegate = req.nextUrl.searchParams.get('delegate');
  if (!trader || !delegate) {
    return NextResponse.json(
      { ok: false, error: { code: 'BAD_REQUEST', message: 'trader and delegate required' } },
      { status: 400 }
    );
  }

  try {
    const url = new URL(`${TX_BUILDER}/v2/delegation`);
    url.searchParams.set('trader', trader);
    url.searchParams.set('delegate', delegate);
    const res = await fetch(url.toString(), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'PROXY_ERROR',
          message: err instanceof Error ? err.message : 'delegation proxy failed',
        },
      },
      { status: 502 }
    );
  }
}
