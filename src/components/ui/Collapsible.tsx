import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleProps {
  title: string;
  count?: number;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
  title,
  count,
  hint,
  defaultOpen = false,
  children,
  className = '',
}) => (
  <details open={defaultOpen} className={`group rounded-control border border-line bg-white ${className}`}>
    <summary className='flex min-h-12 cursor-pointer select-none list-none items-center justify-between gap-4 rounded-control px-4 py-3 transition-colors hover:bg-black/[0.02] [&::-webkit-details-marker]:hidden'>
      <span className='flex min-w-0 items-center gap-2 text-body font-semibold text-ink'>
        <span className='truncate'>{title}</span>
        {typeof count === 'number' && (
          <span className='shrink-0 rounded-full bg-black/5 px-2 text-caption font-medium text-muted'>{count}</span>
        )}
      </span>
      <span className='flex shrink-0 items-center gap-2 text-caption text-muted'>
        {hint && <span className='hidden sm:inline'>{hint}</span>}
        <ChevronDown className='size-4 transition-transform group-open:rotate-180' />
      </span>
    </summary>
    <div className='border-t border-line p-6'>{children}</div>
  </details>
);
