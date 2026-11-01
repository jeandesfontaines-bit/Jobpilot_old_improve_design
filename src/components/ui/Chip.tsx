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

const VARIANTS = {
  default: { box: 'bg-black/5 text-ink', remove: 'text-muted hover:bg-black/10 hover:text-ink' },
  danger: { box: 'bg-rose-50 text-rose-900', remove: 'text-rose-700 hover:bg-rose-100 hover:text-rose-950' },
  accent: { box: 'bg-accent/10 text-accent', remove: 'text-accent hover:bg-accent/10' },
} as const;

export const Chip: React.FC<ChipProps> = ({
  label,
  onRemove,
  onClick,
  variant = 'default',
  disabled = false,
  className = '',
}) => {
  const styles = VARIANTS[variant];

  return (
    <span className={`inline-flex h-8 items-center gap-1 rounded-full pl-3 pr-1 text-caption font-medium ${styles.box} ${className}`}>
      {onClick ? (
        <button type='button' onClick={onClick} className='max-w-[200px] truncate hover:underline' title={label}>
          {label}
        </button>
      ) : (
        <span className='max-w-[200px] truncate'>{label}</span>
      )}

      {onRemove && (
        <button
          type='button'
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Supprimer « ${label} »`}
          className={`grid size-6 place-items-center rounded-full transition-colors disabled:opacity-50 ${styles.remove}`}
        >
          <X className='size-3.5' />
        </button>
      )}
    </span>
  );
};
