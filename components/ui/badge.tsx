import { type HTMLAttributes } from 'react';

const variantClasses = {
  success: 'bg-wa-success/15 text-green-700 border-wa-success/30',
  warning: 'bg-wa-warning/15 text-yellow-700 border-wa-warning/30',
  danger: 'bg-wa-danger/15 text-red-700 border-wa-danger/30',
  info: 'bg-wa-blue/15 text-blue-700 border-wa-blue/30',
  default: 'bg-gray-100 text-gray-700 border-gray-200',
} as const;

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variantClasses;
}

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
