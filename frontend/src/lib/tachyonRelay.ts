/**
 * Tachyon Relay
 * 
 * Handles relaying UserOperations via Tachyon:
 * - First trade: EIP-7702 authorization (makes delegate a smart wallet)
 * - Future trades: Flash-blocks (sub-50ms execution)
 * 
 * Based on: https://github.com/RathFinance/tachyon-examples/blob/main/ts-example/src/scripts/eip7702_4337.ts
 */

import { createWalletClient, createPublicClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { entryPoint07Abi } from 'viem/account-abstraction';
import { tachyon, isTachyonConfigured, ENTRY_POINT_ADDRESS, ERC4337_DELEGATION_CONTRACT, TACHYON_BENEFICIARY } from './tachyonClient';
import {
  type UserOperation,
  buildExecuteCallData,
  buildUserOperation,
  hashUserOperation,
  encodeHandleOps,
  calculateRelayGasLimit,
} from './userOperation';
import { STORAGE_KEYS } from './constants';

// Logging prefix for easy filtering
const LOG_PREFIX = '[TachyonRelay]';

export interface EIP7702Authorization {
  chainId: number;
  address: Address;
  nonce: number;
  r: Hex;
  s: Hex;
  v: number;
  yParity: 0 | 1;
}

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Check if delegate is already delegated (EIP-7702)
 */
export function isDelegateDelegated(): boolean {
  if (typeof window === 'undefined') {
    console.log(LOG_PREFIX, 'SSR context - assuming not delegated');
    return false;
  }
  const delegated = localStorage.getItem(STORAGE_KEYS.DELEGATE_7702_DELEGATED) === 'true';
  console.log(LOG_PREFIX, 'Delegation status:', delegated ? '✅ Already delegated' : '❌ Not yet delegated');
  return delegated;
}

/**
 * Mark delegate as delegated
 */
export function markDelegateDelegated(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.DELEGATE_7702_DELEGATED, 'true');
    console.log(LOG_PREFIX, '✅ Marked delegate as EIP-7702 delegated');
  }
}

/**
 * Clear delegation status (for testing/reset)
 */
export function clearDelegationStatus(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.DELEGATE_7702_DELEGATED);
    console.log(LOG_PREFIX, '🔄 Cleared delegation status');
  }
}

/**
 * Sign EIP-7702 authorization for delegate
 */
export async function signEIP7702Authorization(
  delegatePrivateKey: `0x${string}`
): Promise<EIP7702Authorization> {
  console.log(LOG_PREFIX, '🔐 Signing EIP-7702 authorization...');
  console.log(LOG_PREFIX, '  Delegation contract:', ERC4337_DELEGATION_CONTRACT);
  
  try {
    const delegateAccount = privateKeyToAccount(delegatePrivateKey);
    console.log(LOG_PREFIX, '  Delegate address:', delegateAccount.address);
    
    const delegateWalletClient = createWalletClient({
      account: delegateAccount,
      chain: base,
      transport: http(),
    });

    // Sign authorization - viem handles nonce automatically
    const authorization = await delegateWalletClient.signAuthorization({
      contractAddress: ERC4337_DELEGATION_CONTRACT,
    });

    console.log(LOG_PREFIX, '✅ EIP-7702 authorization signed');
    console.log(LOG_PREFIX, '  Chain ID:', authorization.chainId);
    console.log(LOG_PREFIX, '  Nonce:', authorization.nonce);

    return {
      chainId: authorization.chainId,
      address: authorization.address,
      nonce: Number(authorization.nonce),
      r: authorization.r,
      s: authorization.s,
      v: Number(authorization.v),
      yParity: Number(authorization.yParity) as 0 | 1,
    };
  } catch (error) {
    console.error(LOG_PREFIX, '❌ Failed to sign EIP-7702 authorization:', error);
    throw error;
  }
}

/**
 * Get nonce for delegate from EntryPoint
 */
export async function getDelegateNonce(delegateAddress: Address): Promise<bigint> {
  console.log(LOG_PREFIX, '🔍 Getting nonce from EntryPoint...');
  console.log(LOG_PREFIX, '  EntryPoint:', ENTRY_POINT_ADDRESS);
  console.log(LOG_PREFIX, '  Delegate:', delegateAddress);
  
  try {
    const nonce = await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: entryPoint07Abi,
      functionName: 'getNonce',
      args: [delegateAddress, BigInt(0)],
      blockTag: 'pending',
    });
    console.log(LOG_PREFIX, '✅ Nonce retrieved:', nonce.toString());
    return nonce;
  } catch (error) {
    console.warn(LOG_PREFIX, '⚠️ Failed to get nonce, using 0:', error);
    return BigInt(0);
  }
}

