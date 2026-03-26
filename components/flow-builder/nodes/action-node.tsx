'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import {
  SmilePlus,
  Forward,
  CheckCheck,
  Keyboard,
  Tag,
  TagsIcon,
  UserPlus,
  UserMinus,
  Ban,
  ShieldCheck,
  Zap,
} from 'lucide-react';

const COLOR = '#6366f1';

const actionIcons: Record<string, React.ElementType> = {
  'send-reaction': SmilePlus,
  'forward-message': Forward,
  'mark-as-read': CheckCheck,
  'typing-indicator': Keyboard,
  'assign-label': Tag,
  'remove-label': TagsIcon,
  'add-to-group': UserPlus,
  'remove-from-group': UserMinus,
  'block-contact': Ban,
  'unblock-contact': ShieldCheck,
};

const actionLabels: Record<string, string> = {
  'send-reaction': 'Add Reaction',
  'forward-message': 'Forward Message',
  'mark-as-read': 'Mark as Read',
  'typing-indicator': 'Typing Indicator',
  'assign-label': 'Assign Label',
  'remove-label': 'Remove Label',
  'add-to-group': 'Add to Group',
  'remove-from-group': 'Remove from Group',
  'block-contact': 'Block Contact',
  'unblock-contact': 'Unblock Contact',
};

function ActionNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = actionIcons[nodeType] || Zap;
  const label = data.label || actionLabels[nodeType] || 'Action';
  const desc = getActionDescription(nodeType, data.config);

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
          {desc || 'Not configured'}
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

function getActionDescription(nodeType: string, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'send-reaction':
      return config?.emoji ? `Emoji: ${String(config.emoji)}` : 'No emoji set';
    case 'forward-message':
      return config?.targetChat ? `To: ${String(config.targetChat)}` : 'No target set';
    case 'mark-as-read':
      return 'Marks message as read';
    case 'typing-indicator':
      return config?.duration ? `${config.duration}s` : '3s typing';
    case 'assign-label':
    case 'remove-label':
      return config?.labelName ? String(config.labelName) : 'No label set';
    case 'add-to-group':
    case 'remove-from-group':
      return config?.groupName ? String(config.groupName) : 'No group set';
    case 'block-contact':
      return 'Blocks the contact';
    case 'unblock-contact':
      return 'Unblocks the contact';
    default:
      return '';
  }
}

export default memo(ActionNode);
