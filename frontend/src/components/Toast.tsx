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
    'bg-white/20';

  const textColor = toast.type === 'success' ? '#000' : '#FFF';

  return (
    <div
      className="mb-3 px-6 py-4 rounded-lg border-4 border-black shadow-lg animate-slide-in"
      style={{ 
        backgroundColor: bgColor,
        color: textColor,
        boxShadow: '4px 4px 0px 0px rgba(0, 0, 0, 1)',
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {toast.type === 'success' && <span className="text-2xl">✅</span>}
          {toast.type === 'error' && <span className="text-2xl">❌</span>}
          {toast.type === 'info' && <span className="text-2xl">ℹ️</span>}
          <p className="font-bold text-lg">{toast.message}</p>
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="ml-4 text-2xl font-bold hover:opacity-70 transition-opacity leading-none"
          aria-label="Close"
          style={{ color: textColor }}
        >
          ×
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
    <div className="fixed top-4 right-4 z-50 max-w-md w-full pointer-events-none">
      <div className="pointer-events-auto">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}
