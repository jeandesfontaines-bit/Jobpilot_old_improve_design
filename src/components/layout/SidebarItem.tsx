import React from 'react';

interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, count, active, collapsed, onClick }) => (
  <button
    type='button'
    onClick={onClick}
    title={label}
    aria-current={active ? 'page' : undefined}
    className={`flex h-10 w-full items-center gap-3 rounded-control text-body transition-colors ${
      collapsed ? 'justify-center' : 'px-3'
    } ${active ? 'bg-white/10 font-medium text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
  >
    <Icon className='size-4 shrink-0' />
    {!collapsed && <span className='flex-1 truncate text-left'>{label}</span>}
    {!collapsed && count != null && <span className='text-caption tabular-nums text-white/50'>{count}</span>}
  </button>
);
