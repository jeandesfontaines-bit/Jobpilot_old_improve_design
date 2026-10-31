import React from 'react';

export type BadgeTone = 'neutral' | 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  sky: 'bg-sky-100 text-sky-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', ...props }) => (
  <span
    className={`inline-flex items-center justify-center min-w-[1.75rem] px-2.5 py-0.5 rounded-full text-xs font-semibold ${TONES[tone]} ${className}`}
    {...props}
  />
);
