'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { FlowExecutionEvent } from '@/lib/types';

interface ExecutionLogPanelProps {
  events: FlowExecutionEvent[];
  isVisible: boolean;
  onToggle: () => void;
  onClear?: () => void;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const s = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return ts;
  }
}

function getEventIcon(type: string): React.ReactNode {
  const iconStyle: React.CSSProperties = { width: 14, height: 14 };
  switch (type) {
    case 'execution:start':
      return (
        <svg style={iconStyle} viewBox="0 0 14 14" fill="none">
          <path d="M4 2.5L11 7L4 11.5V2.5Z" fill="#22c55e" />
        </svg>
      );
    case 'node:executing':
      return (
        <svg style={{ ...iconStyle, animation: 'executionSpin 0.8s linear infinite' }} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" stroke="#d1d5db" strokeWidth="1.5" fill="none" />
          <path d="M7 2A5 5 0 0 1 12 7" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'node:completed':
      return (
        <svg style={iconStyle} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" fill="#22c55e" />
          <path d="M4 7L6 9L10 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'node:error':
      return (
        <svg style={iconStyle} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" fill="#ef4444" />
          <path d="M4.5 4.5L9.5 9.5M9.5 4.5L4.5 9.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'execution:end':
      return (
        <svg style={iconStyle} viewBox="0 0 14 14" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#6b7280" />
        </svg>
      );
    default:
      return (
        <svg style={iconStyle} viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5" fill="#d1d5db" />
        </svg>
      );
  }
}

function getStatusBadge(event: FlowExecutionEvent): React.ReactNode {
  let label = '';
  let bgColor = '';
  let textColor = '';

  switch (event.type) {
    case 'execution:start':
      label = 'Started';
      bgColor = '#dcfce7';
      textColor = '#16a34a';
      break;
    case 'node:executing':
      label = 'Executing';
      bgColor = '#ede9fe';
      textColor = '#7c3aed';
      break;
    case 'node:completed':
      if (event.data?.status === 'skipped') {
        label = 'Skipped';
        bgColor = '#f3f4f6';
        textColor = '#6b7280';
      } else {
        label = 'Completed';
        bgColor = '#dcfce7';
        textColor = '#16a34a';
      }
      break;
    case 'node:error':
      label = 'Error';
      bgColor = '#fef2f2';
      textColor = '#dc2626';
      break;
    case 'execution:end':
      label = 'Ended';
      bgColor = '#f3f4f6';
      textColor = '#6b7280';
      break;
    default:
      return null;
  }

  return (
    <span
      style={{
        backgroundColor: bgColor,
        color: textColor,
        fontSize: 10,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function EventRow({ event }: { event: FlowExecutionEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = event.data?.result !== undefined || event.data?.error !== undefined || event.data?.inputData !== undefined;

  return (
    <div className="border-b border-gray-100 dark:border-zinc-700/60 px-3 py-1.5 text-xs">
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        {/* Timestamp */}
        <span className="text-gray-400 dark:text-zinc-500 font-mono text-[11px] shrink-0">
          {formatTimestamp(event.timestamp)}
        </span>

        {/* Icon */}
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {getEventIcon(event.type)}
        </span>

        {/* Node name */}
        <span className="text-gray-700 dark:text-zinc-200 font-medium shrink-0 max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap">
          {event.nodeLabel || (event.type === 'execution:start' ? 'Flow Started' : event.type === 'execution:end' ? 'Flow Ended' : event.nodeId || '')}
        </span>

        {/* Status badge */}
        {getStatusBadge(event)}

        {/* Duration */}
        {event.data?.durationMs != null && (
          <span className="text-gray-400 dark:text-zinc-500 text-[11px] ml-auto shrink-0">
            {event.data.durationMs}ms
          </span>
        )}

        {/* Expand indicator */}
        {hasDetail && (
          <span className="text-gray-400 dark:text-zinc-500 text-[10px]" style={{ marginLeft: event.data?.durationMs != null ? 4 : 'auto' }}>
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="mt-1 px-2 py-1.5 bg-gray-50 dark:bg-zinc-900 rounded-md text-[11px] font-mono text-gray-600 dark:text-zinc-300 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">
          {event.data?.error && (
            <div className="text-red-500 dark:text-red-400 mb-1">Error: {event.data.error}</div>
          )}
          {event.data?.result !== undefined && (
            <div>Result: {JSON.stringify(event.data.result, null, 2)}</div>
          )}
          {event.data?.inputData !== undefined && (
            <div className="mt-1">Input: {JSON.stringify(event.data.inputData, null, 2)}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ExecutionLogPanel({ events, isVisible, onToggle, onClear }: ExecutionLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (isVisible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, isVisible]);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClear?.();
    },
    [onClear]
  );

  const recentEvents = events.slice(-100);

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20, pointerEvents: 'none' }}>
      {/* Toggle tab */}
      <div style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'auto' }}>
        <button
          onClick={onToggle}
          className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-t-lg px-4 py-1 text-xs font-semibold text-gray-700 dark:text-zinc-200 cursor-pointer flex items-center gap-1.5"
          style={{ borderBottom: isVisible ? 'none' : undefined }}
        >
          <span>Execution Log</span>
          {recentEvents.length > 0 && (
            <span
              style={{
                backgroundColor: '#6366f1',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 700,
                padding: '0 5px',
                borderRadius: 8,
                minWidth: 18,
                textAlign: 'center',
              }}
            >
              {recentEvents.length}
            </span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-zinc-500">
            {isVisible ? '▼' : '▲'}
          </span>
        </button>
      </div>

      {/* Panel */}
      {isVisible && (
        <div
          className="bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 flex flex-col"
          style={{ height: 240, pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-zinc-700/60 shrink-0">
            <span className="text-[11px] text-gray-400 dark:text-zinc-500 font-medium">
              {recentEvents.length} event{recentEvents.length !== 1 ? 's' : ''}
            </span>
            {onClear && recentEvents.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[11px] text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 bg-transparent border-none cursor-pointer px-1.5 py-0.5 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Events list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
            {recentEvents.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 dark:text-zinc-500 text-xs">
                No execution events yet
              </div>
            ) : (
              recentEvents.map((event, i) => (
                <EventRow key={`${event.executionId}-${event.type}-${event.nodeId || ''}-${i}`} event={event} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
