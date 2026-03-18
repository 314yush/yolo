import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

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
  const pathStr = path?.length ? path.join('/') : '';
  const search = req.nextUrl.search;
  const url = `${BACKEND_URL}/${pathStr}${search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method,
      headers: body ? headers : undefined,
      body: body ?? undefined,
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
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
