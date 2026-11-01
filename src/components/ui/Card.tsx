import React, { createContext, useContext } from 'react';

export const CardStyleContext = createContext<'card' | 'section'>('card');

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => {
  const style = useContext(CardStyleContext);
  return <div className={`${style === 'section' ? 'space-y-6' : 'bg-white border border-line rounded-surface p-6 space-y-6'} ${className}`} {...props} />;
};

interface CardHeaderProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  right?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, icon, right }) => {
  const style = useContext(CardStyleContext);
  if (style === 'section') {
    return (
      <div className='flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4'>
        <h3 className='flex items-center gap-3 text-body font-semibold text-ink'>
          {icon && <span className='text-muted [&>svg]:size-4'>{renderIcon(icon)}</span>}
          {title}
        </h3>
        {right}
      </div>
    );
  }

  return (
    <div className='flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4'>
      <h3 className='flex items-center gap-3 text-body font-semibold text-ink'>
        {icon && <span className='text-muted [&>svg]:size-4'>{renderIcon(icon)}</span>}
        {title}
      </h3>
      {right}
    </div>
  );
};

function renderIcon(iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) {
  if (!iconItem) return null;
  if (React.isValidElement(iconItem)) return iconItem;
  if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
  const Comp = iconItem as React.ComponentType<{ className?: string }>;
  return <Comp className='size-4' />;
}
