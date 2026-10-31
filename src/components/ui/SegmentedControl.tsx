import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  const renderIcon = (iconItem?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!iconItem) return null;
    if (React.isValidElement(iconItem)) return iconItem;
    if (typeof iconItem === 'string' || typeof iconItem === 'number') return iconItem;
    const Comp = iconItem as React.ComponentType<{ className?: string }>;
    return <Comp className="w-4 h-4 shrink-0" />;
  };

  return (
    <div
      className={`inline-flex items-center p-1 bg-zinc-100 rounded-lg border border-zinc-200/80 gap-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3.5 py-1.5 rounded-md text-sm transition-all flex items-center gap-2 ${
              active
                ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900 font-medium'
            }`}
          >
            {opt.icon && renderIcon(opt.icon)}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
