import React from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'icon';
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-900 font-semibold',
  secondary: 'bg-white text-zinc-800 hover:bg-zinc-50 border border-zinc-200 shadow-2xs font-medium',
  ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-transparent font-medium',
  danger: 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 font-medium',
};
const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  icon: 'h-10 w-10 p-0 shrink-0 gap-0 [&_svg]:shrink-0',
};
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', type = 'button', ...props }, ref) => <button ref={ref} type={type} className={`inline-flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...props} />
);
Button.displayName = 'Button';
