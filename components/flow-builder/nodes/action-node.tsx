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

const FROM_COLOR = '#5b21b6';
const TO_COLOR = '#7c3aed';
const NODE_COLOR = '#5b21b6';

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
  const preview = getActionDescription(nodeType, data.config);

  return (
    <NodeExecutionOverlay nodeId={id}>
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
            <Icon className="w-[15px] h-[15px]" style={{ color: FROM_COLOR }} />
          </div>
          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {preview || <span className="italic opacity-60">Not set</span>}
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
