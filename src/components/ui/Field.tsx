import React from 'react';

export const inputClass =
  'w-full min-h-10 bg-white border border-line rounded-control px-3 py-2 text-body text-ink placeholder:text-muted focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink';

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, children, className = '' }) => (
  <div className={className}>
    <label className='mb-2 block text-body font-medium text-ink'>{label}</label>
    {children}
    {hint && <p className='mt-2 text-caption text-muted'>{hint}</p>}
  </div>
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${inputClass} ${className}`} {...props} />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`${inputClass} leading-6 ${className}`} {...props} />
  )
);
Textarea.displayName = 'Textarea';
