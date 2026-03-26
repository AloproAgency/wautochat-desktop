import { type ImgHTMLAttributes } from 'react';

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
} as const;

interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> {
  size?: keyof typeof sizeClasses;
  name?: string;
  src?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashColor(name: string): string {
  const colors = [
    'bg-wa-teal',
    'bg-wa-green-dark',
    'bg-wa-teal-dark',
    'bg-emerald-600',
    'bg-cyan-600',
    'bg-teal-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ size = 'md', name, src, className = '', alt, ...props }: AvatarProps) {
  const sizeClass = sizeClasses[size];

  if (src) {
    return (
      <img
        src={src}
        alt={alt || name || 'Avatar'}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        {...props}
      />
    );
  }

  const initials = name ? getInitials(name) : '?';
  const bgColor = name ? hashColor(name) : 'bg-gray-400';

  return (
    <div
      className={`${sizeClass} ${bgColor} inline-flex items-center justify-center rounded-full font-medium text-white ${className}`}
      role="img"
      aria-label={name || 'Avatar'}
    >
      {initials}
    </div>
  );
}
