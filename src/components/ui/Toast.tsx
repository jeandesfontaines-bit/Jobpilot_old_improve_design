import React from 'react';
import { X } from 'lucide-react';

export type ToastTone = 'success' | 'error';

interface ToastProps {
  tone?: ToastTone;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

const TONES: Record<ToastTone, string> = {
  success: 'bg-white border-zinc-300 text-zinc-900 shadow-lg',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
};

export const Toast: React.FC<ToastProps> = ({
  tone = 'success',
  children,
  actionLabel,
  onAction,
  onClose,
}) => (
  <div
    className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-md text-sm font-medium border ${TONES[tone]}`}
  >
    <span className="truncate">{children}</span>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="underline font-semibold shrink-0 hover:text-zinc-700 cursor-pointer"
      >
        {actionLabel}
      </button>
    )}
    {onClose && (
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="shrink-0 text-zinc-400 hover:text-zinc-600 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
