'use client';

import { createContext, useContext } from 'react';
import type { NodeExecutionState } from '@/hooks/use-flow-execution-stream';

export const ExecutionContext = createContext<Record<string, NodeExecutionState>>({});

export function useNodeExecutionState(nodeId: string): NodeExecutionState | undefined {
  const states = useContext(ExecutionContext);
  return states[nodeId];
}
