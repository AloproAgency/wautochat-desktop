'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FlowExecutionEvent } from '@/lib/types';

export interface NodeExecutionState {
  status: 'idle' | 'executing' | 'success' | 'error' | 'skipped';
  result?: unknown;
  error?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
}

export function useFlowExecutionStream(flowId: string) {
  const [nodeStates, setNodeStates] = useState<Record<string, NodeExecutionState>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<FlowExecutionEvent[]>([]);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const clearStates = useCallback(() => {
    setNodeStates({});
    setActiveExecutionId(null);
    setExecutionLog([]);
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!flowId) return;

    const url = `/api/flows/${flowId}/execution-stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    eventSource.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data) as Record<string, unknown>;

        // Skip connection confirmation events
        if (raw.type === 'connected') {
          setIsConnected(true);
          return;
        }

        const event = raw as unknown as FlowExecutionEvent;

        // Append to log (keep max 100)
        setExecutionLog((prev) => {
          const updated = [...prev, event];
          return updated.length > 100 ? updated.slice(-100) : updated;
        });

        switch (event.type) {
          case 'execution:start': {
            // Clear previous fade timeout
            if (fadeTimeoutRef.current) {
              clearTimeout(fadeTimeoutRef.current);
              fadeTimeoutRef.current = null;
            }
            setNodeStates({});
            setActiveExecutionId(event.executionId);
            break;
          }

          case 'node:executing': {
            if (event.nodeId) {
              setNodeStates((prev) => ({
                ...prev,
                [event.nodeId!]: {
                  status: 'executing',
                  startedAt: event.timestamp,
                },
              }));
            }
            break;
          }

          case 'node:completed': {
            if (event.nodeId) {
              const status = event.data?.status === 'skipped' ? 'skipped' : 'success';
              setNodeStates((prev) => ({
                ...prev,
                [event.nodeId!]: {
                  status,
                  result: event.data?.result,
                  durationMs: event.data?.durationMs,
                  startedAt: prev[event.nodeId!]?.startedAt,
                  completedAt: event.timestamp,
                },
              }));
            }
            break;
          }

          case 'node:error': {
            if (event.nodeId) {
              setNodeStates((prev) => ({
                ...prev,
                [event.nodeId!]: {
                  status: 'error',
                  error: event.data?.error,
                  durationMs: event.data?.durationMs,
                  startedAt: prev[event.nodeId!]?.startedAt,
                  completedAt: event.timestamp,
                },
              }));
            }
            break;
          }

          case 'execution:end': {
            // Keep states visible for 8 seconds then fade out
            fadeTimeoutRef.current = setTimeout(() => {
              setNodeStates({});
              setActiveExecutionId(null);
              fadeTimeoutRef.current = null;
            }, 8000);
            break;
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
    };
  }, [flowId]);

  return { nodeStates, isConnected, activeExecutionId, executionLog, clearStates };
}
