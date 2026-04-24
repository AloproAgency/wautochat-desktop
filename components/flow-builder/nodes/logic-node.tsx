'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import {
  Variable,
  Globe,
  BrainCircuit,
  ExternalLink,
  CircleStop,
  MessageCircle,
  Cog,
} from 'lucide-react';

const LOGIC_FROM = '#c2410c';
const LOGIC_TO = '#ea580c';
const LOGIC_COLOR = '#c2410c';

const END_FROM = '#18181b';
const END_TO = '#52525b';
const END_COLOR = '#18181b';

const logicIcons: Record<string, React.ElementType> = {
  'set-variable': Variable,
  'http-request': Globe,
  'ai-response': BrainCircuit,
  'go-to-flow': ExternalLink,
  'wait-for-reply': MessageCircle,
  end: CircleStop,
};

const logicLabels: Record<string, string> = {
  'set-variable': 'Set Variable',
  'http-request': 'HTTP Request',
  'ai-response': 'AI Response',
  'go-to-flow': 'Go to Flow',
  'wait-for-reply': 'Wait for Reply',
  end: 'End',
};

function LogicNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = logicIcons[nodeType] || Cog;
  const label = data.label || logicLabels[nodeType] || 'Logic';
  const isEnd = nodeType === 'end';
  const fromColor = isEnd ? END_FROM : LOGIC_FROM;
  const toColor = isEnd ? END_TO : LOGIC_TO;
  const nodeColor = isEnd ? END_COLOR : LOGIC_COLOR;
  const preview = getLogicSummary(nodeType, data.config);

  return (
    <NodeExecutionOverlay nodeId={id}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: `0 0 0 2.5px ${nodeColor}` }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Target handle */}
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${nodeColor}` }}
        />

        {/* Full gradient card */}
        <div
          style={{ background: `linear-gradient(135deg, ${fromColor}, ${toColor})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          {/* Icon badge: white bg, colored icon */}
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-[15px] h-[15px]" style={{ color: fromColor }} />
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {preview || <span className="italic opacity-60">Not set</span>}
            </div>
          </div>
        </div>

        {/* Source handle — hidden for End nodes */}
        {!isEnd && (
          <Handle
            type="source"
            position={Position.Right}
            style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${nodeColor}` }}
          />
        )}
      </div>
    </NodeExecutionOverlay>
  );
}

function getLogicSummary(nodeType: string, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'set-variable':
      return config?.variableName
        ? `${config.variableName} = ${String(config.value || '').slice(0, 20)}`
        : 'No variable set';
    case 'http-request':
      return config?.url
        ? `${(config.method as string) || 'GET'} ${String(config.url).slice(0, 25)}`
        : 'No URL set';
    case 'ai-response':
      return config?.prompt ? String(config.prompt).slice(0, 35) : 'No prompt set';
    case 'go-to-flow':
      return config?.flowName ? `Flow: ${config.flowName}` : 'No flow selected';
    case 'wait-for-reply':
      return config?.timeout ? `Timeout: ${config.timeout}s` : 'Waiting for reply';
    case 'end':
      return 'Flow ends here';
    default:
      return '';
  }
}

export default memo(LogicNode);
