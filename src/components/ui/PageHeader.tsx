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
    return <Comp className="w-4 h-4 text-zinc-500 shrink-0" />;
  };

  return (
    <div
      className={`shrink-0 h-14 px-4 sm:px-6 bg-white border-b border-zinc-200/90 flex items-center justify-between gap-4 ${className}`}
    >
      {/* Titre à gauche */}
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && renderIcon(Icon)}
        <div className="min-w-0">
          <div className="text-sm font-bold text-zinc-900 tracking-tight truncate flex items-center gap-2">
            {title}
          </div>
          {description && (
            <p className="text-[11px] text-zinc-500 truncate leading-tight mt-0.5">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Compteurs au centre */}
      {counters && (
        <div className="hidden sm:flex items-center gap-2 min-w-0">
          {counters}
        </div>
      )}

      {/* Actions à droite */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
