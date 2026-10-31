import React, { useEffect, useState } from 'react';
import type { AutosaveStatus } from '../../hooks/useAutosave';

interface SaveFeedbackProps {
  status: AutosaveStatus;
  savedAt?: string | number | null;
  error?: string | null;
  onRetry: () => void | Promise<void>;
}

export const SaveFeedback: React.FC<SaveFeedbackProps> = ({ status, savedAt, error, onRetry }) => {
  const [showSuccess, setShowSuccess] = useState(false);
  useEffect(() => {
    if (status !== 'saved' || savedAt == null) { setShowSuccess(false); return; }
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [status, savedAt]);
  if (status === 'error') return <span role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span>{error || 'Enregistrement impossible'}</span><button type="button" onClick={() => { void onRetry(); }} className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-zinc-900">Réessayer</button></span>;
  return <span role="status" aria-live="polite" className="text-xs text-zinc-500">{status === 'saving' || status === 'pending' ? 'Enregistrement…' : showSuccess ? 'Enregistré' : ''}</span>;
};
