import { NextResponse } from 'next/server';

const NETWORK =
  process.env.NEXT_PUBLIC_AVANTIS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

const TX_BUILDER =
  NETWORK === 'mainnet'
    ? 'https://tx-builder.avantisfi.com'
    : 'https://tx-builder-testnet.avantisfi.com';

export async function GET() {
  try {
    const res = await fetch(`${TX_BUILDER}/v2/meta`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'PROXY_ERROR',
          message: err instanceof Error ? err.message : 'meta proxy failed',
        },
      },
      { status: 502 }
    );
  }
}
