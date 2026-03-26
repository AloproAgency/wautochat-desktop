'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import { GitBranch } from 'lucide-react';

const COLOR = '#f59e0b';
const GREEN = '#22c55e';
const RED = '#ef4444';

function ConditionNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'Condition';
  const leftOperand = (data.config?.leftOperand as string) || '';
  const operator = (data.config?.operator as string) || 'equals';
  const rightOperand = (data.config?.rightOperand as string) || '';
  const expression = leftOperand
    ? `${leftOperand} ${operator} ${rightOperand}`
    : 'No condition set';

  return (
    <NodeExecutionOverlay nodeId={id}>
    <div style={{ width: 260 }} className="relative">
      {/* Main card */}
      <div
        style={{ borderLeftColor: COLOR }}
        className={`rounded-xl bg-white border border-gray-200 border-l-4 px-3.5 py-3 transition-all hover:shadow-lg ${
          selected ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-md'
        }`}
      >
        <Handle
          type="target"
          position={Position.Top}
          style={{
            width: 14,
            height: 14,
            background: COLOR,
            border: '2.5px solid white',
  
          }}
        />
        <div className="flex items-center gap-3">
          <div
            style={{ backgroundColor: COLOR, width: 44, height: 44 }}
            className="rounded-full flex items-center justify-center shrink-0 shadow-sm"
          >
            <GitBranch style={{ width: 22, height: 22 }} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div
              style={{ fontSize: 14 }}
              className="font-bold text-gray-900 truncate leading-tight"
            >
              {label}
            </div>
            <div
              style={{ fontSize: 12 }}
              className="text-gray-500 truncate mt-0.5 leading-tight"
            >
              {expression}
            </div>
          </div>
        </div>
      </div>

      {/* Yes/No labels below card */}
      <div className="flex justify-between mt-1.5 px-6">
        <span
          style={{ fontSize: 11, color: GREEN }}
          className="font-semibold bg-green-50 px-2 py-0.5 rounded-full"
        >
          Yes
        </span>
        <span
          style={{ fontSize: 11, color: RED }}
          className="font-semibold bg-red-50 px-2 py-0.5 rounded-full"
        >
          No
        </span>
      </div>

      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{
          left: '30%',
          width: 14,
          height: 14,
          background: GREEN,
          border: '2.5px solid white',

        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{
          left: '70%',
          width: 14,
          height: 14,
          background: RED,
          border: '2.5px solid white',

        }}
      />
    </div>
    </NodeExecutionOverlay>
  );
}

export default memo(ConditionNode);
