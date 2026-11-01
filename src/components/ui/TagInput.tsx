import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from './Field';
import { Button } from './Button';

export type TagTone = 'indigo' | 'violet' | 'emerald' | 'rose';

const TONES: Record<TagTone, string> = {
  indigo: 'bg-indigo-50 text-indigo-800',
  violet: 'bg-violet-50 text-violet-800',
  emerald: 'bg-emerald-50 text-emerald-800',
  rose: 'bg-rose-50 text-rose-800',
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
    <div className='space-y-2'>
      {label && <label className='block text-body font-medium text-ink'>{label}</label>}
      {values.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {values.map((value, idx) => (
            <span
              key={`${value}-${idx}`}
              className={`inline-flex h-8 items-center gap-1 rounded-full pl-3 pr-1 text-caption font-medium ${TONES[tone]}`}
            >
              {value}
              <button
                type='button'
                aria-label={`Retirer ${value}`}
                onClick={() => onChange(values.filter((_, i) => i !== idx))}
                className='grid size-6 place-items-center rounded-full transition-colors hover:bg-black/10'
              >
                <X className='size-3.5' />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className='flex gap-2'>
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
        <Button type='button' onClick={add}>
          Ajouter
        </Button>
      </div>
    </div>
  );
};
