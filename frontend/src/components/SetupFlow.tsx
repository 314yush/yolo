'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
import { useBatchedSetup } from '@/hooks/useBatchedSetup';
import { markOnboardingCompleteApi } from '@/lib/activityApi';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CONTRACTS, CHAIN_CONFIG } from '@/lib/constants';
import { debug } from '@/lib/debug';

interface SetupFlowProps {
  onSetupComplete: () => void;
}

type SetupStep = 'checking' | 'setup' | 'complete';

type PrivyConnectedWallet = {
  address?: string;
  walletClientType?: string;
  connectorType?: string;
  getEthereumProvider?: () => Promise<unknown>;
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// NOTE: With Tachyon gas sponsorship, delegate wallet no longer needs ETH!
// ETH funding step has been removed from the setup flow.

// Base chain ID in hex
const BASE_CHAIN_ID_HEX = '0x2105'; // 8453 in hex

export function SetupFlow({ onSetupComplete }: SetupFlowProps) {
  const { user, ready: privyReady } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { setDelegateStatus, delegateStatus } = useTradeStore();
  const { ensureDelegateWallet, delegateAddress } = useDelegateWallet();
  const { checkDelegateStatus, checkUsdcAllowance } = useAvantisAPI();
  const { executeBatchedSetup, isProcessing: isBatching, setupStatus } = useBatchedSetup();

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
    
    debug('Available wallets:', wallets.map(w => ({
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
  const getEthereumProviderSafe = useCallback(async (wallet: PrivyConnectedWallet | null | undefined) => {
    try {
      // Try to get provider from Privy wallet
      if (wallet && typeof wallet.getEthereumProvider === 'function') {
        try {
          const provider = await wallet.getEthereumProvider();
          if (provider) {
            return provider;
          }
        } catch (providerError: unknown) {
          const pe = isRecord(providerError) ? providerError : {};
          const msg =
            typeof pe.message === 'string' ? pe.message : String(providerError);
          console.error('getEthereumProvider failed:', {
            error: providerError,
            message: pe.message,
            code: pe.code,
            walletType: wallet.walletClientType,
            connectorType: wallet.connectorType,
            walletAddress: wallet.address,
            stack: pe.stack,
          });
          // Check if it's a connector error
          if (
            msg.toLowerCase().includes('connector') ||
            msg.toLowerCase().includes('unknown')
          ) {
            throw new Error(
              `Wallet connector error: ${msg}. ` +
                `This wallet type (${wallet.walletClientType || wallet.connectorType || 'unknown'}) may not support direct provider access. ` +
                `Please try disconnecting and reconnecting your wallet, or use a different wallet.`
            );
          }
          // Re-throw if it's not a connector error
          throw providerError;
        }
      }

      // Fallback: Try to use window.ethereum if available
      const injected = (typeof window !== 'undefined'
        ? (window as Window & { ethereum?: Eip1193Provider }).ethereum
        : undefined);
      if (injected) {
        debug('Using window.ethereum as fallback provider');
        return injected;
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
  const switchToBase = useCallback(async (provider: Eip1193Provider) => {
    try {
      // Try to switch to Base
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (switchError: unknown) {
      const code = isRecord(switchError) ? switchError.code : undefined;
      // If chain doesn't exist, add it
      if (code === 4902) {
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
        throw switchError instanceof Error ? switchError : new Error(String(switchError));
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
      // CRITICAL FIX: Always verify on-chain before trusting cache
      const { delegateStatus: cachedStatus } = useTradeStore.getState();
      if (cachedStatus.isSetup && cachedStatus.usdcApproved && cachedStatus.delegateAddress) {
        debug('📦 Found cached setup status, verifying on-chain...');
        
        // Verify on-chain FIRST before proceeding
        // Don't trust cache - always verify!
        setIsCheckingStatus(true);
        setStep('checking');
        await checkStatusOnChain();
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
        debug('Local delegate wallet:', wallet.address);
        
        // Step 2: Check USDC allowance FIRST (checking if EOA is connected with TradingStorage)
        // If USDC is already approved, user doesn't need to sign approval again
        const allowanceCheck = await checkUsdcAllowance(userAddress).catch((err) => {
          console.warn('USDC allowance check failed:', err);
          return { hasSufficient: false, allowance: 0 };
        });
        
        debug('USDC allowance check:', allowanceCheck);
        const hasUsdcApproved = allowanceCheck.hasSufficient;
        
        // Step 3: Check if delegation is set up on-chain (API call - can be slow)
        // Use Promise.race to add a timeout fallback - match API timeout of 35s
        const statusPromise = checkDelegateStatus(userAddress);
        const timeoutPromise = new Promise<{ isSetup: false; delegateAddress: null; error: string }>((resolve) => {
          setTimeout(() => resolve({ isSetup: false, delegateAddress: null, error: 'Request timed out' }), 35000); // 35s timeout to match API
        });
        
        const status = await Promise.race([statusPromise, timeoutPromise]);
        debug('Delegation status:', status);
        
        setHasCheckedStatus(true);
        
        // Handle API errors gracefully - but don't keep retrying
        if (status.error) {
          console.error('Failed to check delegate status:', status.error);
          setError(
            status.error === 'Failed to read contract'
              ? 'Failed to read from Base network. Check your connection and ensure NEXT_PUBLIC_BASE_RPC_URL is set on Vercel.'
              : `Error: ${status.error}`
          );
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
            // If USDC is already approved, user only needs to set up new delegate (no approval needed)
            // If USDC is not approved, user needs both delegate setup and approval
            debug('Delegate mismatch detected! On-chain:', onChainDelegate, 'Local:', localDelegate);
            if (hasUsdcApproved) {
              debug('✅ USDC already approved - user only needs to set up new delegate');
            } else {
              debug('⚠️ USDC not approved - user needs both delegate setup and approval');
            }
            // Proceed to setup step - batched setup will handle this intelligently
            setHasCheckedStatus(true);
            setStep('setup');
            setIsCheckingStatus(false);
            return;
          }
          
          debug('Delegation already set up with:', wallet.address);
          
          // Both delegate and USDC approval are set up correctly
          if (hasUsdcApproved) {
            const newStatus = {
              isSetup: true,
              delegateAddress: wallet.address,
              usdcApproved: true,
            };
            setDelegateStatus(newStatus);
            debug('✅ Setup verified and cached:', newStatus);
            setHasCheckedStatus(true);
            setStep('complete');
            setIsCheckingStatus(false);
            markOnboardingCompleteApi(userAddress); // Backend: record onboarding complete for new-device sync
            onSetupComplete();
            return;
          } else {
            // Delegate is set up but USDC approval is missing
            debug('⚠️ Delegate set up but USDC approval missing - need to approve');
            setHasCheckedStatus(true);
            setStep('setup');
            setIsCheckingStatus(false);
            return;
          }
        } else {
          // No delegate set up on-chain
          // If USDC is already approved, user only needs to set up delegate (no approval needed)
          // If USDC is not approved, user needs both delegate setup and approval
          if (hasUsdcApproved) {
            debug('✅ USDC already approved to TradingStorage - user only needs to set up delegate');
          } else {
            debug('⚠️ Need both delegate setup and USDC approval');
          }
          setHasCheckedStatus(true);
          setStep('setup');
          setIsCheckingStatus(false);
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

      if (!result.txHashes || result.txHashes.length === 0) {
        setError('Transaction hash not received. Setup may have failed.');
        setIsProcessing(false);
        return;
      }

      // With EIP-5792 sendCalls, we get a batch ID, not a transaction hash
      // We'll poll the on-chain state directly to verify setup completion
      const batchId = result.txHashes[0];

      // Poll for on-chain state changes (up to 60 seconds)
      // Since sendCalls returns a batch ID, we verify by checking on-chain state
      const maxAttempts = 60;
      let attempts = 0;
      let setupVerified = false;

      while (attempts < maxAttempts && !setupVerified) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between checks
        
        try {
          // Check if delegate is set up on-chain (USDC approval may already exist)
          const status = await checkDelegateStatus(userAddress);
          const allowanceCheck = await checkUsdcAllowance(userAddress).catch(() => ({ hasSufficient: false, allowance: 0 }));
          
          // Setup is verified if delegate is set up AND (USDC is approved OR was already approved before)
          // We check delegate first since that's what we're setting up
          if (status.isSetup) {
            // Verify delegate matches our local delegate
            const localDelegate = ensureDelegateWallet().address.toLowerCase();
            const onChainDelegate = status.delegateAddress?.toLowerCase();
            
            if (onChainDelegate === localDelegate) {
              // Delegate is set up correctly - check USDC approval
              // If USDC is already approved, we're done. If not, we need to wait for approval tx
              if (allowanceCheck.hasSufficient) {
                setupVerified = true;
                break;
              }
              // If USDC not approved yet, continue polling (approval might be in progress)
            }
          }
        } catch (err: unknown) {
          console.warn('Error checking on-chain state:', err);
        }
        
        attempts++;
      }

      if (!setupVerified) {
        setError('Setup verification timeout. Please check your wallet and try again.');
        setIsProcessing(false);
        return;
      }

      // Now verify on-chain that delegate is set up (USDC approval may already exist)
      try {
        // Re-check status to verify setup completed
        const status = await checkDelegateStatus(userAddress);
        const allowanceCheck = await checkUsdcAllowance(userAddress).catch(() => ({ hasSufficient: false, allowance: 0 }));
        
        // CRITICAL: Delegate must be set up. USDC approval must be present (either from this setup or already existed)
        if (status.isSetup) {
          // Verify delegate matches our local delegate
          const localDelegate = ensureDelegateWallet().address.toLowerCase();
          const onChainDelegate = status.delegateAddress?.toLowerCase();
          
          if (onChainDelegate !== localDelegate) {
            // This shouldn't happen if multicall worked correctly, but handle it gracefully
            setError(
              `Delegate mismatch detected after setup. The old delegate (${onChainDelegate?.slice(0, 8)}...${onChainDelegate?.slice(-6)}) is still registered. ` +
              `Please try the setup again - it will automatically remove the old delegate. ` +
              `If the issue persists, you can manually remove it on BaseScan: https://basescan.org/address/0x44914408af82bC9983bbb330e3578E1105e11d4e#writeProxyContract`
            );
            setIsProcessing(false);
            return;
          }
          
          // Delegate is set up correctly - check USDC approval
          if (!allowanceCheck.hasSufficient) {
            // USDC approval is missing - this shouldn't happen if we included it in the batch
            // But it's possible if user cancelled the approval part
            setError('USDC approval verification failed. Please try the setup again to approve USDC.');
            setIsProcessing(false);
            return;
          }
          
          // Both delegate and USDC approval are verified
          setDelegateStatus({
            isSetup: true,
            delegateAddress: status.delegateAddress || delegateAddress || null,
            usdcApproved: true,
          });
          setStep('complete');
          markOnboardingCompleteApi(userAddress); // Backend: record onboarding complete for new-device sync
          onSetupComplete();
        } else {
          // Delegate setup failed
          setError('Delegate setup verification failed. Please try again.');
          setIsProcessing(false);
        }
      } catch (err) {
        console.error('Error verifying setup:', err);
        // CRITICAL FIX: Don't mark as complete if verification throws an error!
        setError('Failed to verify setup. Please check your wallet and try again.');
        setIsProcessing(false);
      }
    } catch (err: unknown) {
      console.error('Batched setup error:', err);
      const code = isRecord(err) ? err.code : undefined;
      const message = err instanceof Error ? err.message : undefined;
      if (code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(message || 'Failed to complete setup');
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
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center max-w-lg mx-auto w-full">
      <div className="text-2xl sm:text-3xl font-bold text-[#CCFF00] mb-6 sm:mb-8">SETUP REQUIRED</div>
      
      {step === 'setup' && (
        <>
          <div className="text-white text-base sm:text-lg mb-4 leading-relaxed">
            Enable trading by authorizing a secure trading session and approving USDC spending.
          </div>
          <div className="text-white/60 text-sm sm:text-base mb-6 sm:mb-8 leading-relaxed">
            This is a one-time setup on Base network. Your funds remain in your wallet.
            {delegateStatus.delegateAddress && delegateStatus.delegateAddress.toLowerCase() !== delegateAddress?.toLowerCase() && (
              <div className="mt-3 p-3 bg-[#FFD60A]/10 border-2 border-[#FFD60A]/30 text-[#FFD60A] text-xs rounded-lg">
                Found an old trading session. Setup will replace it automatically.
              </div>
            )}
          </div>
          
          {/* Debug info */}
          <div className="text-white/40 text-xs mb-6 font-mono space-y-1">
            <div>Your wallet: {userAddress?.slice(0, 8)}...{userAddress?.slice(-6)}</div>
            <div>Delegate: {delegateAddress?.slice(0, 8)}...{delegateAddress?.slice(-6)}</div>
            <div>Network: Base (Chain ID: 8453)</div>
          </div>
          
          {/* Setup status message */}
          {setupStatus && (
            <div className="mb-4 p-3 bg-[#CCFF00]/10 border-2 border-[#CCFF00]/30 text-[#CCFF00] text-sm font-mono rounded-lg">
              {setupStatus}
            </div>
          )}

          {/* Progress bar - thick black border, lime fill */}
          {(isProcessing || isBatching) && (
            <div className="w-full mb-4 h-3 border-4 border-black bg-black rounded overflow-hidden">
              <div
                className="h-full bg-[#CCFF00] transition-all duration-300 ease-out"
                style={{
                  width: (() => {
                    const match = setupStatus?.match(/Step (\d)\/(\d)/);
                    if (match) {
                      const [, current, total] = match;
                      return `${(parseInt(current, 10) / parseInt(total, 10)) * 100}%`;
                    }
                    // No step in status (e.g. verifying) = full
                    return '100%';
                  })(),
                }}
              />
            </div>
          )}

          <button
            onClick={handleBatchedSetup}
            disabled={isProcessing || isBatching}
            className="w-full py-4 sm:py-5 text-lg sm:text-xl font-bold brutal-button disabled:opacity-50 bg-[#CCFF00] text-black min-h-[56px] touch-manipulation"
          >
            {isProcessing || isBatching 
              ? (setupStatus || 'ENABLING TRADING...')
              : 'ENABLE TRADING'
            }
          </button>
          
          {/* Helpful info about what will happen */}
          {!isProcessing && !isBatching && (
            <div className="mt-4 text-white/50 text-xs leading-relaxed">
              This will set up your secure trading session and approve USDC spending in a single transaction.
            </div>
          )}
        </>
      )}

      {/* NOTE: fund-delegate step removed - with Tachyon gas sponsorship, delegate doesn't need ETH */}

      {error && (
        <div className="mt-6 p-4 bg-red-500/20 border-2 border-red-500 text-red-400 text-sm sm:text-base rounded-lg max-w-md">
          <div className="whitespace-pre-wrap break-words">{error}</div>
          {error.includes('basescan.org') && (
            <a
              href="https://basescan.org/address/0x44914408af82bC9983bbb330e3578E1105e11d4e#writeProxyContract"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block px-4 py-2 bg-[#CCFF00] text-black font-bold brutal-button text-xs sm:text-sm hover:bg-[#B8E600] transition-colors"
            >
              OPEN BASESCAN CONTRACT PAGE →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
