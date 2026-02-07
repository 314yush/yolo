'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { redeemAccessCode, getErrorMessage, checkBackendConnection } from '@/lib/access';

interface AccessCodeGateProps {
  walletAddress: string;
  onAccessGranted: () => void;
}

export function AccessCodeGate({ walletAddress, onAccessGranted }: AccessCodeGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendConnection().then((result) => {
      setBackendReachable(result.ok);
      if (!result.ok && result.error) {
        console.error('[AccessCodeGate] Backend unreachable:', result.error, 'URL:', result.url);
      }
    });
  }, []);

  // Format code as user types (auto-add hyphens for YOLO-WORD-WORD format)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // Auto-add hyphen after YOLO if user types more
    if (value.length === 4 && !value.includes('-')) {
      value = value + '-';
    }
    
    // Auto-add hyphen after first word (after YOLO-)
    const parts = value.split('-');
    if (parts.length === 2 && parts[1].length > 0 && !parts[1].endsWith('-')) {
      // Allow typing, but suggest adding hyphen for second word
      // Don't force it, let user type naturally
    }
    
    // Limit to 30 chars (YOLO-WORD-WORD format)
    if (value.length <= 30) {
      setCode(value);
      setError(null);
    }
  };

  // Handle paste - clean up the input
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().trim();
    // Clean and format (allow hyphens)
    const cleaned = pasted.replace(/[^A-Z0-9-]/g, '').slice(0, 30);
    setCode(cleaned);
    setError(null);
  };

  const handleSubmit = useCallback(async () => {
    // Validate format: YOLO-WORD-WORD (at least 13 chars, has YOLO- prefix)
    if (!code.trim() || code.length < 13 || !code.startsWith('YOLO-')) {
      setError('Please enter a complete access code');
      return;
    }
    
    // Check it has the right format (YOLO-WORD-WORD)
    const parts = code.split('-');
    if (parts.length < 3) {
      setError('Invalid code format. Expected: YOLO-WORD-WORD');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await redeemAccessCode(code, walletAddress);
      
      if (result.success) {
        setIsSuccess(true);
        // Short delay to show success state
        setTimeout(() => {
          onAccessGranted();
        }, 1000);
      } else {
        setError(getErrorMessage(result.error));
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [code, walletAddress, onAccessGranted]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && code.length >= 13 && code.startsWith('YOLO-')) {
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4">
      {/* Card with neobrutalism styling */}
      <div className="bg-black border-2 border-white font-mono">
        {/* Header */}
        <div className="bg-[#CCFF00] px-6 py-5 border-b-8 border-black">
          <h2 className="text-black font-black text-2xl uppercase tracking-tighter text-center">
            Access Required
          </h2>
        </div>

        {/* Body */}
        <div className="p-8 space-y-8">
          {isSuccess ? (
            // Success state
            <div className="text-center py-12">
              <div className="text-8xl mb-8 text-[#CCFF00] font-black leading-none">✓</div>
              <p className="text-[#CCFF00] font-black text-4xl uppercase tracking-tighter">
                Access Granted
              </p>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="text-center space-y-2">
                <p className="text-white font-bold text-lg">
                  Enter your access code to
                </p>
                <p className="text-white font-bold text-lg">
                  continue
                </p>
              </div>

              {/* Code Input */}
              <div className="space-y-3">
                <input
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  placeholder="YOLO-MOON-APE"
                  disabled={isLoading}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={`
                    w-full px-6 py-5 text-center text-2xl font-mono font-bold uppercase tracking-wider
                    bg-[#111827] border-4 transition-all
                    placeholder:text-white/25 placeholder:tracking-wider
                    focus:outline-none
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${error 
                      ? 'border-[#FF006E] text-[#FF006E]' 
                      : 'border-white text-[#CCFF00] focus:border-[#CCFF00]'
                    }
                  `}
                />

                {/* Error message */}
                {error && (
                  <p className="text-[#FF006E] text-base text-center font-bold">
                    {error}
                  </p>
                )}
              </div>

              {/* Submit Button - Primary CTA */}
              <button
                onClick={handleSubmit}
                disabled={isLoading || code.length < 13 || !code.startsWith('YOLO-')}
                className={`
                  w-full py-6 px-6 font-black text-3xl uppercase tracking-tighter
                  border-8 transition-opacity duration-200
                  focus:outline-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isLoading 
                    ? 'bg-[#4B5563] text-white border-white cursor-wait' 
                    : 'bg-[#CCFF00] text-black border-black hover:opacity-90 active:opacity-80'
                  }
                `}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-3">
                    <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    CHECKING...
                  </span>
                ) : (
                  'ENTER'
                )}
              </button>

              {/* Backend status - only show when we know it's unreachable */}
              {backendReachable === false && (
                <p className="text-[#FF006E] text-xs text-center font-bold">
                  Backend unreachable. Check browser console for URL and CORS.
                </p>
              )}

              {/* Help text */}
              <p className="text-white/70 text-sm text-center font-bold">
                dm{' '}
                <a 
                  href="https://twitter.com/314yush" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[#CCFF00] hover:text-[#CCFF00]/80 transition-colors"
                >
                  @314yush
                </a>
                {' '}on X for early access
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
