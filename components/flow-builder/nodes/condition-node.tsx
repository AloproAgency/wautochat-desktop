'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import { GitBranch } from 'lucide-react';

const FROM_COLOR = '#c2410c';
const TO_COLOR = '#ea580c';
const NODE_COLOR = '#c2410c';

function ConditionNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'Condition';
  const leftOperand = (data.config?.leftOperand as string) || '';
  const operator = (data.config?.operator as string) || 'equals';
  const rightOperand = (data.config?.rightOperand as string) || '';
  const expression = `${leftOperand} ${operator} ${rightOperand}`;

  return (
    <NodeExecutionOverlay nodeId={id}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: `0 0 0 2.5px ${NODE_COLOR}` }
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
          className="rounded-xl px-2.5 py-2"
        >
          {/* Main row — "Yes" label on right aligns with Yes handle at ~38% */}
          <div className="flex items-center gap-1.5">
            <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
              <GitBranch className="w-[15px] h-[15px]" style={{ color: FROM_COLOR }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
              <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
                {leftOperand ? expression : <span className="italic opacity-60">Not set</span>}
              </div>
            </div>
            <span className="text-[9px] font-bold text-green-200 shrink-0 pl-1">Yes</span>
          </div>

          {/* No row — "No" label on right aligns with No handle at ~80% */}
          <div className="flex justify-end mt-1.5 pt-1.5 border-t border-white/20">
            <span className="text-[9px] font-bold text-red-200">No</span>
          </div>
        </div>

        {/* Yes handle — aligned with main content row (~38% from top) */}
        <Handle
          type="source"
          position={Position.Right}
          id="yes"
          style={{ top: '38%', width: 12, height: 12, background: 'white', border: '2.5px solid #16a34a' }}
        />

        {/* No handle — aligned with Yes/No label row (~80% from top) */}
        <Handle
          type="source"
          position={Position.Right}
          id="no"
          style={{ top: '80%', width: 12, height: 12, background: 'white', border: '2.5px solid #dc2626' }}
        />
      </div>
    </NodeExecutionOverlay>
  );
}

export default memo(ConditionNode);
