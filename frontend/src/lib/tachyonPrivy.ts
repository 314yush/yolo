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

export async function getAuthorizationListIfNeeded(
  provider: Eip1193LikeProvider,
  walletAddress: Address
): Promise<Eip7702Authorization[] | undefined> {
  const status = await getEip7702Status(walletAddress);
  if (status.isAuthorized) return undefined;

  const walletClient = createWalletClient({
    account: walletAddress,
    chain: base,
    transport: custom(provider as EIP1193Provider),
  });

  const authorization = await walletClient.signAuthorization({
    contractAddress: ERC4337_DELEGATION_CONTRACT,
  });

  return [
    {
      chainId: authorization.chainId,
      address: authorization.address as Address,
      nonce: Number(authorization.nonce),
      r: authorization.r,
      s: authorization.s,
      v: Number(authorization.v),
      yParity: Number(authorization.yParity) as 0 | 1,
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
