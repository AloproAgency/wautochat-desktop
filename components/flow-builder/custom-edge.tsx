'use client';
import { memo } from 'react';
import { getBezierPath, useNodes, type EdgeProps } from 'reactflow';

const NODE_COLORS: Record<string, string> = {
  trigger:             '#15803d',
  'send-message':      '#27272a',
  'send-image':        '#27272a',
  'send-file':         '#27272a',
  'send-audio':        '#27272a',
  'send-video':        '#27272a',
  'send-location':     '#27272a',
  'send-contact':      '#27272a',
  'send-sticker':      '#27272a',
  'send-list':         '#27272a',
  'send-poll':         '#27272a',
  'send-buttons':      '#27272a',
  'send-reaction':     '#5b21b6',
  'forward-message':   '#5b21b6',
  'mark-as-read':      '#5b21b6',
  'typing-indicator':  '#5b21b6',
  'assign-label':      '#5b21b6',
  'remove-label':      '#5b21b6',
  'add-to-group':      '#5b21b6',
  'remove-from-group': '#5b21b6',
  'block-contact':     '#5b21b6',
  'unblock-contact':   '#5b21b6',
  'condition':         '#c2410c',
  'delay':             '#c2410c',
  'set-variable':      '#c2410c',
  'http-request':      '#c2410c',
  'ai-response':       '#0c4a6e',
  'ai-agent':          '#0c4a6e',
  'ai-classifier':     '#0c4a6e',
  'ai-extractor':      '#0c4a6e',
  'ai-summarizer':     '#0c4a6e',
  'ai-sentiment':      '#0c4a6e',
  'ai-translator':     '#0c4a6e',
  'ai-vision':         '#0c4a6e',
  'llm-claude':        '#312e81',
  'llm-openai':        '#312e81',
  'llm-gemini':        '#312e81',
  'llm-ollama':        '#312e81',
  'memory-buffer':     '#0f766e',
  'memory-vector':     '#0f766e',
  'memory-window':     '#0f766e',
  'tool-code':         '#92400e',
  'tool-http':         '#92400e',
  'tool-search':       '#92400e',
  'tool-mcp':          '#92400e',
  'wppconnect-all':    '#064e3b',
  'go-to-flow':        '#c2410c',
  'wait-for-reply':    '#c2410c',
  'end':               '#27272a',
};

function FlowEdge({
  id, source,
  sourceX, sourceY, sourcePosition,
  targetX, targetY, targetPosition,
  selected, animated, style,
}: EdgeProps) {
  const nodes = useNodes();
  const sourceNode = nodes.find((n) => n.id === source);
  const nodeType = (sourceNode?.data as { type?: string })?.type ?? '';
  const color = (style?.stroke as string) || NODE_COLORS[nodeType] || '#94a3b8';
  const isExecution = !!(style?.stroke);
  const dashSpeed = animated || isExecution ? '0.7s' : '2.2s';

  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  return (
    <g>
      <path d={edgePath} fill="none" stroke={color} strokeWidth={10} strokeOpacity={isExecution ? 0.2 : 0.1} strokeLinecap="round" />
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 2.5 : isExecution ? 2.5 : 1.8}
        strokeOpacity={selected ? 1 : isExecution ? 0.9 : 0.55}
        strokeLinecap="round"
      />
      <path
        d={edgePath}
        fill="none"
        stroke={isExecution ? 'white' : color}
        strokeWidth={isExecution ? 2 : 1.5}
        strokeOpacity={isExecution ? 0.6 : 0.3}
        strokeLinecap="round"
        strokeDasharray="3 18"
        style={{ animation: `flowDash ${dashSpeed} linear infinite` }}
      />
      <circle cx={targetX} cy={targetY} r={3} fill={color} opacity={selected ? 0.9 : 0.5} />
    </g>
  );
}

export default memo(FlowEdge);
