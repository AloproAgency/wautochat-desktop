'use client';

import { useState, type ReactNode } from 'react';

interface Tab {
  label: string;
  content: ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  defaultIndex?: number;
  className?: string;
}

export function Tabs({ tabs, defaultIndex = 0, className = '' }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  return (
    <div className={className}>
      <div className="flex border-b border-wa-border dark:border-zinc-700">
        {tabs.map((tab, index) => (
          <button
            key={tab.label}
            onClick={() => setActiveIndex(index)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeIndex === index
                ? 'text-wa-teal'
                : 'text-wa-text-secondary hover:text-wa-text dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                    activeIndex === index
                      ? 'bg-wa-teal text-white'
                      : 'bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {activeIndex === index && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-wa-teal" />
            )}
          </button>
        ))}
      </div>
      <div className="mt-0">{tabs[activeIndex]?.content}</div>
    </div>
  );
}
