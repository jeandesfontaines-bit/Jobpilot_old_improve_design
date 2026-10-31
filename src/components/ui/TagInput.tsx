import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from './Field';
import { Button } from './Button';

export type TagTone = 'indigo' | 'violet' | 'emerald' | 'rose';

const TONES: Record<TagTone, string> = {
  indigo: 'bg-indigo-50 border-indigo-200/60 text-indigo-700',
  violet: 'bg-violet-50 border-violet-200/60 text-violet-700',
  emerald: 'bg-emerald-50 border-emerald-200/60 text-emerald-700',
  rose: 'bg-rose-50 border-rose-200/60 text-rose-700',
};

interface TagInputProps {
  label?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  tone?: TagTone;
  transform?: (value: string) => string;
}

export const TagInput: React.FC<TagInputProps> = ({
  label,
  values,
  onChange,
  placeholder,
  tone = 'indigo',
  transform = (value) => value.trim(),
}) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const next = transform(draft);
    if (!next) return;
    onChange([...values, next]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium text-zinc-800 block">{label}</label>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value, idx) => (
            <span
              key={`${value}-${idx}`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${TONES[tone]}`}
            >
              {value}
              <button
                type="button"
                aria-label={`Retirer ${value}`}
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
              >
                <X className="w-3.5 h-3.5 hover:text-rose-600 cursor-pointer" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" onClick={add}>
          Ajouter
        </Button>
      </div>
    </div>
  );
};
