import React from 'react';
interface ListRowProps {
  selected?: boolean;
  onClick?: () => void;
  id?: string;
  metaLeft?: React.ReactNode;
  metaRight?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  variant?: 'item' | 'message';
}
export const ListRow: React.FC<ListRowProps> = ({ selected = false, onClick, id, metaLeft, metaRight, title, subtitle, children, variant = 'item' }) => (
  <div id={id} onClick={onClick} className={`relative px-5 py-4 transition-colors ${onClick ? 'cursor-pointer' : 'cursor-default'} ${selected ? 'bg-zinc-100/90' : onClick ? 'bg-white hover:bg-zinc-50/70' : 'bg-white'}`}>
    {selected && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-zinc-900" />}
    {(metaLeft || metaRight) && <div className="flex items-center justify-between gap-3 mb-1.5 text-xs text-zinc-400"><span className="truncate">{metaLeft}</span><span className="shrink-0">{metaRight}</span></div>}
    {variant === 'message' ? <p className="text-sm font-normal leading-6 break-words whitespace-pre-wrap text-zinc-700">{title}</p> : <h3 className="text-[15px] font-semibold leading-snug line-clamp-2 mb-1.5 text-zinc-950">{title}</h3>}
    {subtitle && <p className="text-sm text-zinc-500 truncate">{subtitle}</p>}
    {children}
  </div>
);
