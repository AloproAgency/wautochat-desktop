'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import {
  Type,
  Image,
  FileText,
  Headphones,
  Video,
  MapPin,
  Contact,
  Smile,
  List,
  BarChart3,
  LayoutGrid,
  MessageSquare,
} from 'lucide-react';

const COLOR = '#0d9488';

const messageIcons: Record<string, React.ElementType> = {
  'send-message': Type,
  'send-image': Image,
  'send-file': FileText,
  'send-audio': Headphones,
  'send-video': Video,
  'send-location': MapPin,
  'send-contact': Contact,
  'send-sticker': Smile,
  'send-list': List,
  'send-poll': BarChart3,
  'send-buttons': LayoutGrid,
};

const messageLabels: Record<string, string> = {
  'send-message': 'Send Text',
  'send-image': 'Send Image',
  'send-file': 'Send File',
  'send-audio': 'Send Audio',
  'send-video': 'Send Video',
  'send-location': 'Send Location',
  'send-contact': 'Send Contact',
  'send-sticker': 'Send Sticker',
  'send-list': 'Send List',
  'send-poll': 'Send Poll',
  'send-buttons': 'Send Buttons',
};

function MessageNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type || 'send-message';
  const Icon = messageIcons[nodeType] || MessageSquare;
  const label = data.label || messageLabels[nodeType] || 'Send Message';
  const preview = getPreview(nodeType, data.config);

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
          {preview || 'Not configured'}
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

function getPreview(nodeType: string, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'send-message':
      return config?.text ? String(config.text).slice(0, 40) : 'No text set';
    case 'send-image':
    case 'send-video':
    case 'send-audio':
    case 'send-file':
    case 'send-sticker':
      return config?.url
        ? String(config.url).slice(0, 30)
        : config?.caption
          ? String(config.caption).slice(0, 30)
          : 'No media set';
    case 'send-location':
      return config?.latitude && config?.longitude
        ? `${config.latitude}, ${config.longitude}`
        : 'No location set';
    case 'send-contact':
      return config?.contactName ? String(config.contactName) : 'No contact set';
    case 'send-list':
      return config?.title ? String(config.title) : 'No list configured';
    case 'send-poll':
      return config?.question ? String(config.question).slice(0, 30) : 'No question set';
    case 'send-buttons':
      return config?.body ? String(config.body).slice(0, 30) : 'No buttons set';
    default:
      return '';
  }
}

export default memo(MessageNode);
