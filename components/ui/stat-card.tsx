import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    label?: string;
  };
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, trend, icon, className = '' }: StatCardProps) {
  const isPositive = trend && trend.value >= 0;

  return (
    <div className={`rounded-lg border border-wa-border bg-wa-panel p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-wa-text-secondary">{label}</span>
          <span className="mt-1 text-2xl font-semibold text-wa-text">{value}</span>
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wa-teal/10 text-wa-teal">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-wa-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-wa-danger" />
          )}
          <span
            className={`text-xs font-medium ${
              isPositive ? 'text-green-600' : 'text-wa-danger'
            }`}
          >
            {isPositive ? '+' : ''}
            {trend.value}%
          </span>
          {trend.label && (
            <span className="text-xs text-wa-text-muted">{trend.label}</span>
          )}
        </div>
      )}
    </div>
  );
}
