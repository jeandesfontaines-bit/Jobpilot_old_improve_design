import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type AlertTone = 'error' | 'success' | 'warning' | 'info';

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  error: { box: 'bg-rose-50 border-rose-200 text-rose-800', icon: 'text-rose-600' },
  success: { box: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: 'text-emerald-600' },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'text-amber-600' },
  info: { box: 'bg-zinc-50 border-zinc-200 text-zinc-700', icon: 'text-zinc-500' },
};

interface AlertProps {
  tone?: AlertTone;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ tone = 'info', children, action }) => {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  return (
    <div className={`p-4 rounded-xl border text-sm flex items-start justify-between gap-3 ${TONES[tone].box}`}>
      <span className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TONES[tone].icon}`} />
        <span>{children}</span>
      </span>
      {action && <span className="shrink-0 font-semibold underline">{action}</span>}
    </div>
  );
};
