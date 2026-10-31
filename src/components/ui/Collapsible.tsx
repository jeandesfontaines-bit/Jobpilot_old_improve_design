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
}) => {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-xl border border-zinc-200/90 bg-white shadow-2xs transition-all ${className}`}
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden hover:bg-zinc-50/70 transition-colors rounded-xl">
        <span className="flex items-center gap-2 text-sm font-bold text-zinc-900 min-w-0">
          <span className="truncate">{title}</span>
          {typeof count === 'number' && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 shrink-0">
              {count}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-zinc-400 shrink-0">
          {hint && <span className="hidden sm:inline">{hint}</span>}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 text-zinc-500" />
        </span>
      </summary>
      <div className="border-t border-zinc-100 p-4">{children}</div>
    </details>
  );
};
