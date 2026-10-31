import React from 'react';

export const inputClass =
  'w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900';

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, children, className = '' }) => (
  <div className={className}>
    <label className="text-sm font-medium text-zinc-800 block mb-2">{label}</label>
    {children}
    {hint && <p className="text-sm text-zinc-500 mt-1.5">{hint}</p>}
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
    <textarea ref={ref} className={`${inputClass} leading-7 ${className}`} {...props} />
  )
);
Textarea.displayName = 'Textarea';