/**
 * Relay a trade transaction via Tachyon
 * 
 * @param delegatePrivateKey - Private key of the delegate wallet
 * @param targetContract - Contract to call (e.g., Avantis Trading)
 * @param calldata - Encoded function call (already wrapped in delegatedAction)
 * @param forceAuthorization - Force EIP-7702 authorization even if already delegated
 */
export async function relayTrade(params: {
  delegatePrivateKey: `0x${string}`;
  targetContract: Address;
  calldata: Hex;
  value?: bigint;
  forceAuthorization?: boolean;
}): Promise<`0x${string}`> {
  const { delegatePrivateKey, targetContract, calldata, value = BigInt(0), forceAuthorization } = params;

  console.log(LOG_PREFIX, '═══════════════════════════════════════');
  console.log(LOG_PREFIX, '🚀 Starting Tachyon relay...');
  console.log(LOG_PREFIX, '═══════════════════════════════════════');
  
  // Check Tachyon configuration
  if (!isTachyonConfigured()) {
    const error = new Error('Tachyon not configured - missing API key. Set NEXT_PUBLIC_TACHYON_API_KEY in .env.local');
    console.error(LOG_PREFIX, '❌', error.message);
    throw error;
  }

  const delegateAccount = privateKeyToAccount(delegatePrivateKey);
  const delegateAddress = delegateAccount.address;

  console.log(LOG_PREFIX, '📋 Transaction details:');
  console.log(LOG_PREFIX, '  Delegate:', delegateAddress);
  console.log(LOG_PREFIX, '  Target contract:', targetContract);
  console.log(LOG_PREFIX, '  Calldata length:', calldata.length, 'chars');
  console.log(LOG_PREFIX, '  Value:', value.toString(), 'wei (', Number(value) / 1e18, 'ETH)');
  console.log(LOG_PREFIX, '  Force authorization:', forceAuthorization || false);

  // Check if this is the first trade (needs EIP-7702 authorization)
  const delegatedStatus = isDelegateDelegated();
  const needsAuthorization = forceAuthorization || !delegatedStatus;
  console.log(LOG_PREFIX, '  Needs EIP-7702 auth:', needsAuthorization);

  // Get nonce from EntryPoint
  const nonceStart = Date.now();
  const nonce = await getDelegateNonce(delegateAddress);
  const nonceTime = Date.now() - nonceStart;
  if (nonceTime > 100) {
    console.log(LOG_PREFIX, `⏱️  Getting nonce took ${nonceTime}ms`);
  }

  // Build execute callData - wraps the trade call in ERC-7579 execute format
  // NOTE: If value > 0, the delegate wallet needs ETH to send it
  // With Tachyon gas sponsorship, delegate doesn't need ETH for gas, but still needs ETH for value
  const buildOpStart = Date.now();
  console.log(LOG_PREFIX, '🔧 Building UserOperation...');
  const executeCallData = buildExecuteCallData(targetContract, value, calldata);
  console.log(LOG_PREFIX, '  Execute calldata length:', executeCallData.length, 'chars');
  if (value > BigInt(0)) {
    console.warn(LOG_PREFIX, '⚠️ WARNING: Transaction includes value', Number(value) / 1e18, 'ETH');
    console.warn(LOG_PREFIX, '  Delegate wallet must have ETH balance >=', Number(value) / 1e18, 'ETH');
  }

  // Build UserOperation
  const userOp = buildUserOperation({
    sender: delegateAddress,
    nonce,
    callData: executeCallData,
  });
  const buildOpTime = Date.now() - buildOpStart;
  if (buildOpTime > 50) {
    console.log(LOG_PREFIX, `⏱️  Building UserOp took ${buildOpTime}ms`);
  }

  console.log(LOG_PREFIX, '  UserOp built:');
  console.log(LOG_PREFIX, '    sender:', userOp.sender);
  console.log(LOG_PREFIX, '    nonce:', userOp.nonce.toString());
  console.log(LOG_PREFIX, '    callGasLimit:', userOp.callGasLimit.toString());
  console.log(LOG_PREFIX, '    verificationGasLimit:', userOp.verificationGasLimit.toString());
  console.log(LOG_PREFIX, '    preVerificationGas:', userOp.preVerificationGas.toString());

  // Sign UserOp hash
  console.log(LOG_PREFIX, '🔐 Signing UserOperation...');
  const userOpHash = hashUserOperation(userOp);
  console.log(LOG_PREFIX, '  UserOp hash:', userOpHash);
  
  const delegateWalletClient = createWalletClient({
    account: delegateAccount,
    chain: base,
    transport: http(),
  });

  const signature = await delegateWalletClient.signMessage({
    message: { raw: userOpHash },
  });
  console.log(LOG_PREFIX, '✅ UserOp signed');

  userOp.signature = signature;

  // Encode handleOps
  const handleOpsCallData = encodeHandleOps(userOp, TACHYON_BENEFICIARY);
  console.log(LOG_PREFIX, '  handleOps calldata length:', handleOpsCallData.length, 'chars');
  console.log(LOG_PREFIX, '  Beneficiary:', TACHYON_BENEFICIARY);

  // Calculate relay gas limit (2x safety margin)
  const relayGasLimit = calculateRelayGasLimit(userOp);
  console.log(LOG_PREFIX, '  Relay gas limit:', relayGasLimit.toString());

  // Prepare relay parameters
  let authorizationList: EIP7702Authorization[] | undefined;

  if (needsAuthorization) {
    // First trade: Sign EIP-7702 authorization
    console.log(LOG_PREFIX, '📝 First trade - signing EIP-7702 authorization...');
    const authorization = await signEIP7702Authorization(delegatePrivateKey);
    authorizationList = [authorization];
    console.log(LOG_PREFIX, '✅ EIP-7702 authorization ready');
  } else {
    console.log(LOG_PREFIX, '⚡ Subsequent trade - using flash-blocks for speed!');
  }

  // Relay via Tachyon
  console.log(LOG_PREFIX, '📡 Sending to Tachyon relay...');
  const relayParams = {
    chainId: base.id,
    to: ENTRY_POINT_ADDRESS,
    callData: handleOpsCallData,
    value: '0', // Tachyon relay value is always 0 (gas sponsorship)
    gasLimit: relayGasLimit.toString(),
    ...(authorizationList
      ? { authorizationList } // First tx: EIP-7702 (standard relay, ~150ms)
      : { transactionType: 'flash-blocks' as const }), // Future: flash-blocks (sub-50ms!)
  };
  
  console.log(LOG_PREFIX, '  Relay params:');
  console.log(LOG_PREFIX, '    chainId:', relayParams.chainId);
  console.log(LOG_PREFIX, '    to:', relayParams.to);
  console.log(LOG_PREFIX, '    gasLimit:', relayParams.gasLimit);
  console.log(LOG_PREFIX, '    transactionType:', authorizationList ? 'standard (EIP-7702)' : 'flash-blocks');
  console.log(LOG_PREFIX, '    NOTE: Relay value is 0 (Tachyon sponsors gas), but UserOp includes value:', value.toString(), 'wei');

  let taskId: string;
  try {
    taskId = await tachyon.relay(relayParams);
    console.log(LOG_PREFIX, '✅ Relay submitted, task ID:', taskId);
  } catch (error: any) {
    console.error(LOG_PREFIX, '❌ Relay failed:', error);
    console.error(LOG_PREFIX, '  Error message:', error?.message || String(error));
    console.error(LOG_PREFIX, '  Error stack:', error?.stack);
    console.error(LOG_PREFIX, '  Params:', JSON.stringify(relayParams, (_, v) => 
      typeof v === 'bigint' ? v.toString() : v, 2));
    
    // Provide helpful error messages
    if (error?.message?.includes('insufficient') || error?.message?.includes('balance')) {
      throw new Error(
        `Insufficient balance: Delegate wallet needs ${Number(value) / 1e18} ETH to send with transaction. ` +
        `Tachyon sponsors gas, but delegate must have ETH for transaction value. ` +
        `Current delegate: ${delegateAddress}`
      );
    }
    
    throw error;
  }

  // Wait for execution
  console.log(LOG_PREFIX, '⏳ Waiting for execution (timeout: 30s)...');
  let result;
  try {
    result = await tachyon.waitForExecutionHash(taskId, 30_000);
    console.log(LOG_PREFIX, '✅ Execution result:', result);
  } catch (error) {
    console.error(LOG_PREFIX, '❌ Wait for execution failed:', error);
    console.error(LOG_PREFIX, '  Task ID:', taskId);
    throw error;
  }
  
  // Extract the transaction hash from the result
  // The result can be either a string (tx hash) or an object with executionTxHash property
  const txHash = typeof result === 'string' 
    ? result 
    : (result as { executionTxHash?: string; txHash?: string }).executionTxHash 
      || (result as { txHash?: string }).txHash 
      || String(result);

  console.log(LOG_PREFIX, '🎉 Transaction executed!');
  console.log(LOG_PREFIX, '  TX Hash:', txHash);
  console.log(LOG_PREFIX, '  Explorer: https://basescan.org/tx/' + txHash);

  // Mark delegation as complete after successful first trade
  if (needsAuthorization) {
    markDelegateDelegated();
  }

  console.log(LOG_PREFIX, '═══════════════════════════════════════');
  console.log(LOG_PREFIX, '✅ Relay complete!');
  console.log(LOG_PREFIX, '═══════════════════════════════════════');

  return txHash as `0x${string}`;
}
