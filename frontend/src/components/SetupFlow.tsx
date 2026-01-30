'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useBatchedSetup } from '@/hooks/useBatchedSetup';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CONTRACTS, CHAIN_CONFIG } from '@/lib/constants';

interface SetupFlowProps {
  onSetupComplete: () => void;
}

type SetupStep = 'checking' | 'setup' | 'complete';

// NOTE: With Tachyon gas sponsorship, delegate wallet no longer needs ETH!
// ETH funding step has been removed from the setup flow.

// Base chain ID in hex
const BASE_CHAIN_ID_HEX = '0x2105'; // 8453 in hex

export function SetupFlow({ onSetupComplete }: SetupFlowProps) {
  const { user, ready: privyReady } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { setDelegateStatus } = useTradeStore();
  const { ensureDelegateWallet, delegateAddress } = useDelegateWallet();
  const { checkDelegateStatus, checkUsdcAllowance } = useAvantisAPI();
  const { executeBatchedSetup, isProcessing: isBatching } = useBatchedSetup();

  const [step, setStep] = useState<SetupStep>('checking');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // NOTE: delegateBalance state removed - with Tachyon gas sponsorship, delegate doesn't need ETH
  const [hasCheckedStatus, setHasCheckedStatus] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const userAddress = user?.wallet?.address as `0x${string}` | undefined;

  // Find the user's wallet - could be embedded or external
  const getUserWallet = useCallback(() => {
    if (!wallets || wallets.length === 0) return null;
    
    console.log('Available wallets:', wallets.map(w => ({
      address: w.address,
      walletClientType: w.walletClientType,
      connectorType: w.connectorType,
    })));
    
    // First try to find Privy embedded wallet
    let wallet = wallets.find((w) => w.walletClientType === 'privy');
    
    // If no embedded wallet, try to find any wallet matching user address
    if (!wallet && userAddress) {
      wallet = wallets.find((w) => w.address.toLowerCase() === userAddress.toLowerCase());
    }
    
    // Fallback to first available wallet
    if (!wallet) {
      wallet = wallets[0];
    }
    
    return wallet;
  }, [wallets, userAddress]);

  // Safely get Ethereum provider with fallback handling
  const getEthereumProviderSafe = useCallback(async (wallet: any) => {
    try {
      // Try to get provider from Privy wallet
      if (wallet && typeof wallet.getEthereumProvider === 'function') {
        try {
          const provider = await wallet.getEthereumProvider();
          if (provider) {
            return provider;
          }
        } catch (providerError: any) {
          console.error('getEthereumProvider failed:', {
            error: providerError,
            message: providerError?.message,
            code: providerError?.code,
            walletType: wallet.walletClientType,
            connectorType: wallet.connectorType,
            walletAddress: wallet.address,
            stack: providerError?.stack,
          });
          // Check if it's a connector error
          if (providerError?.message?.toLowerCase().includes('connector') || 
              providerError?.message?.toLowerCase().includes('unknown')) {
            throw new Error(
              `Wallet connector error: ${providerError.message}. ` +
              `This wallet type (${wallet.walletClientType || wallet.connectorType || 'unknown'}) may not support direct provider access. ` +
              `Please try disconnecting and reconnecting your wallet, or use a different wallet.`
            );
          }
          // Re-throw if it's not a connector error
          throw providerError;
        }
      }
      
      // Fallback: Try to use window.ethereum if available
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        console.log('Using window.ethereum as fallback provider');
        return (window as any).ethereum;
      }
      
      throw new Error(
        `Unable to get Ethereum provider. Wallet type: ${wallet?.walletClientType || wallet?.connectorType || 'unknown'}. ` +
        `Please ensure your wallet is properly connected.`
      );
    } catch (error) {
      console.error('Error getting Ethereum provider:', error);
      throw error;
    }
  }, []);

  // NOTE: checkDelegateBalance removed - with Tachyon gas sponsorship, delegate doesn't need ETH

  // Switch to Base network
  const switchToBase = useCallback(async (provider: any) => {
    try {
      // Try to switch to Base
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (switchError: any) {
      // If chain doesn't exist, add it
      if (switchError.code === 4902) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BASE_CHAIN_ID_HEX,
            chainName: 'Base',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  }, []);

  // NOTE: Auto-check balance useEffect removed - with Tachyon gas sponsorship, delegate doesn't need ETH

  // Check current setup status
  useEffect(() => {
    async function checkStatus() {
      // Prevent multiple simultaneous checks
      if (!userAddress || !privyReady || !walletsReady || isCheckingStatus) return;
      
      // If we've already checked and are in an error state, don't re-check automatically
      // Only re-check if the user address changes (new login)
      if (hasCheckedStatus && error && step === 'setup') {
        return;
      }

      // Check if we have cached status that says setup is complete
      // If so, verify it's still valid on-chain, but don't block the UI
      const { delegateStatus: cachedStatus } = useTradeStore.getState();
      if (cachedStatus.isSetup && cachedStatus.usdcApproved && cachedStatus.delegateAddress) {
        console.log('📦 Found cached setup status, verifying on-chain...');
        // Don't block UI - show complete state immediately, verify in background
        setStep('complete');
        setIsCheckingStatus(false);
        onSetupComplete();
        
        // Verify on-chain in background (non-blocking)
        checkStatusOnChain().catch((err) => {
          console.error('Background status check failed:', err);
          // If verification fails, we'll re-check on next mount or user action
        });
        return;
      }

      setIsCheckingStatus(true);
      setStep('checking');
      setError(null);
      
      await checkStatusOnChain();
    }

    async function checkStatusOnChain() {
      if (!userAddress) return; // Type guard
      
      try {
        // Step 1: Ensure we have a delegate wallet locally (instant - localStorage check)
        // This is fast and doesn't require any network calls
        const wallet = ensureDelegateWallet();
        console.log('Local delegate wallet:', wallet.address);
        
        // Step 2: Check if delegation is set up on-chain (API call - can be slow)
        // Use Promise.race to add a timeout fallback - match API timeout of 35s
        const statusPromise = checkDelegateStatus(userAddress);
        const timeoutPromise = new Promise<{ isSetup: false; delegateAddress: null; error: string }>((resolve) => {
          setTimeout(() => resolve({ isSetup: false, delegateAddress: null, error: 'Request timed out' }), 35000); // 35s timeout to match API
        });
        
        const status = await Promise.race([statusPromise, timeoutPromise]);
        console.log('Delegation status:', status);
        
        setHasCheckedStatus(true);
        
        // Handle API errors gracefully - but don't keep retrying
        if (status.error) {
          console.error('Failed to check delegate status:', status.error);
          setError(`API Error: ${status.error}. Make sure the backend is running.`);
          // Don't block - show setup but with error message
          setStep('setup');
          setIsCheckingStatus(false);
          return;
        }
      
        if (status.isSetup) {
        // Delegation is already set up on-chain
        // Check if it matches our local delegate
        const onChainDelegate = status.delegateAddress?.toLowerCase();
        const localDelegate = wallet.address.toLowerCase();
        
        if (onChainDelegate && onChainDelegate !== localDelegate) {
          // MISMATCH: On-chain delegate doesn't match our local delegate
          // This means we don't have the private key for the on-chain delegate
          // User needs to re-register with our local delegate
          console.log('Delegate mismatch! On-chain:', onChainDelegate, 'Local:', localDelegate);
          console.log('User needs to re-register delegation with local delegate');
          setHasCheckedStatus(true); // Mark as checked
          setStep('setup');
          setIsCheckingStatus(false);
          return;
        }
        
        console.log('Delegation already set up with:', wallet.address);
        
        // Step 3: Check USDC allowance
        // NOTE: With Tachyon, delegate doesn't need ETH, so we skip balance check
        const allowanceCheck = await checkUsdcAllowance(userAddress).catch((err) => {
          console.warn('USDC allowance check failed:', err);
          return { hasSufficient: false, allowance: 0 };
        });
        
        console.log('USDC allowance check:', allowanceCheck);
        
        if (!allowanceCheck.hasSufficient) {
          // Need to approve USDC for the Trading contract
          console.log('USDC allowance insufficient, need to approve');
          setHasCheckedStatus(true); // Mark as checked
          setStep('setup');
          setIsCheckingStatus(false);
          return;
        }
        
        // With Tachyon gas sponsorship, delegate doesn't need ETH
        // Go directly to complete after USDC is approved
        // Status is automatically persisted via setDelegateStatus
        
        const newStatus = {
          isSetup: true,
          delegateAddress: wallet.address,
          usdcApproved: true,
        };
        setDelegateStatus(newStatus);
        console.log('✅ Setup verified and cached:', newStatus);
        setHasCheckedStatus(true); // Mark as checked so we don't re-check
        setStep('complete');
        setIsCheckingStatus(false);
        onSetupComplete();
      } else {
        // Need to set up delegation and approval
        setHasCheckedStatus(true); // Mark as checked
        setStep('setup');
      }
      } catch (err) {
        console.error('Error checking status:', err);
        setHasCheckedStatus(true);
        setError('Failed to check setup status. Please refresh the page.');
        setStep('setup');
      } finally {
        setIsCheckingStatus(false);
      }
    }

    checkStatus();
    // Only re-run when user address or ready states change, not when callback functions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, privyReady, walletsReady]);

  // Batched setup: delegate + USDC approval
  const handleBatchedSetup = useCallback(async () => {
    if (!userAddress) {
      setError('User address not available');
      return;
    }
    
    setIsProcessing(true);
    setError(null);

    try {
      const result = await executeBatchedSetup(userAddress);
      
      if (!result.success) {
        setError(result.error || 'Failed to complete setup');
        return;
      }

      // Wait a moment for transactions to be mined, then check status
      // In a production app, you might want to wait for confirmations
      setTimeout(async () => {
        try {
          // Re-check status to verify setup completed
          const status = await checkDelegateStatus(userAddress);
          const allowanceCheck = await checkUsdcAllowance(userAddress);
          
          if (status.isSetup && allowanceCheck.hasSufficient) {
            setDelegateStatus({
              isSetup: true,
              delegateAddress: delegateAddress || null,
              usdcApproved: true,
            });
            setStep('complete');
            onSetupComplete();
          } else {
            // Setup may still be processing, show success but let user know to wait
            setDelegateStatus({
              isSetup: status.isSetup,
              delegateAddress: status.delegateAddress || delegateAddress || null,
              usdcApproved: allowanceCheck.hasSufficient,
            });
            setStep('complete');
            onSetupComplete();
          }
        } catch (err) {
          console.error('Error verifying setup:', err);
          // Still mark as complete since transactions were sent
          setDelegateStatus({
            isSetup: true,
            delegateAddress: delegateAddress || null,
            usdcApproved: true,
          });
          setStep('complete');
          onSetupComplete();
        }
      }, 2000);
    } catch (err: any) {
      console.error('Batched setup error:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(err?.message || 'Failed to complete setup');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userAddress, executeBatchedSetup, checkDelegateStatus, checkUsdcAllowance, delegateAddress, setDelegateStatus, onSetupComplete]);

  // NOTE: handleFundDelegate removed - with Tachyon gas sponsorship, delegate doesn't need ETH

  // Show loading while Privy/wallets are initializing
  if (!privyReady || !walletsReady) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">INITIALIZING...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render based on step
  if (step === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="text-xl sm:text-2xl font-bold text-white mb-4">CHECKING SETUP...</div>
        <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-md mx-auto w-full">
      <div className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-6 sm:mb-8">SETUP REQUIRED</div>
      
      {step === 'setup' && (
        <>
          <div className="text-white text-base sm:text-lg mb-4 leading-relaxed">
            Enable trading by authorizing a delegate wallet and approving USDC spending.
          </div>
          <div className="text-white/60 text-sm sm:text-base mb-6 sm:mb-8 leading-relaxed">
            This is a one-time setup on Base network. Your funds remain in your wallet. USDC approval is set to 10,000 USDC.
          </div>
          
          {/* Debug info */}
          <div className="text-white/40 text-xs mb-6 font-mono space-y-1">
            <div>Your wallet: {userAddress?.slice(0, 8)}...{userAddress?.slice(-6)}</div>
            <div>Delegate: {delegateAddress?.slice(0, 8)}...{delegateAddress?.slice(-6)}</div>
            <div>Network: Base (Chain ID: 8453)</div>
          </div>
          
          <button
            onClick={handleBatchedSetup}
            disabled={isProcessing || isBatching}
            className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button disabled:opacity-50 bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
          >
            {isProcessing || isBatching ? 'ENABLING TRADING...' : 'ENABLE TRADING'}
          </button>
        </>
      )}

      {/* NOTE: fund-delegate step removed - with Tachyon gas sponsorship, delegate doesn't need ETH */}

      {error && (
        <div className="mt-6 p-4 bg-red-500/20 border-2 border-red-500 text-red-400 text-sm sm:text-base rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
