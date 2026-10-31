import React from 'react';

interface InfoTileProps {
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  children: React.ReactNode;
  strong?: boolean;
}

export const InfoTile: React.FC<InfoTileProps> = ({ icon, children, strong = false }) => {
  const renderIcon = (iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className="w-5 h-5" />;
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-200/60 text-sm">
      {icon && <span className="text-zinc-400 shrink-0 [&>svg]:w-5 [&>svg]:h-5">{renderIcon(icon)}</span>}
      <span className={`truncate ${strong ? 'text-zinc-900 font-semibold' : 'text-zinc-700 font-medium'}`}>
        {children}
      </span>
    </div>
  );
};

export const TileGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{children}</div>
);

export const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-800 text-sm font-medium border border-zinc-200">
    {children}
  </span>
);
