import React from 'react';
import { RefreshCw } from 'lucide-react';

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex-1 flex items-center justify-center p-10 text-zinc-400">
    <div className="text-center">
      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-700" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  </div>
);

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon }) => {
  const renderIcon = (iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className="w-8 h-8" />;
  };

  return (
    <div className="p-10 text-center space-y-2">
      {icon && <div className="mx-auto w-fit text-zinc-300 [&>svg]:w-8 [&>svg]:h-8">{renderIcon(icon)}</div>}
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      {description && <p className="text-sm text-zinc-400">{description}</p>}
    </div>
  );
};
