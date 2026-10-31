import React, { createContext, useContext } from 'react';

export const CardStyleContext = createContext<'card' | 'section'>('card');

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => {
  const style = useContext(CardStyleContext);
  return <div className={`${style === 'section' ? 'space-y-4' : 'bg-white border border-zinc-200/80 rounded-xl p-6 space-y-6'} ${className}`} {...props} />;
};

interface CardHeaderProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  right?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, icon, right }) => {
  const style = useContext(CardStyleContext);
  if (style === 'section') return right ? <div className="flex flex-wrap items-center justify-end gap-2">{right}</div> : null;

  const renderIcon = (iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className="w-5 h-5" />;
  };

  return <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-100 flex-wrap">
    <div className="flex items-center gap-3">
      {icon && <span className="text-zinc-500 [&>svg]:w-5 [&>svg]:h-5">{renderIcon(icon)}</span>}
      <h3 className="font-semibold text-zinc-950 text-[15px]">{title}</h3>
    </div>
    {right}
  </div>;
};
