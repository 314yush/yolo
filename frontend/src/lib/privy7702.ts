import type { Address } from 'viem';
import { getCode } from 'viem/actions';
import { publicClient } from '@/lib/viemClient';

export interface Eip7702Status {
  isAuthorized: boolean;
  code: `0x${string}` | undefined;
}

/**
 * Checks whether an EOA has delegated code deployed (EIP-7702 active).
 * If code exists at the address, authorization has already been applied.
 */
export async function getEip7702Status(walletAddress: Address): Promise<Eip7702Status> {
  const code = (await getCode(publicClient, { address: walletAddress })) as `0x${string}` | undefined;
  const isAuthorized = Boolean(code && code !== '0x');
  return { isAuthorized, code };
}
