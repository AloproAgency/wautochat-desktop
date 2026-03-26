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

const COLOR = '#22c55e';

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
  const configSummary = getConfigSummary(triggerType, data.config);

  return (
    <NodeExecutionOverlay nodeId={id}>
    <div
      style={{ width: 260, borderLeftColor: COLOR }}
      className={`flex items-center gap-3 rounded-xl bg-white border border-gray-200 border-l-4 px-3.5 py-3 transition-all hover:shadow-lg ${
        selected ? 'ring-2 ring-blue-400 shadow-lg' : 'shadow-md'
      }`}
    >
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
          {configSummary || 'Trigger'}
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
