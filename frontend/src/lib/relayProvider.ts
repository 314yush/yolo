/**
 * Relay Provider Interface
 *
 * Abstract interface for different relay providers (Tachyon, Gelato, etc.)
 * This allows easy switching and performance comparison between providers.
 */

import type { Address, Hex } from 'viem';

/**
 * Parameters for relaying a trade transaction
 */
export interface RelayTradeParams {
  /** Address of the embedded wallet (sender) */
  senderAddress: Address;
  /** Target contract address (e.g., Avantis Trading) */
  targetContract: Address;
  /** Encoded function call (raw trade calldata, no delegatedAction) */
  calldata: Hex;
  /** Value to send with transaction (in wei) */
  value?: bigint;
  /** Sign a message (for UserOp hash signing) */
  signMessage: (message: { raw: Hex }) => Promise<Hex>;
  /** Sign EIP-7702 authorization (for first trade) */
  signAuthorization?: (contractAddress: Address) => Promise<{
    chainId: number;
    address: Address;
    nonce: number;
    r: Hex;
    s: Hex;
    v: number;
    yParity: 0 | 1;
  }>;
  /** First trade: bundle USDC approve in batch execute */
  needsApproval?: boolean;
  /** Force authorization even if already delegated (provider-specific) */
  forceAuthorization?: boolean;
}

/**
 * Result from relaying a transaction
 */
export interface RelayResult {
  /** Transaction hash of the executed transaction */
  txHash: `0x${string}`;
  /** Provider-specific metadata (e.g., task ID, latency) */
  metadata?: Record<string, unknown>;
}

/**
 * Relay Provider Interface
 *
 * All relay providers must implement this interface to ensure compatibility.
 */
export interface IRelayProvider {
  /** Provider name (e.g., 'tachyon', 'gelato') */
  readonly name: string;

  /** Check if provider is configured and ready to use */
  isConfigured(): boolean;

  /**
   * Relay a trade transaction
   *
   * @param params - Transaction parameters
   * @returns Transaction hash and optional metadata
   */
  relayTrade(params: RelayTradeParams): Promise<RelayResult>;

  /**
   * Get provider-specific configuration status
   * Useful for debugging and setup validation
   */
  getStatus(): {
    configured: boolean;
    details?: Record<string, unknown>;
  };
}

/**
 * Relay provider type for type-safe provider selection
 */
export type RelayProviderType = 'tachyon' | 'gelato';

/**
 * Configuration for relay service
 */
export interface RelayServiceConfig {
  /** Default provider to use */
  defaultProvider: RelayProviderType;
  /** Whether to allow provider switching at runtime */
  allowProviderSwitch?: boolean;
}
