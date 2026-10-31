import React from 'react';
import { X } from 'lucide-react';

export interface ChipProps {
  label: string;
  onRemove?: () => void;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'accent';
  disabled?: boolean;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  onRemove,
  onClick,
  variant = 'default',
  disabled = false,
  className = '',
}) => {
  let variantStyles = 'border-zinc-200/80 bg-zinc-100 text-zinc-800';
  let removeStyles = 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60';

  if (variant === 'danger') {
    variantStyles = 'border-rose-200 bg-rose-50 text-rose-900';
    removeStyles = 'text-rose-700 hover:text-rose-950 hover:bg-rose-100';
  } else if (variant === 'accent') {
    variantStyles = 'border-red-200 bg-red-50 text-red-900';
    removeStyles = 'text-red-700 hover:text-red-950 hover:bg-red-100';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-xs font-semibold ${variantStyles} ${className}`}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="hover:underline truncate max-w-[200px]"
          title={label}
        >
          {label}
        </button>
      ) : (
        <span className="truncate max-w-[200px]">{label}</span>
      )}

      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Supprimer « ${label} »`}
          className={`rounded-full p-0.5 transition-colors disabled:opacity-50 ${removeStyles}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
};
