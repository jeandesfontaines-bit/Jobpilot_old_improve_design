import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export type AlertTone = 'error' | 'success' | 'warning' | 'info';

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  error: { box: 'bg-rose-50 text-rose-900', icon: 'text-rose-600' },
  success: { box: 'bg-emerald-50 text-emerald-900', icon: 'text-emerald-600' },
  warning: { box: 'bg-amber-50 text-amber-900', icon: 'text-amber-600' },
  info: { box: 'bg-black/5 text-ink', icon: 'text-muted' },
};

interface AlertProps {
  tone?: AlertTone;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ tone = 'info', children, action }) => {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  return (
    <div className={`flex items-start justify-between gap-4 rounded-control p-4 text-body ${TONES[tone].box}`}>
      <span className='flex items-start gap-3'>
        <Icon className={`mt-0.5 size-4 shrink-0 ${TONES[tone].icon}`} />
        <span className='min-w-0'>{children}</span>
      </span>
      {action && <span className='shrink-0 font-medium underline'>{action}</span>}
    </div>
  );
};
