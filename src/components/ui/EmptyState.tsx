import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  title?: string;
  description?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  } | React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: IconOrNode,
  title,
  description,
  message,
  action,
  className = '',
}) => {
  const text = message || description || '';

  const renderIcon = (
    iconItem: React.ComponentType<{ className?: string }> | React.ReactNode,
    defaultClass: string
  ) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className={defaultClass} />;
  };

  return (
    <div
      className={`p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3 ${className}`}
    >
      {IconOrNode && (
        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
          {renderIcon(IconOrNode, 'w-5 h-5')}
        </div>
      )}

      <div className="space-y-1 max-w-sm">
        {title && (
          <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
            {title}
          </h3>
        )}
        {text && (
          <p className="text-sm text-zinc-500 leading-normal">
            {text}
          </p>
        )}
      </div>

      {action && (
        <div className="pt-2">
          {React.isValidElement(action) ? (
            action
          ) : (
            typeof action === 'object' &&
            'label' in action && (
              <Button
                size="sm"
                onClick={action.onClick}
                className="inline-flex items-center gap-1.5"
              >
                {action.icon && renderIcon(action.icon, 'w-3.5 h-3.5')}
                <span>{action.label}</span>
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
};
