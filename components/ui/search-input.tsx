'use client';

import { type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '', ...props }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-wa-text-muted dark:text-zinc-400">
        <Search className="h-4 w-4" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-wa-border bg-wa-input-bg pl-10 pr-10 text-sm text-wa-text placeholder:text-wa-text-muted transition-colors focus:border-wa-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-wa-green/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:bg-zinc-900"
        {...props}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-wa-text-muted hover:text-wa-text dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
