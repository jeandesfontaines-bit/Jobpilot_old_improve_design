import React from 'react';
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink/90 border border-ink',
  accent: 'bg-accent text-white hover:bg-accent-hover border border-accent',
  secondary: 'bg-white text-ink hover:bg-canvas/60 border border-line shadow-raised',
  ghost: 'bg-transparent text-ink/70 hover:bg-black/5 hover:text-ink border border-transparent',
  danger: 'bg-white text-accent hover:bg-accent/5 border border-line',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-body gap-2',
  md: 'h-10 px-4 text-body gap-2',
  icon: 'size-10 p-0 shrink-0 gap-0 [&_svg]:shrink-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-control font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = 'Button';
