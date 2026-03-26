'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import { Timer } from 'lucide-react';

const COLOR = '#0ea5e9';

function DelayNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'Delay';
  const duration = (data.config?.duration as number) || 0;
  const unit = (data.config?.unit as string) || 'seconds';
  const displayDuration = duration ? `${duration} ${unit}` : 'No delay set';

  return (
    <NodeExecutionOverlay nodeId={id}>
    <div
      style={{ width: 260, borderLeftColor: COLOR }}
      className={`flex items-center gap-3 rounded-xl bg-white border border-gray-200 border-l-4 px-3.5 py-3 transition-all hover:shadow-lg ${
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
      <div
        style={{ backgroundColor: COLOR, width: 44, height: 44 }}
        className="rounded-full flex items-center justify-center shrink-0 shadow-sm"
      >
        <Timer style={{ width: 22, height: 22 }} className="text-white" />
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
          {displayDuration}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 14,
          height: 14,
          background: COLOR,
          border: '2.5px solid white',

        }}
      />
    </div>
    </NodeExecutionOverlay>
  );
}

export default memo(DelayNode);
