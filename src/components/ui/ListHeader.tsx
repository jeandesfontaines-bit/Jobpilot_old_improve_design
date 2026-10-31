import React from 'react';
import { Search, X } from 'lucide-react';

export const ListHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="p-4 border-b border-zinc-200/80 bg-zinc-50/50 space-y-3 shrink-0">{children}</div>
);

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Rechercher...',
}) => (
  <div className="relative">
    <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-9 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 shadow-2xs"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
        aria-label="Effacer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
