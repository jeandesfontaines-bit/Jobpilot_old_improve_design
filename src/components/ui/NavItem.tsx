import React from 'react';
import { Badge, BadgeTone } from './Badge';

interface NavItemProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  count?: number;
  badgeTone?: BadgeTone;
  iconClassName?: string;
  onClick: () => void;
}

export const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active = false, collapsed = false, count, badgeTone = 'neutral', iconClassName = 'text-zinc-500', onClick }) => (
  <button type="button" onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
    className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'font-semibold text-zinc-950 bg-zinc-100 border border-zinc-200/60 shadow-2xs' : 'font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 border border-transparent'}`}>
    <span className="flex items-center gap-3">
      <Icon strokeWidth={active ? 2.75 : 2} className={`w-5 h-5 shrink-0 ${iconClassName}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </span>
    {!collapsed && count !== undefined && count > 0 && <Badge tone={badgeTone}>{count}</Badge>}
  </button>
);
