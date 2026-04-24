'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import {
  MessageSquare,
  Key,
  Regex,
  Image,
  UserPlus,
  Webhook,
  Clock,
  Users,
  UserCheck,
  Zap,
} from 'lucide-react';

const FROM_COLOR = '#15803d';
const TO_COLOR = '#22c55e';
const NODE_COLOR = '#15803d';

const triggerIcons: Record<string, React.ElementType> = {
  message_received: MessageSquare,
  keyword: Key,
  regex: Regex,
  media_received: Image,
  new_contact: UserPlus,
  webhook: Webhook,
  schedule: Clock,
  contact_message: UserCheck,
  group_message: Users,
  added_to_group: UserPlus,
};

const triggerLabels: Record<string, string> = {
  message_received: 'Message Received',
  keyword: 'Keyword Match',
  regex: 'Regex Match',
  media_received: 'Media Received',
  new_contact: 'New Contact',
  webhook: 'Webhook',
  schedule: 'Schedule',
  contact_message: 'Contact Message',
  group_message: 'Group Message',
  added_to_group: 'Added to Group',
};

function TriggerNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const triggerType = (data.config?.triggerType as string) || 'message_received';
  const Icon = triggerIcons[triggerType] || Zap;
  const label = data.label || triggerLabels[triggerType] || 'Trigger';
  const preview = getConfigSummary(triggerType, data.config);

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

function getConfigSummary(triggerType: string, config: Record<string, unknown>): string {
  switch (triggerType) {
    case 'keyword':
      return config?.keywords ? `Keywords: ${String(config.keywords)}` : 'No keywords set';
    case 'regex':
      return config?.pattern ? `Pattern: ${String(config.pattern)}` : 'No pattern set';
    case 'schedule':
      return config?.cron ? `Cron: ${String(config.cron)}` : 'No schedule set';
    case 'webhook':
      return config?.path ? `Path: ${String(config.path)}` : 'Webhook endpoint';
    case 'media_received':
      return config?.mediaType ? `Type: ${String(config.mediaType)}` : 'Any media';
    case 'contact_message':
      return config?.contactId ? `Contact: ${String(config.contactId)}` : 'Any contact';
    case 'group_message':
      return config?.groupId ? `Group: ${String(config.groupId)}` : 'Any group';
    default:
      return '';
  }
}

export default memo(TriggerNode);
