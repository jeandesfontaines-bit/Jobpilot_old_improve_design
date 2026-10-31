import React from 'react';

export interface StatusOption<T extends string> {
  value: T;
  label?: string;
  activeClassName: string;
}

interface StatusPickerProps<T extends string> {
  options: StatusOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function StatusPicker<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: StatusPickerProps<T>) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
              active
                ? opt.activeClassName
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            {opt.label ?? opt.value}
          </button>
        );
      })}
    </div>
  );
}
