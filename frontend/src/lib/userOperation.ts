/**
 * UserOperation Builder for ERC-4337
 * 
 * Builds, hashes, and encodes UserOperations for Tachyon relay.
 * Based on: https://github.com/RathFinance/tachyon-examples/blob/main/ts-example/src/scripts/eip7702_4337.ts
 */

import {
  encodeFunctionData,
  encodePacked,
  concat,
  pad,
  numberToHex,
  type Hex,
  type Address,
} from 'viem';
import { getUserOperationHash } from 'viem/account-abstraction';
import { base } from 'viem/chains';
import { ENTRY_POINT_ADDRESS } from './constants';

const LOG_PREFIX = '[UserOp]';

// EntryPoint v0.7 ABI for handleOps
export const ENTRY_POINT_ABI = [
  {
    name: 'handleOps',
    type: 'function',
    inputs: [
      {
        name: 'ops',
        type: 'tuple[]',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'beneficiary', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getNonce',
    type: 'function',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ name: 'nonce', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ERC-7579 execute ABI (used by delegation contract)
export const EXECUTE_ABI = [
  {
    name: 'execute',
    type: 'function',
    inputs: [
      { internalType: 'ExecMode', name: 'execMode', type: 'bytes32' },
      { internalType: 'bytes', name: 'executionCalldata', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

export interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

// Default gas limits - increased for Avantis trades which are gas-heavy
// Original values from example were too low (500k callGasLimit caused reverts)
const DEFAULT_CALL_GAS_LIMIT = BigInt(1_500_000);      // Increased from 500k - Avantis trades use ~600k+
const DEFAULT_VERIFICATION_GAS_LIMIT = BigInt(1_500_000); // Increased from 1.2M for safety
const DEFAULT_PRE_VERIFICATION_GAS = BigInt(150_000);     // Increased from 100k for safety

/**
 * Build execute callData for ERC-7579 modular account
 * Packs: (target address, value, calldata) and wraps in execute()
 */
export function buildExecuteCallData(
  target: Address,
  value: bigint,
  calldata: Hex
): Hex {
  // Pack the target call: (address, value, calldata)
  const encoded = encodePacked(
    ['address', 'uint256', 'bytes'],
    [target, value, calldata]
  );

  // Wrap in execute() - ERC-7579 modular account format
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [
      '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex, // Default exec mode
      encoded,
    ],
  });
}

/**
 * Build a complete UserOperation
 */
export function buildUserOperation(params: {
  sender: Address;
  nonce: bigint;
  callData: Hex;
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
}): UserOperation {
  const {
    sender,
    nonce,
    callData,
    callGasLimit = DEFAULT_CALL_GAS_LIMIT,
    verificationGasLimit = DEFAULT_VERIFICATION_GAS_LIMIT,
    preVerificationGas = DEFAULT_PRE_VERIFICATION_GAS,
  } = params;

  return {
    sender,
    nonce,
    initCode: '0x' as Hex, // No initCode needed with EIP-7702
    callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas: BigInt(0), // Sponsored (Tachyon pays)
    maxPriorityFeePerGas: BigInt(0), // Sponsored
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex, // Will be filled in after signing
  };
}

/**
 * Hash a UserOperation for signing
 */
export function hashUserOperation(userOp: UserOperation): Hex {
  return getUserOperationHash({
    userOperation: userOp,
    entryPointAddress: ENTRY_POINT_ADDRESS,
    entryPointVersion: '0.7',
    chainId: base.id,
  });
}

/**
 * Encode handleOps call for EntryPoint v0.7
 * Packs gas limits into bytes32 as required by v0.7
 */
export function encodeHandleOps(
  userOp: UserOperation,
  beneficiary: Address
): Hex {
  return encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: 'handleOps',
    args: [
      [
        {
          sender: userOp.sender,
          nonce: userOp.nonce,
          initCode: userOp.initCode || '0x',
          callData: userOp.callData,
          // v0.7: Pack verification + call gas limits into 32 bytes
          accountGasLimits: concat([
            pad(numberToHex(userOp.verificationGasLimit || BigInt(0)), { size: 16 }),
            pad(numberToHex(userOp.callGasLimit || BigInt(0)), { size: 16 }),
          ]),
          preVerificationGas: userOp.preVerificationGas,
          // v0.7: Pack priority + max fee into 32 bytes (both 0 for sponsored)
          gasFees: concat([
            pad(numberToHex(BigInt(0)), { size: 16 }),
            pad(numberToHex(BigInt(0)), { size: 16 }),
          ]),
          paymasterAndData: userOp.paymasterAndData || '0x',
          signature: userOp.signature,
        },
      ],
      beneficiary,
    ],
  });
}

/**
 * Calculate relay gas limit (2x safety margin)
 */
export function calculateRelayGasLimit(userOp: UserOperation): bigint {
  return (
    (userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas) *
    BigInt(2)
  );
}
