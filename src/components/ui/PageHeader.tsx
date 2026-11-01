import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode | string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  counters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  counters,
  actions,
  className = '',
}) => {
  const renderIcon = (iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className='size-4 shrink-0 text-muted' />;
  };

  return (
    <div
      className={`flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-white px-4 sm:px-6 ${className}`}
    >
      <div className='flex min-w-0 items-center gap-3'>
        {Icon && renderIcon(Icon)}
        <div className='min-w-0'>
          <div className='flex items-center gap-2 truncate text-body font-semibold text-ink'>{title}</div>
          {description && <p className='truncate text-caption text-muted'>{description}</p>}
        </div>
      </div>

      {counters && <div className='hidden min-w-0 items-center gap-2 sm:flex'>{counters}</div>}

      {actions && <div className='flex shrink-0 items-center gap-2'>{actions}</div>}
    </div>
  );
};
