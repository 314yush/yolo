/**
 * Tachyon Relay Provider Implementation
 *
 * Implements IRelayProvider for Tachyon relay service.
 * Uses embedded wallet signing functions instead of raw private keys.
 */

import type { Address, Hex } from 'viem';
import type { IRelayProvider, RelayTradeParams, RelayResult } from '../relayProvider';
import { debug } from '../debug';
import {
  tachyon,
  isTachyonConfigured,
  ENTRY_POINT_ADDRESS,
  ERC4337_DELEGATION_CONTRACT,
  TACHYON_BENEFICIARY,
} from '../tachyonClient';
import {
  buildExecuteCallData,
  buildBatchExecuteCallData,
  buildUserOperation,
  hashUserOperation,
  encodeHandleOps,
  calculateRelayGasLimit,
} from '../userOperation';
import {
  isWalletDelegated,
  markWalletDelegated,
  getWalletNonce,
} from '../tachyonRelay';
import { buildUsdcApprovalTx } from '../avantisEncoder';

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
      },
    };
  }

  async relayTrade(params: RelayTradeParams): Promise<RelayResult> {
    const {
      senderAddress,
      targetContract,
      calldata,
      value = BigInt(0),
      signMessage,
      signAuthorization,
      needsApproval,
      forceAuthorization,
    } = params;

    debug(LOG_PREFIX, '═══════════════════════════════════════');
    debug(LOG_PREFIX, 'Starting Tachyon relay...');
    debug(LOG_PREFIX, '═══════════════════════════════════════');

    if (!this.isConfigured()) {
      throw new Error('Tachyon not configured - missing API key. Set NEXT_PUBLIC_TACHYON_API_KEY in .env.local');
    }

    debug(LOG_PREFIX, 'Sender:', senderAddress);
    debug(LOG_PREFIX, 'Target:', targetContract);
    debug(LOG_PREFIX, 'Calldata length:', calldata.length);
    debug(LOG_PREFIX, 'Needs approval:', !!needsApproval);

    // Check if this is the first trade (needs EIP-7702 authorization)
    const delegatedStatus = isWalletDelegated(senderAddress);
    const needsAuthorization = forceAuthorization || !delegatedStatus;
    debug(LOG_PREFIX, 'Needs EIP-7702 auth:', needsAuthorization);

    // Get nonce from EntryPoint
    const nonceStart = Date.now();
    const nonce = await getWalletNonce(senderAddress);
    const nonceTime = Date.now() - nonceStart;

    // Build execute callData
    const buildOpStart = Date.now();
    let executeCallData: Hex;

    if (needsApproval) {
      // First trade: batch [approve USDC, trade] in one UserOp
      const approvalTx = buildUsdcApprovalTx();
      executeCallData = buildBatchExecuteCallData([
        { target: approvalTx.to, value: BigInt(0), calldata: approvalTx.data },
        { target: targetContract, value, calldata },
      ]);
      debug(LOG_PREFIX, 'Built batch execute: approve + trade');
    } else {
      // Normal trade: single execute
      executeCallData = buildExecuteCallData(targetContract, value, calldata);
    }

    // Build UserOperation
    const userOp = buildUserOperation({
      sender: senderAddress,
      nonce,
      callData: executeCallData,
    });
    const buildOpTime = Date.now() - buildOpStart;

    // Sign UserOp hash using embedded wallet
    const userOpHash = hashUserOperation(userOp);
    const signature = await signMessage({ raw: userOpHash });
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
      if (!signAuthorization) {
        throw new Error('EIP-7702 authorization required but signAuthorization not provided');
      }
      debug(LOG_PREFIX, 'Signing EIP-7702 authorization...');
      const authorization = await signAuthorization(ERC4337_DELEGATION_CONTRACT);
      authorizationList = [authorization];
    } else {
      debug(LOG_PREFIX, 'Skipping EIP-7702 auth (already delegated)');
    }

    // Build relay parameters
    const handleOpsCallData = encodeHandleOps(signedUserOp, TACHYON_BENEFICIARY);
    const relayGasLimit = calculateRelayGasLimit(signedUserOp);

    const relayParams = {
      chainId: 8453,
      to: ENTRY_POINT_ADDRESS,
      callData: handleOpsCallData,
      value: '0',
      gasLimit: relayGasLimit.toString(),
      ...(authorizationList
        ? { authorizationList }
        : { transactionType: 'flash-blocks' as const }),
    };

    debug(LOG_PREFIX, 'Relaying UserOperation...');
    debug(LOG_PREFIX, '  type:', authorizationList ? 'standard (EIP-7702)' : 'flash-blocks');

    // Relay via Tachyon
    const relayStart = Date.now();
    let taskId: string;
    try {
      taskId = await tachyon.relay(relayParams);
      debug(LOG_PREFIX, 'Relay submitted, taskId:', taskId);
    } catch (error) {
      console.error(LOG_PREFIX, 'Relay submission failed:', error);
      throw error;
    }

    // Wait for execution
    debug(LOG_PREFIX, 'Waiting for execution (timeout: 30s)...');
    const relayTime = Date.now() - relayStart;
    let result;
    try {
      result = await tachyon.waitForExecutionHash(taskId, 30_000);

      const txHash = typeof result === 'string'
        ? result
        : (result as { executionTxHash?: string; txHash?: string }).executionTxHash
          || (result as { txHash?: string }).txHash
          || String(result);

      debug(LOG_PREFIX, 'TX Hash:', txHash);

      // Mark delegation as complete after successful first trade
      if (needsAuthorization) {
        markWalletDelegated(senderAddress);
      }

      return {
        txHash: txHash as `0x${string}`,
        metadata: {
          taskId,
          transactionType: authorizationList ? 'standard' : 'flash-blocks',
          relayTimeMs: relayTime,
          nonceTimeMs: nonceTime,
          buildOpTimeMs: buildOpTime,
          batchedApproval: !!needsApproval,
        },
      };
    } catch (error) {
      console.error(LOG_PREFIX, 'Execution failed:', error);
      throw error;
    }
  }
}
