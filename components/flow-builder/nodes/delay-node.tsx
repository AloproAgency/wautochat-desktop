'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import { Timer } from 'lucide-react';

const FROM_COLOR = '#c2410c';
const TO_COLOR = '#ea580c';
const NODE_COLOR = '#c2410c';

function DelayNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'Delay';
  const duration = (data.config?.duration as number) || 0;
  const unit = (data.config?.unit as string) || 'seconds';
  const displayDuration = duration ? `${duration} ${unit}` : null;

  return (
    <NodeExecutionOverlay nodeId={id} warning={!duration}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Target handle */}
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${NODE_COLOR}` }}
        />

        {/* Full gradient card */}
        <div
          style={{ background: `linear-gradient(135deg, ${FROM_COLOR}, ${TO_COLOR})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          {/* Icon badge: white bg, colored icon */}
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Timer className="w-[15px] h-[15px]" style={{ color: FROM_COLOR }} />
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {displayDuration || <span className="italic opacity-60">Not set</span>}
            </div>
          </div>
        </div>

        {/* Source handle */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${NODE_COLOR}` }}
        />
      </div>
    </NodeExecutionOverlay>
  );
}

export default memo(DelayNode);
