import React from 'react';

interface ListPanelProps {
  children: React.ReactNode;
  divided?: boolean;
}

export const ListPanel: React.FC<ListPanelProps> = ({ children, divided = true }) => (
  <div className={`flex-1 overflow-y-auto custom-scrollbar ${divided ? 'divide-y divide-zinc-100' : ''}`}>
    {children}
  </div>
);

interface ListGroupHeaderProps {
  title: string;
  count?: number;
  dotClassName?: string;
  countClassName?: string;
}

export const ListGroupHeader: React.FC<ListGroupHeaderProps> = ({
  title,
  count,
  dotClassName = 'bg-zinc-400',
  countClassName = 'bg-zinc-100 text-zinc-700',
}) => (
  <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-zinc-50 border-y border-zinc-100">
    <div className="flex items-center gap-2.5">
      <span className={`w-2.5 h-2.5 rounded-full ${dotClassName}`} />
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
    </div>
    {count !== undefined && (
      <span className={`min-w-[1.75rem] text-center text-xs font-semibold px-2 py-0.5 rounded-full ${countClassName}`}>
        {count}
      </span>
    )}
  </div>
);
