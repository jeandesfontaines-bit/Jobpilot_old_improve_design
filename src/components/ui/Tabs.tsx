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

export const Tabs: React.FC<TabsProps> = ({ items, activeId, onChange, className = '' }) => (
  <div role='tablist' aria-label='Onglets' className={`flex gap-2 overflow-x-auto border-b border-line ${className}`}>
    {items.map((item) => {
      const active = item.id === activeId;
      const count = item.count ?? item.badge;
      return (
        <button
          key={item.id}
          type='button'
          role='tab'
          aria-selected={active}
          onClick={() => onChange(item.id)}
          className={`-mb-px flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-body font-medium transition-colors ${
            active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {item.label}
          {typeof count === 'number' && count > 0 && (
            <span className={`rounded-full px-2 text-caption font-medium ${active ? 'bg-accent/10 text-accent' : 'bg-black/5 text-muted'}`}>
              {count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
