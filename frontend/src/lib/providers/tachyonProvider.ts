/**
 * Tachyon Relay Provider Implementation
 * 
 * Implements IRelayProvider for Tachyon relay service.
 */

import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import type { IRelayProvider, RelayTradeParams, RelayResult } from '../relayProvider';
import { 
  tachyon, 
  isTachyonConfigured,
  ENTRY_POINT_ADDRESS, 
  ERC4337_DELEGATION_CONTRACT, 
  TACHYON_BENEFICIARY,
} from '../tachyonClient';
import {
  buildExecuteCallData,
  buildUserOperation,
  hashUserOperation,
  encodeHandleOps,
  calculateRelayGasLimit,
} from '../userOperation';
import {
  isDelegateDelegated,
  markDelegateDelegated,
  signEIP7702Authorization,
  getDelegateNonce,
} from '../tachyonRelay';

const LOG_PREFIX = '[TachyonProvider]';

/**
 * Tachyon Relay Provider
 */
export class TachyonRelayProvider implements IRelayProvider {
  readonly name = 'tachyon';

  isConfigured(): boolean {
    return isTachyonConfigured();
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      details: {
        entryPoint: ENTRY_POINT_ADDRESS,
        delegationContract: ERC4337_DELEGATION_CONTRACT,
        beneficiary: TACHYON_BENEFICIARY,
        isDelegated: isDelegateDelegated(),
      },
    };
  }

  async relayTrade(params: RelayTradeParams): Promise<RelayResult> {
    const { delegatePrivateKey, targetContract, calldata, value = BigInt(0), forceAuthorization } = params;

    console.log(LOG_PREFIX, '═══════════════════════════════════════');
    console.log(LOG_PREFIX, '🚀 Starting Tachyon relay...');
    console.log(LOG_PREFIX, '═══════════════════════════════════════');

    if (!this.isConfigured()) {
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
    console.log(LOG_PREFIX, '  Value:', value.toString(), 'wei');

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
    const buildOpStart = Date.now();
    const executeCallData = buildExecuteCallData(targetContract, value, calldata);
    
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

    // Sign UserOp hash
    const userOpHash = hashUserOperation(userOp);
    const { createWalletClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    const delegateWalletClient = createWalletClient({
      account: delegateAccount,
      chain: base,
      transport: http(),
    });
    const signature = await delegateWalletClient.signMessage({ message: { raw: userOpHash } });
    const signedUserOp = { ...userOp, signature };

    // Prepare authorization list if needed
    let authorizationList: Array<{
      chainId: number;
      address: Address;
      nonce: number;
      r: Hex;
      s: Hex;
      v: number;
      yParity: 0 | 1;
    }> | undefined;

    if (needsAuthorization) {
      console.log(LOG_PREFIX, '🔐 Signing EIP-7702 authorization...');
      const authorization = await signEIP7702Authorization(delegatePrivateKey);
      authorizationList = [authorization];
    } else {
      console.log(LOG_PREFIX, '⏭️  Skipping EIP-7702 auth (already delegated)');
    }

    // Build relay parameters
    const handleOpsCallData = encodeHandleOps(signedUserOp, TACHYON_BENEFICIARY);
    const relayGasLimit = calculateRelayGasLimit(signedUserOp);
    
    const relayParams = {
      chainId: 8453, // Base mainnet
      to: ENTRY_POINT_ADDRESS,
      callData: handleOpsCallData,
      value: '0', // Tachyon relay value is always 0 (gas sponsorship)
      gasLimit: relayGasLimit.toString(),
      ...(authorizationList
        ? { authorizationList } // First tx: EIP-7702 (standard relay, ~150ms)
        : { transactionType: 'flash-blocks' as const }), // Future: flash-blocks (sub-50ms!)
    };

    console.log(LOG_PREFIX, '📤 Relaying UserOperation...');
    console.log(LOG_PREFIX, '    to:', relayParams.to);
    console.log(LOG_PREFIX, '    gasLimit:', relayParams.gasLimit);
    console.log(LOG_PREFIX, '    transactionType:', authorizationList ? 'standard (EIP-7702)' : 'flash-blocks');

    // Relay via Tachyon
    const relayStart = Date.now();
    let taskId: string;
    try {
      taskId = await tachyon.relay(relayParams);
      console.log(LOG_PREFIX, '✅ Relay submitted successfully');
      console.log(LOG_PREFIX, '  Task ID:', taskId);
    } catch (error) {
      console.error(LOG_PREFIX, '❌ Relay submission failed:', error);
      throw error;
    }

    // Wait for execution
    console.log(LOG_PREFIX, '⏳ Waiting for execution (timeout: 30s)...');
    const relayTime = Date.now() - relayStart;
    let result;
    try {
      result = await tachyon.waitForExecutionHash(taskId, 30_000);
      console.log(LOG_PREFIX, `✅ Execution completed in ${relayTime}ms`);
      
      // Extract the transaction hash from the result
      // The result can be either a string (tx hash) or an object with executionTxHash property
      const txHash = typeof result === 'string' 
        ? result 
        : (result as { executionTxHash?: string; txHash?: string }).executionTxHash 
          || (result as { txHash?: string }).txHash 
          || String(result);

      console.log(LOG_PREFIX, '  TX Hash:', txHash);
      console.log(LOG_PREFIX, '═══════════════════════════════════════');

      // Mark delegation as complete after successful first trade
      if (needsAuthorization) {
        markDelegateDelegated();
      }

      return {
        txHash: txHash as `0x${string}`,
        metadata: {
          taskId,
          transactionType: authorizationList ? 'standard' : 'flash-blocks',
          relayTimeMs: relayTime,
          nonceTimeMs: nonceTime,
          buildOpTimeMs: buildOpTime,
        },
      };
    } catch (error) {
      console.error(LOG_PREFIX, '❌ Execution failed:', error);
      throw error;
    }
  }
}
