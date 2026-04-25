'use client';

import { type TextareaHTMLAttributes, forwardRef, useState, useCallback } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, maxLength, showCount = false, className = '', id, onChange, value, defaultValue, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const [charCount, setCharCount] = useState(() => {
      const initial = (value ?? defaultValue ?? '') as string;
      return initial.length;
    });

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCharCount(e.target.value.length);
        onChange?.(e);
      },
      [onChange]
    );

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-wa-text dark:text-zinc-100"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          className={`min-h-[80px] w-full rounded-lg border bg-wa-input-bg px-3 py-2.5 text-sm text-wa-text placeholder:text-wa-text-muted transition-colors focus:border-wa-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-wa-green/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:bg-zinc-900 ${
            error ? 'border-wa-danger focus:border-wa-danger focus:ring-wa-danger/20 dark:border-red-500' : 'border-wa-border dark:border-zinc-600'
          } ${className}`}
          aria-invalid={error ? 'true' : undefined}
          {...props}
        />
        <div className="mt-1.5 flex items-center justify-between">
          {error ? (
            <p className="text-xs text-wa-danger">{error}</p>
          ) : (
            <span />
          )}
          {showCount && maxLength && (
            <span className={`text-xs ${charCount >= maxLength ? 'text-wa-danger' : 'text-wa-text-muted dark:text-zinc-400'}`}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
