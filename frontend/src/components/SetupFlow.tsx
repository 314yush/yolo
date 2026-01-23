'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradeStore } from '@/store/tradeStore';
import { useDelegateWallet } from '@/hooks/useDelegateWallet';
import { useAvantisAPI } from '@/hooks/useAvantisAPI';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CONTRACTS, CHAIN_CONFIG } from '@/lib/constants';

interface SetupFlowProps {
  onSetupComplete: () => void;
}

type SetupStep = 'checking' | 'delegate' | 'approve' | 'fund-delegate' | 'complete';

// Minimum ETH required for delegate wallet (covers ~20 trades worth of gas)
const MIN_DELEGATE_ETH = 0.001; // About $3-4 worth, enough for many trades
const RECOMMENDED_DELEGATE_ETH = 0.002; // Recommended amount

// Base chain ID in hex
const BASE_CHAIN_ID_HEX = '0x2105'; // 8453 in hex

export function SetupFlow({ onSetupComplete }: SetupFlowProps) {
  const { user, ready: privyReady } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { setDelegateStatus } = useTradeStore();
  const { ensureDelegateWallet, delegateAddress } = useDelegateWallet();
  const { buildDelegateSetupTx, checkDelegateStatus, buildUsdcApprovalTx, checkUsdcAllowance } = useAvantisAPI();

  const [step, setStep] = useState<SetupStep>('checking');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delegateBalance, setDelegateBalance] = useState<string>('0');
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

  // Check delegate wallet ETH balance
  const checkDelegateBalance = useCallback(async (): Promise<number> => {
    if (!delegateAddress) return 0;
    
    try {
      const userWallet = getUserWallet();
      if (!userWallet) return 0;
      
      const provider = await userWallet.getEthereumProvider();
      const balanceHex = await provider.request({
        method: 'eth_getBalance',
        params: [delegateAddress, 'latest'],
      });
      
      const balanceWei = BigInt(balanceHex);
      const balanceEth = Number(balanceWei) / 1e18;
      setDelegateBalance(balanceEth.toFixed(6));
      return balanceEth;
    } catch (err) {
      console.error('Error checking delegate balance:', err);
      return 0;
    }
  }, [delegateAddress, getUserWallet]);

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

  // Check current setup status
  useEffect(() => {
    async function checkStatus() {
      // Prevent multiple simultaneous checks
      if (!userAddress || !privyReady || !walletsReady || isCheckingStatus) return;
      
      // If we've already checked and are in an error state, don't re-check automatically
      // Only re-check if the user address changes (new login)
      if (hasCheckedStatus && error && step === 'delegate') {
        return;
      }

      setIsCheckingStatus(true);
      setStep('checking');
      setError(null);
      
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
          // Don't block - show delegate setup but with error message
          setStep('delegate');
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
          setStep('delegate');
          setIsCheckingStatus(false);
          return;
        }
        
        console.log('Delegation already set up with:', wallet.address);
        
        // Step 3: Run USDC allowance check and balance check in parallel
        // Both are independent checks that can run simultaneously
        const [allowanceCheck, balance] = await Promise.all([
          checkUsdcAllowance(userAddress).catch((err) => {
            console.warn('USDC allowance check failed:', err);
            return { hasSufficient: false, allowance: 0 };
          }),
          checkDelegateBalance().catch((err) => {
            console.warn('Balance check failed:', err);
            return 0;
          }),
        ]);
        
        console.log('USDC allowance check:', allowanceCheck);
        console.log('Delegate ETH balance:', balance);
        
        if (!allowanceCheck.hasSufficient) {
          // Need to approve USDC for the Trading contract
          console.log('USDC allowance insufficient, need to approve');
          setHasCheckedStatus(true); // Mark as checked
          setStep('approve');
          setIsCheckingStatus(false);
          return;
        }
        
        if (balance < MIN_DELEGATE_ETH) {
          // Need to fund the delegate wallet
          console.log('Delegate needs ETH for gas');
          setHasCheckedStatus(true); // Mark as checked
          setStep('fund-delegate');
          setIsCheckingStatus(false);
          return;
        }
        
        setDelegateStatus({
          isSetup: true,
          delegateAddress: wallet.address,
          usdcApproved: true,
        });
        setHasCheckedStatus(true); // Mark as checked so we don't re-check
        setStep('complete');
        setIsCheckingStatus(false);
        onSetupComplete();
      } else {
        // Need to set up delegation
        setHasCheckedStatus(true); // Mark as checked
        setStep('delegate');
      }
      } catch (err) {
        console.error('Error checking status:', err);
        setHasCheckedStatus(true);
        setError('Failed to check setup status. Please refresh the page.');
        setStep('delegate');
      } finally {
        setIsCheckingStatus(false);
      }
    }

    checkStatus();
    // Only re-run when user address or ready states change, not when callback functions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, privyReady, walletsReady]);

  // Set up delegation
  const handleSetupDelegate = useCallback(async () => {
    if (!userAddress || !delegateAddress) {
      setError('Missing wallet addresses');
      return;
    }
    
    setIsProcessing(true);
    setError(null);

    try {
      // Get the user's wallet (embedded or external)
      const userWallet = getUserWallet();
      
      if (!userWallet) {
        console.error('No wallet found. Available wallets:', wallets);
        throw new Error(`No wallet found. Please ensure you're logged in with a wallet. (Found ${wallets?.length || 0} wallets)`);
      }

      console.log('Using wallet:', userWallet.address, 'type:', userWallet.walletClientType);

      // Get provider
      const provider = await userWallet.getEthereumProvider();
      
      // Switch to Base network first
      console.log('Switching to Base network...');
      await switchToBase(provider);
      console.log('Switched to Base network');

      // Build the delegation tx
      const unsignedTx = await buildDelegateSetupTx(userAddress, delegateAddress);
      if (!unsignedTx) {
        throw new Error('Failed to build delegation transaction');
      }

      console.log('Unsigned tx:', unsignedTx);

      // Send transaction on Base
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: unsignedTx.value,
        }],
      });

      console.log('Delegation tx sent:', txHash);
      
      // Move to approval step
      setStep('approve');
    } catch (err: any) {
      console.error('Delegation setup error:', err);
      // Check if user rejected
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to set up delegation');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userAddress, delegateAddress, wallets, getUserWallet, buildDelegateSetupTx, switchToBase]);

  // Approve USDC spending
  const handleApproveUSDC = useCallback(async () => {
    if (!userAddress) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      const userWallet = getUserWallet();
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      const provider = await userWallet.getEthereumProvider();
      
      // Switch to Base network first
      await switchToBase(provider);
      
      // Build the USDC approval tx via backend
      // This approves the correct Trading Storage contract
      const unsignedTx = await buildUsdcApprovalTx(userAddress);
      if (!unsignedTx) {
        throw new Error('Failed to build USDC approval transaction');
      }

      console.log('USDC approval tx:', unsignedTx);

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: unsignedTx.to,
          data: unsignedTx.data,
          value: unsignedTx.value,
        }],
      });

      console.log('Approval tx sent:', txHash);
      
      // Now check if delegate needs ETH
      const balance = await checkDelegateBalance();
      if (balance < MIN_DELEGATE_ETH) {
        setStep('fund-delegate');
      } else {
        // Update status and complete
        setDelegateStatus({
          isSetup: true,
          delegateAddress: delegateAddress,
          usdcApproved: true,
        });
        setStep('complete');
        onSetupComplete();
      }
    } catch (err: any) {
      console.error('USDC approval error:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to approve USDC');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userAddress, getUserWallet, delegateAddress, setDelegateStatus, onSetupComplete, switchToBase, buildUsdcApprovalTx, checkDelegateBalance]);

  // Fund delegate wallet with ETH
  const handleFundDelegate = useCallback(async () => {
    if (!userAddress || !delegateAddress) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      const userWallet = getUserWallet();
      if (!userWallet) {
        throw new Error('No wallet found');
      }

      const provider = await userWallet.getEthereumProvider();
      
      // Switch to Base network first
      await switchToBase(provider);
      
      // Send ETH to delegate wallet
      // Convert to wei (0.002 ETH = 2000000000000000 wei)
      const amountWei = BigInt(Math.floor(RECOMMENDED_DELEGATE_ETH * 1e18));
      const amountHex = '0x' + amountWei.toString(16);
      
      console.log(`Funding delegate with ${RECOMMENDED_DELEGATE_ETH} ETH (${amountHex} wei)`);
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: delegateAddress,
          value: amountHex,
        }],
      });

      console.log('Funding tx sent:', txHash);
      
      // Wait a bit for tx to be mined, then check balance
      await new Promise(resolve => setTimeout(resolve, 3000));
      const newBalance = await checkDelegateBalance();
      console.log('New delegate balance:', newBalance);
      
      if (newBalance >= MIN_DELEGATE_ETH) {
        // Update status and complete
        setDelegateStatus({
          isSetup: true,
          delegateAddress: delegateAddress,
          usdcApproved: true,
        });
        setStep('complete');
        onSetupComplete();
      } else {
        // Balance still low, might need to wait for tx confirmation
        setError('Transaction sent. Please wait for confirmation and refresh if needed.');
      }
    } catch (err: any) {
      console.error('Fund delegate error:', err);
      if (err.code === 4001) {
        setError('Transaction rejected by user');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fund delegate wallet');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [userAddress, delegateAddress, getUserWallet, switchToBase, checkDelegateBalance, setDelegateStatus, onSetupComplete]);

  // Show loading while Privy/wallets are initializing
  if (!privyReady || !walletsReady) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="text-2xl font-bold text-white mb-4">INITIALIZING...</div>
        <div className="w-8 h-8 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render based on step
  if (step === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="text-2xl font-bold text-white mb-4">CHECKING SETUP...</div>
        <div className="w-8 h-8 border-4 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
      <div className="text-3xl font-bold text-[#CCFF00] mb-6">SETUP REQUIRED</div>
      
      {step === 'delegate' && (
        <>
          <div className="text-white mb-4">
            To trade instantly, you need to authorize a delegate wallet to execute trades on your behalf.
          </div>
          <div className="text-white/50 text-sm mb-8">
            This is a one-time setup on Base network. Your funds remain in your wallet.
          </div>
          
          {/* Debug info */}
          <div className="text-white/30 text-xs mb-4">
            Your wallet: {userAddress?.slice(0, 8)}...{userAddress?.slice(-6)}<br/>
            Delegate: {delegateAddress?.slice(0, 8)}...{delegateAddress?.slice(-6)}<br/>
            Network: Base (Chain ID: 8453)
          </div>
          
          <button
            onClick={handleSetupDelegate}
            disabled={isProcessing}
            className="w-full py-4 text-xl font-bold brutal-button disabled:opacity-50"
            style={{ backgroundColor: '#CCFF00', color: '#000' }}
          >
            {isProcessing ? 'SWITCHING TO BASE...' : 'SETUP DELEGATION'}
          </button>
        </>
      )}

      {step === 'approve' && (
        <>
          <div className="text-white mb-4">
            Step 2: Approve USDC spending to open trades.
          </div>
          <div className="text-white/50 text-sm mb-8">
            This allows the trading contract to use your USDC for positions.
          </div>
          
          <button
            onClick={handleApproveUSDC}
            disabled={isProcessing}
            className="w-full py-4 text-xl font-bold brutal-button disabled:opacity-50"
            style={{ backgroundColor: '#CCFF00', color: '#000' }}
          >
            {isProcessing ? 'APPROVING...' : 'APPROVE USDC'}
          </button>
        </>
      )}

      {step === 'fund-delegate' && (
        <>
          <div className="text-white mb-4">
            Final Step: Fund your delegate wallet with ETH for gas.
          </div>
          <div className="text-white/50 text-sm mb-4">
            Your delegate wallet needs a small amount of ETH to pay for transaction fees when executing trades.
          </div>
          
          {/* Delegate wallet info */}
          <div className="w-full p-4 bg-black/40 border-2 border-white/20 mb-4">
            <div className="text-white/50 text-xs mb-1">DELEGATE WALLET</div>
            <div className="text-white text-sm font-mono break-all">{delegateAddress}</div>
            <div className="text-white/50 text-xs mt-2">CURRENT BALANCE</div>
            <div className="text-[#CCFF00] text-lg font-bold">{delegateBalance} ETH</div>
          </div>
          
          <div className="text-white/50 text-sm mb-8">
            Recommended: {RECOMMENDED_DELEGATE_ETH} ETH (~$6-7, enough for ~50+ trades)
          </div>
          
          <button
            onClick={handleFundDelegate}
            disabled={isProcessing}
            className="w-full py-4 text-xl font-bold brutal-button disabled:opacity-50"
            style={{ backgroundColor: '#CCFF00', color: '#000' }}
          >
            {isProcessing ? 'SENDING ETH...' : `SEND ${RECOMMENDED_DELEGATE_ETH} ETH`}
          </button>
          
          <button
            onClick={async () => {
              const balance = await checkDelegateBalance();
              if (balance >= MIN_DELEGATE_ETH) {
                setDelegateStatus({
                  isSetup: true,
                  delegateAddress: delegateAddress,
                  usdcApproved: true,
                });
                setStep('complete');
                onSetupComplete();
              }
            }}
            className="w-full mt-4 py-2 text-sm text-white/50 hover:text-white"
          >
            Already funded? Click to check balance
          </button>
        </>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-500/20 border-2 border-red-500 text-red-500 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
