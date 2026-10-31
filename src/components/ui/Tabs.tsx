import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: number;
  count?: number;
}

interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      aria-label="Onglets"
      className={`flex gap-1 overflow-x-auto border-b border-zinc-200/90 ${className}`}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const count = item.count ?? item.badge;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              active
                ? 'border-red-600 text-zinc-950'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {item.label}
            {typeof count === 'number' && count > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  active
                    ? 'bg-red-50 text-red-700'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
