/**
 * Relay Service
 * 
 * Manages relay providers and allows easy switching between them.
 * Enables A/B testing and performance comparison.
 */

import type { IRelayProvider, RelayTradeParams, RelayResult, RelayProviderType } from './relayProvider';
import { TachyonRelayProvider } from './providers/tachyonProvider';
import { GelatoRelayProvider } from './providers/gelatoProvider';

const LOG_PREFIX = '[RelayService]';

/**
 * Relay Service
 * 
 * Singleton service that manages relay providers and handles provider switching.
 */
class RelayService {
  private providers: Map<RelayProviderType, IRelayProvider>;
  private currentProvider: RelayProviderType;
  private defaultProvider: RelayProviderType;

  constructor() {
    this.providers = new Map();
    this.defaultProvider = 'tachyon'; // Default to Tachyon
    this.currentProvider = this.defaultProvider;

    // Initialize providers
    this.providers.set('tachyon', new TachyonRelayProvider());
    this.providers.set('gelato', new GelatoRelayProvider());
  }

  /**
   * Get the current active provider
   */
  getProvider(): IRelayProvider {
    const provider = this.providers.get(this.currentProvider);
    if (!provider) {
      throw new Error(`Provider '${this.currentProvider}' not found`);
    }
    return provider;
  }

  /**
   * Switch to a different provider
   */
  setProvider(providerType: RelayProviderType): void {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider '${providerType}' not found`);
    }

    if (!provider.isConfigured()) {
      throw new Error(`Provider '${providerType}' is not configured`);
    }

    const previousProvider = this.currentProvider;
    this.currentProvider = providerType;
    console.log(LOG_PREFIX, `🔄 Switched from ${previousProvider} to ${providerType}`);
  }

  /**
   * Get current provider type
   */
  getCurrentProviderType(): RelayProviderType {
    return this.currentProvider;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): RelayProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all configured providers
   */
  getConfiguredProviders(): RelayProviderType[] {
    return Array.from(this.providers.entries())
      .filter(([_, provider]) => provider.isConfigured())
      .map(([type, _]) => type);
  }

  /**
   * Get provider status for all providers
   */
  getAllProviderStatuses(): Record<RelayProviderType, ReturnType<IRelayProvider['getStatus']>> {
    const statuses: Record<string, ReturnType<IRelayProvider['getStatus']>> = {};
    for (const [type, provider] of this.providers.entries()) {
      statuses[type] = provider.getStatus();
    }
    return statuses as Record<RelayProviderType, ReturnType<IRelayProvider['getStatus']>>;
  }

  /**
   * Relay a trade using the current provider
   */
  async relayTrade(params: RelayTradeParams): Promise<RelayResult> {
    const provider = this.getProvider();
    const providerName = provider.name;
    const startTime = Date.now();

    console.log(LOG_PREFIX, `📤 Relaying via ${providerName}...`);

    try {
      const result = await provider.relayTrade(params);
      const elapsed = Date.now() - startTime;
      
      console.log(LOG_PREFIX, `✅ ${providerName} relay completed in ${elapsed}ms`);
      console.log(LOG_PREFIX, `   TX Hash: ${result.txHash}`);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          provider: providerName,
          totalTimeMs: elapsed,
        },
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(LOG_PREFIX, `❌ ${providerName} relay failed after ${elapsed}ms:`, error);
      throw error;
    }
  }

  /**
   * Compare performance between providers
   * 
   * Useful for A/B testing to see which provider is faster.
   * Note: This will execute the transaction twice, so use carefully!
   */
  async compareProviders(
    params: RelayTradeParams,
    providers: RelayProviderType[] = ['tachyon', 'gelato']
  ): Promise<Record<RelayProviderType, { success: boolean; timeMs: number; txHash?: string; error?: string }>> {
    const results: Record<string, { success: boolean; timeMs: number; txHash?: string; error?: string }> = {};

    for (const providerType of providers) {
      const provider = this.providers.get(providerType);
      if (!provider || !provider.isConfigured()) {
        results[providerType] = {
          success: false,
          timeMs: 0,
          error: 'Provider not configured',
        };
        continue;
      }

      const startTime = Date.now();
      try {
        const result = await provider.relayTrade(params);
        const elapsed = Date.now() - startTime;
        results[providerType] = {
          success: true,
          timeMs: elapsed,
          txHash: result.txHash,
        };
      } catch (error) {
        const elapsed = Date.now() - startTime;
        results[providerType] = {
          success: false,
          timeMs: elapsed,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return results as Record<RelayProviderType, { success: boolean; timeMs: number; txHash?: string; error?: string }>;
  }
}

// Export singleton instance
export const relayService = new RelayService();

// Export convenience functions
export function getRelayProvider(): IRelayProvider {
  return relayService.getProvider();
}

export function setRelayProvider(providerType: RelayProviderType): void {
  relayService.setProvider(providerType);
}

export function relayTrade(params: RelayTradeParams): Promise<RelayResult> {
  return relayService.relayTrade(params);
}
