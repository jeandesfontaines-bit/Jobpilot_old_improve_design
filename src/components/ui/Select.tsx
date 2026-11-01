import React from 'react';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...props }, ref) => (
    <select
      ref={ref}
      className={`w-full min-h-10 cursor-pointer rounded-control border border-line bg-white px-3 py-2 text-body font-medium text-ink shadow-raised transition-colors hover:bg-canvas/60 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ${className}`}
      {...props}
    />
  )
);
Select.displayName = 'Select';
