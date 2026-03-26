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

const COLOR_PURPLE = '#8b5cf6';
const COLOR_RED = '#ef4444';

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
  const color = isEnd ? COLOR_RED : COLOR_PURPLE;
  const summary = getLogicSummary(nodeType, data.config);

  return (
    <NodeExecutionOverlay nodeId={id}>
    <div
      style={{ width: 260, borderLeftColor: color }}
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
          background: color,
          border: '2.5px solid white',

        }}
      />
      <div
        style={{ backgroundColor: color, width: 44, height: 44 }}
        className="rounded-full flex items-center justify-center shrink-0 shadow-sm"
      >
        <Icon style={{ width: 22, height: 22 }} className="text-white" />
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
          {summary || 'Not configured'}
        </div>
      </div>
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            width: 14,
            height: 14,
            background: color,
            border: '2.5px solid white',

          }}
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
