import React from 'react';

interface ProgressBarProps {
  percent?: number;
  indeterminate?: boolean;
  complete?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent = 0,
  indeterminate = false,
  complete = false,
}) => (
  <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
    {indeterminate ? (
      <div className="w-full h-full bg-zinc-900 animate-indeterminate rounded-full" />
    ) : (
      <div
        className={`h-full ${complete ? 'bg-emerald-500' : 'bg-zinc-900'}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    )}
  </div>
);
