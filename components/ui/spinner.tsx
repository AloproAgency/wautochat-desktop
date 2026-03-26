'use client';

import { type HTMLAttributes } from 'react';

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-3',
} as const;

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof sizeClasses;
}

export function Spinner({ size = 'md', className = '', ...props }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-wa-teal border-r-transparent ${sizeClasses[size]} ${className}`}
      {...props}
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}
