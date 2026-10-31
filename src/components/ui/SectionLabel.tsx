import React from 'react';

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <p className={`text-xs font-bold uppercase tracking-wider text-zinc-400 ${className}`}>{children}</p>
);
