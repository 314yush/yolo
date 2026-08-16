import { NextResponse } from 'next/server';

const TX_BUILDER = 'https://tx-builder.avantisfi.com';

export async function GET() {
  try {
    const res = await fetch(`${TX_BUILDER}/v2/pairs`, {
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
          message: err instanceof Error ? err.message : 'pairs proxy failed',
        },
      },
      { status: 502 }
    );
  }
}
