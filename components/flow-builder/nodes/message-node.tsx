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

const FROM_COLOR = '#09090b';
const TO_COLOR = '#3f3f46';
const NODE_COLOR = '#09090b';

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

  const hasConfig = Object.keys(data.config || {}).length > 0;

  return (
    <NodeExecutionOverlay nodeId={id} warning={!hasConfig}>
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
