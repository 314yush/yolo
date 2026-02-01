'use client';

import React, { useEffect } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

function ToastItem({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, toast.duration || 5000); // Default 5 seconds

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onClose]);

  const bgColor = 
    toast.type === 'success' ? '#CCFF00' :
    toast.type === 'error' ? '#FF006E' :
    '#FFFFFF';

  const textColor = toast.type === 'success' ? '#000000' : '#FFFFFF';
  const borderColor = toast.type === 'success' ? '#000000' : '#000000';

  return (
    <div
      className="mb-3 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-slide-in"
      style={{ 
        backgroundColor: bgColor,
        borderColor: borderColor,
      }}
    >
      {/* Header Bar - Full width, prominent */}
      <div 
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{
          backgroundColor: toast.type === 'success' ? '#CCFF00' : toast.type === 'error' ? '#FF006E' : '#FFFFFF',
          borderBottom: '4px solid #000000',
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {toast.type === 'success' && (
            <div 
              className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border-2 border-black"
              style={{ backgroundColor: '#000000' }}
            >
              <span className="text-white text-sm sm:text-base font-black">✓</span>
            </div>
          )}
          {toast.type === 'error' && (
            <div 
              className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border-2 border-black"
              style={{ backgroundColor: '#000000' }}
            >
              <span className="text-white text-sm sm:text-base font-black">✕</span>
            </div>
          )}
          {toast.type === 'info' && (
            <div 
              className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border-2 border-black"
              style={{ backgroundColor: '#000000' }}
            >
              <span className="text-white text-sm sm:text-base font-black">i</span>
            </div>
          )}
          <p 
            className="font-black text-sm sm:text-base break-words font-mono uppercase"
            style={{ color: textColor }}
          >
            {toast.message}
          </p>
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center border-2 border-black hover:opacity-80 transition-opacity touch-manipulation font-black"
          style={{ 
            backgroundColor: '#000000',
            color: '#FFFFFF',
            minWidth: '32px',
            minHeight: '32px',
          }}
          aria-label="Close notification"
        >
          <span className="text-lg sm:text-xl leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 pointer-events-none"
      style={{
        maxWidth: 'calc(100vw - 2rem)',
        width: '100%',
      }}
    >
      <div 
        className="pointer-events-auto"
        style={{
          maxWidth: '100%',
          width: '100%',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}
