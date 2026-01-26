/**
 * Hook for managing relay provider selection
 * 
 * Allows switching between Tachyon and Gelato providers
 * and provides status information for debugging.
 */

import { useCallback } from 'react';
import { relayService } from '@/lib/relayService';
import type { RelayProviderType } from '@/lib/relayProvider';

/**
 * Hook for managing relay provider
 */
export function useRelayProvider() {
  const currentProvider = relayService.getCurrentProviderType();
  const availableProviders = relayService.getAvailableProviders();
  const configuredProviders = relayService.getConfiguredProviders();
  const allStatuses = relayService.getAllProviderStatuses();

  const setProvider = useCallback((providerType: RelayProviderType) => {
    relayService.setProvider(providerType);
  }, []);

  const getProviderStatus = useCallback((providerType: RelayProviderType) => {
    return allStatuses[providerType];
  }, [allStatuses]);

  return {
    currentProvider,
    availableProviders,
    configuredProviders,
    allStatuses,
    setProvider,
    getProviderStatus,
  };
}
