import React from 'react';

interface SliderFieldProps {
  label: string;
  value: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}

export const SliderField: React.FC<SliderFieldProps> = ({ label, value, max, unit = 'pts', onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-2.5">
      <label className="text-sm font-medium text-zinc-800">{label}</label>
      <span className="text-sm font-semibold text-zinc-900 font-mono">
        {value} {unit}
      </span>
    </div>
    <input
      type="range"
      min="0"
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-zinc-900"
    />
  </div>
);
