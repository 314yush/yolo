import { NextRequest, NextResponse } from 'next/server';
import type { Address, Hex } from 'viem';
import { tachyon } from '@/lib/tachyonClient';

interface RelayTradeBody {
  chainId: number;
  to: Address;
  callData: Hex;
  value: string;
  gasLimit: string;
  transactionType: 'flash' | 'flash-blocks';
  authorizationList?: Array<{
    chainId: number;
    address: Address;
    nonce: number;
    r: Hex;
    s: Hex;
    yParity: 0 | 1;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RelayTradeBody;
    const isMissingRequiredField =
      !body ||
      typeof body.chainId !== 'number' ||
      !body.to ||
      !body.callData ||
      typeof body.value !== 'string' ||
      typeof body.gasLimit !== 'string' ||
      (body.transactionType !== 'flash' && body.transactionType !== 'flash-blocks');

    if (isMissingRequiredField) {
      return NextResponse.json({ error: 'Invalid relay payload' }, { status: 400 });
    }

    const taskId = await tachyon.relay({
      chainId: body.chainId,
      to: body.to,
      callData: body.callData,
      value: body.value,
      gasLimit: body.gasLimit,
      transactionType: body.transactionType,
      ...(body.authorizationList ? { authorizationList: body.authorizationList } : {}),
    });
    const result = await tachyon.waitForExecutionHash(taskId, 30_000);

    const txHash = typeof result === 'string'
      ? result
      : (result as { executionTxHash?: string; txHash?: string }).executionTxHash ||
        (result as { txHash?: string }).txHash ||
        String(result);

    return NextResponse.json({ txHash });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to relay trade';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
