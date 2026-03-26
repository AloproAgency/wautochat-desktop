'use client';

import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked = false, onChange, label, description, disabled, className = '', ...props }, ref) => {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange?.(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wa-green/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
            checked ? 'bg-wa-teal' : 'bg-gray-200'
          }`}
          {...props}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        {(label || description) && (
          <div className="flex flex-col">
            {label && <span className="text-sm font-medium text-wa-text">{label}</span>}
            {description && <span className="text-xs text-wa-text-muted">{description}</span>}
          </div>
        )}
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';
