import React from 'react';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...props }, ref) => (
    <select
      ref={ref}
      className={`cursor-pointer bg-white text-zinc-900 hover:bg-zinc-50 border border-zinc-300 rounded-lg px-4 py-2 text-sm font-medium shadow-2xs focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-all ${className}`}
      {...props}
    />
  )
);
Select.displayName = 'Select';
