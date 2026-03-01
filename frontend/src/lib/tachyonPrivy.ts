import { createWalletClient, custom, type Address, type Hex, type EIP1193Provider, zeroAddress } from 'viem';
import { base } from 'viem/chains';
import { entryPoint07Abi } from 'viem/account-abstraction';
import { tachyon, ERC4337_DELEGATION_CONTRACT } from '@/lib/tachyonClient';
import { ENTRY_POINT_ADDRESS, TACHYON_BENEFICIARY } from '@/lib/constants';
import { getEip7702Status } from '@/lib/privy7702';
import type { Eip1193LikeProvider } from '@/lib/privyWallet';
import { publicClient } from '@/lib/viemClient';
import {
  buildExecuteCallData,
  buildUserOperation,
  calculateRelayGasLimit,
  encodeHandleOps,
  hashUserOperation,
} from '@/lib/userOperation';

export interface Eip7702Authorization {
  chainId: number;
  address: Address;
  nonce: number;
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
}

export interface TachyonRelayRequest {
  chainId: number;
  to: Address;
  callData: Hex;
  value: string;
  gasLimit: string;
  transactionType: 'flash' | 'flash-blocks';
  authorizationList?: Eip7702Authorization[];
}

/**
 * Sign EIP-7702 authorization via Privy's eth_sign7702Authorization.
 * viem's signAuthorization only supports local accounts, not JSON-RPC (Privy embedded wallet).
 */
export async function getAuthorizationListIfNeeded(
  provider: Eip1193LikeProvider,
  walletAddress: Address
): Promise<Eip7702Authorization[] | undefined> {
  const status = await getEip7702Status(walletAddress);
  if (status.isAuthorized) return undefined;

  const nonce = await publicClient.getTransactionCount({
    address: walletAddress,
    blockTag: 'pending',
  });

  const response = await provider.request({
    method: 'eth_sign7702Authorization',
    params: {
      contract: ERC4337_DELEGATION_CONTRACT,
      chain_id: base.id,
      nonce: Number(nonce),
    },
  }) as { authorization?: { address?: string; chain_id?: number; nonce?: number; r?: string; s?: string; y_parity?: number } };

  const auth = response?.authorization;
  if (!auth?.r || !auth?.s) {
    throw new Error('eth_sign7702Authorization failed or unsupported. Ensure you are using a Privy embedded wallet.');
  }

  const yParity = Number(auth.y_parity ?? 0) as 0 | 1;
  const v = yParity === 1 ? 28 : 27;

  return [
    {
      chainId: auth.chain_id ?? base.id,
      address: (auth.address ?? ERC4337_DELEGATION_CONTRACT) as Address,
      nonce: auth.nonce ?? Number(nonce),
      r: auth.r as Hex,
      s: auth.s as Hex,
      v,
      yParity,
    },
  ];
}

export async function buildPrivyRelayRequest(params: {
  provider: Eip1193LikeProvider;
  walletAddress: Address;
  targetContract: Address;
  calldata: Hex;
  value?: bigint;
}): Promise<TachyonRelayRequest> {
  const { provider, walletAddress, targetContract, calldata, value = BigInt(0) } = params;
  const walletClient = createWalletClient({
    account: walletAddress,
    chain: base,
    transport: custom(provider as EIP1193Provider),
  });

  const authorizationList = await getAuthorizationListIfNeeded(provider, walletAddress);
  const nonce = await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [walletAddress, BigInt(0)],
    blockTag: 'pending',
  });

  const executeCallData = buildExecuteCallData(targetContract, value, calldata);
  const userOp = buildUserOperation({
    sender: walletAddress,
    nonce: BigInt(nonce as bigint),
    callData: executeCallData,
  });

  const userOpHash = hashUserOperation(userOp);
  const signature = await walletClient.signMessage({
    message: { raw: userOpHash },
  });
  userOp.signature = signature;

  const callDataForRelay = encodeHandleOps(userOp, TACHYON_BENEFICIARY);
  const gasLimit = calculateRelayGasLimit(userOp).toString();

  return {
    chainId: base.id,
    to: ENTRY_POINT_ADDRESS,
    callData: callDataForRelay,
    value: '0',
    gasLimit,
    transactionType: authorizationList ? 'flash' : 'flash-blocks',
    ...(authorizationList ? { authorizationList } : {}),
  };
}

export async function ensurePrivy7702Authorized(
  provider: Eip1193LikeProvider,
  walletAddress: Address
): Promise<void> {
  const authorizationList = await getAuthorizationListIfNeeded(provider, walletAddress);
  if (!authorizationList) return;

  const taskId = await tachyon.relay({
    chainId: 8453,
    to: zeroAddress,
    callData: '0x',
    value: '0',
    gasLimit: '150000',
    transactionType: 'flash',
    authorizationList,
  });

  await tachyon.waitForExecutionHash(taskId, 30_000);
  const status = await getEip7702Status(walletAddress);
  if (!status.isAuthorized) {
    throw new Error('EIP-7702 authorization relay completed but wallet is still not authorized.');
  }
}
