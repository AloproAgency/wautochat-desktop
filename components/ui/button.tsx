'use client';

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Spinner } from './spinner';

const variantClasses = {
  primary:
    'bg-wa-teal text-white hover:bg-wa-teal-dark focus-visible:ring-wa-teal active:bg-wa-teal-dark dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 dark:active:bg-zinc-200',
  secondary:
    'border border-wa-border bg-white text-wa-text hover:bg-wa-hover focus-visible:ring-wa-teal active:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:active:bg-zinc-700',
  danger:
    'bg-wa-danger text-white hover:bg-red-600 focus-visible:ring-wa-danger active:bg-red-700',
  ghost:
    'bg-transparent text-wa-text-secondary hover:bg-wa-hover focus-visible:ring-wa-teal active:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:active:bg-zinc-700',
} as const;

const sizeClasses = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'lg' ? 'md' : 'sm'} className={variant === 'primary' || variant === 'danger' ? 'border-white border-r-transparent' : ''} />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
