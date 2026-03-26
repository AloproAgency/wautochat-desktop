import { type SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, children, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="mb-1.5 block text-sm font-medium text-wa-text"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`h-10 w-full appearance-none rounded-lg border bg-wa-input-bg px-3 pr-10 text-sm text-wa-text transition-colors focus:border-wa-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-wa-green/20 disabled:cursor-not-allowed disabled:opacity-50 ${
              error ? 'border-wa-danger focus:border-wa-danger focus:ring-wa-danger/20' : 'border-wa-border'
            } ${className}`}
            aria-invalid={error ? 'true' : undefined}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-wa-text-muted">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-wa-danger">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
