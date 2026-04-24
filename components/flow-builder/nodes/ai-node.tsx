'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from '@/lib/types';
import NodeExecutionOverlay from '../node-execution-overlay';
import {
  Bot, BrainCircuit, Tags, Layers, FileSearch, ThumbsUp,
  Languages, Eye, Cog, Cpu, Database, Globe, Code2,
  Search, Wrench, Server, Sparkles, CircleDot, Zap,
} from 'lucide-react';

// ─── AI nodes color ───────────────────────────────────────────────────────────
const AI_FROM = '#0c4a6e';
const AI_TO   = '#0284c7';
const AI_NODE = '#0c4a6e';

// ─── Sub-node colors ──────────────────────────────────────────────────────────
const LLM_FROM  = '#312e81'; const LLM_TO  = '#6366f1'; const LLM_NODE  = '#312e81';
const MEM_FROM  = '#0f766e'; const MEM_TO  = '#0d9488'; const MEM_NODE  = '#0f766e';
const TOOL_FROM = '#92400e'; const TOOL_TO = '#d97706'; const TOOL_NODE = '#92400e';

// Suppress unused variable warnings
void LLM_NODE; void MEM_NODE; void TOOL_NODE;

// ─── Icons ────────────────────────────────────────────────────────────────────
const aiIcons: Record<string, React.ElementType> = {
  'ai-agent':      Bot,
  'ai-response':   BrainCircuit,
  'ai-classifier': Tags,
  'ai-extractor':  Layers,
  'ai-summarizer': FileSearch,
  'ai-sentiment':  ThumbsUp,
  'ai-translator': Languages,
  'ai-vision':     Eye,
};

const aiLabels: Record<string, string> = {
  'ai-agent':      'AI Agent',
  'ai-response':   'AI Response',
  'ai-classifier': 'AI Classifier',
  'ai-extractor':  'AI Extractor',
  'ai-summarizer': 'AI Summarizer',
  'ai-sentiment':  'AI Sentiment',
  'ai-translator': 'AI Translator',
  'ai-vision':     'AI Vision',
};

const llmIcons: Record<string, React.ElementType> = {
  'llm-claude': Sparkles,
  'llm-openai': CircleDot,
  'llm-gemini': Cpu,
  'llm-ollama': Server,
};
const llmLabels: Record<string, string> = {
  'llm-claude': 'Claude',
  'llm-openai': 'OpenAI GPT',
  'llm-gemini': 'Gemini',
  'llm-ollama': 'Ollama',
};

const memIcons: Record<string, React.ElementType> = {
  'memory-buffer': Database,
  'memory-vector': Layers,
  'memory-window': FileSearch,
};
const memLabels: Record<string, string> = {
  'memory-buffer': 'Buffer Memory',
  'memory-vector': 'Vector Store',
  'memory-window': 'Window Buffer',
};

const toolIcons: Record<string, React.ElementType> = {
  'tool-code':   Code2,
  'tool-http':   Globe,
  'tool-search': Search,
  'tool-mcp':    Wrench,
};
const toolLabels: Record<string, string> = {
  'tool-code':   'Execute Code',
  'tool-http':   'HTTP Request',
  'tool-search': 'Web Search',
  'tool-mcp':    'MCP Server',
};

// ─── AI Agent Node ────────────────────────────────────────────────────────────
function AiAgentNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'AI Agent';
  const model = data.config?.model as string | undefined;

  return (
    <NodeExecutionOverlay nodeId={id} warning={false}>
      <div
        style={{
          width: 220,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 12px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Main input handle */}
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${AI_NODE}`, top: '30%' }}
        />

        {/* Main output handle */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${AI_NODE}`, top: '30%' }}
        />

        {/* Card */}
        <div
          style={{ background: `linear-gradient(135deg, ${AI_FROM}, ${AI_TO})` }}
          className="rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2.5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
              <Bot className="w-[15px] h-[15px]" style={{ color: AI_FROM }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-white truncate leading-tight">{label}</span>
                <span style={{
                  fontSize: 7, backgroundColor: 'rgba(255,255,255,0.25)', color: 'white',
                  padding: '0 3px', borderRadius: 2, fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0,
                }}>AGENT</span>
              </div>
              <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
                {model || <span className="italic opacity-60">No model connected</span>}
              </div>
            </div>
          </div>

          {/* Sub-connection slots */}
          <div className="bg-black/20 px-2 py-1.5 flex items-center justify-around gap-1">
            {/* Model slot */}
            <div className="flex flex-col items-center gap-0.5 relative">
              <span className="text-[8px] font-semibold text-white/60 uppercase tracking-wider">Model</span>
              <div className="w-4 h-4 rounded-full bg-white/10 border border-white/30 flex items-center justify-center">
                <Cpu className="w-2 h-2 text-white/60" />
              </div>
              {/* Model target handle */}
              <Handle
                type="target"
                position={Position.Bottom}
                id="model"
                style={{
                  width: 10, height: 10, background: '#6366f1', border: '2px solid white',
                  bottom: -14, left: '50%', transform: 'translateX(-50%)',
                }}
              />
            </div>

            <div className="w-px h-6 bg-white/20" />

            {/* Memory slot */}
            <div className="flex flex-col items-center gap-0.5 relative">
              <span className="text-[8px] font-semibold text-white/60 uppercase tracking-wider">Memory</span>
              <div className="w-4 h-4 rounded-full bg-white/10 border border-white/30 flex items-center justify-center">
                <Database className="w-2 h-2 text-white/60" />
              </div>
              {/* Memory target handle */}
              <Handle
                type="target"
                position={Position.Bottom}
                id="memory"
                style={{
                  width: 10, height: 10, background: '#0d9488', border: '2px solid white',
                  bottom: -14, left: '50%', transform: 'translateX(-50%)',
                }}
              />
            </div>

            <div className="w-px h-6 bg-white/20" />

            {/* Tools slot */}
            <div
              className="flex flex-col items-center gap-0.5 relative"
              title="Connect WPPConnect All Access, HTTP, Search, Code or MCP tools"
            >
              <span className="text-[8px] font-semibold text-white/60 uppercase tracking-wider">Tools</span>
              <div className="w-4 h-4 rounded-full bg-white/10 border border-white/30 flex items-center justify-center">
                <Wrench className="w-2 h-2 text-white/60" />
              </div>
              {/* Tools target handle */}
              <Handle
                type="target"
                position={Position.Bottom}
                id="tool"
                style={{
                  width: 10, height: 10, background: '#d97706', border: '2px solid white',
                  bottom: -14, left: '50%', transform: 'translateX(-50%)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
}

// ─── LLM Sub-Node ─────────────────────────────────────────────────────────────
function LlmNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = llmIcons[nodeType] || Cpu;
  const label = data.label || llmLabels[nodeType] || 'LLM';
  const model = data.config?.model as string | undefined;

  return (
    <NodeExecutionOverlay nodeId={id} warning={!model}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Source handle on TOP — connects up to AI Agent's model slot */}
        <Handle
          type="source"
          position={Position.Top}
          style={{ width: 10, height: 10, background: '#6366f1', border: '2px solid white' }}
        />

        <div
          style={{ background: `linear-gradient(135deg, ${LLM_FROM}, ${LLM_TO})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-[15px] h-[15px]" style={{ color: LLM_FROM }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {model || <span className="italic opacity-60">No model set</span>}
            </div>
          </div>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
}

// ─── Memory Sub-Node ──────────────────────────────────────────────────────────
function MemoryNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = memIcons[nodeType] || Database;
  const label = data.label || memLabels[nodeType] || 'Memory';
  const size = data.config?.windowSize as number | undefined;

  return (
    <NodeExecutionOverlay nodeId={id} warning={false}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Source handle on TOP */}
        <Handle
          type="source"
          position={Position.Top}
          style={{ width: 10, height: 10, background: '#0d9488', border: '2px solid white' }}
        />

        <div
          style={{ background: `linear-gradient(135deg, ${MEM_FROM}, ${MEM_TO})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-[15px] h-[15px]" style={{ color: MEM_FROM }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {size ? `${size} messages` : <span className="italic opacity-60">Default size</span>}
            </div>
          </div>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
}

// ─── Tool Sub-Node ────────────────────────────────────────────────────────────
function ToolNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = toolIcons[nodeType] || Wrench;
  const label = data.label || toolLabels[nodeType] || 'Tool';
  const preview = getToolPreview(nodeType, data.config);

  return (
    <NodeExecutionOverlay nodeId={id} warning={false}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Source handle on TOP */}
        <Handle
          type="source"
          position={Position.Top}
          style={{ width: 10, height: 10, background: '#d97706', border: '2px solid white' }}
        />

        <div
          style={{ background: `linear-gradient(135deg, ${TOOL_FROM}, ${TOOL_TO})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-[15px] h-[15px]" style={{ color: TOOL_FROM }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {preview || <span className="italic opacity-60">Ready</span>}
            </div>
          </div>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
}

function getToolPreview(nodeType: string, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'wppconnect-all': return 'Full WhatsApp access';
    case 'tool-http':      return config?.url ? String(config.url).slice(0, 25) : '';
    case 'tool-search':    return config?.provider ? String(config.provider) : 'Tavily';
    case 'tool-code':      return config?.language ? String(config.language) : 'JavaScript';
    case 'tool-mcp':       return config?.serverUrl ? String(config.serverUrl).slice(0, 25) : '';
    default: return '';
  }
}

// ─── WPPConnect All Access Node ───────────────────────────────────────────────
const WPP_FROM = '#064e3b';
const WPP_TO   = '#10b981';

function WppConnectAllNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const label = data.label || 'WPPConnect';

  return (
    <NodeExecutionOverlay nodeId={id} warning={false}>
      <div
        style={{
          width: 160,
          ...(selected
            ? { boxShadow: '0 0 0 2.5px white, 0 0 0 4.5px rgba(0,0,0,0.25)' }
            : { boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }),
        }}
        className="rounded-xl relative"
      >
        {/* Source handle on TOP — connects up to AI Agent's tool slot */}
        <Handle
          type="source"
          position={Position.Top}
          style={{ width: 10, height: 10, background: '#10b981', border: '2px solid white' }}
        />

        <div
          style={{ background: `linear-gradient(135deg, ${WPP_FROM}, ${WPP_TO})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Zap className="w-[15px] h-[15px]" style={{ color: WPP_FROM }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-white truncate leading-tight">{label}</span>
              <span style={{
                fontSize: 7, backgroundColor: 'rgba(255,255,255,0.25)', color: 'white',
                padding: '0 3px', borderRadius: 2, fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0,
              }}>ALL ACCESS</span>
            </div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              All wppconnect tools
            </div>
          </div>
        </div>
      </div>
    </NodeExecutionOverlay>
  );
}

// ─── Standard AI Node (non-agent) ─────────────────────────────────────────────
function AiNode({ id, data, selected }: NodeProps<FlowNodeData>) {
  const nodeType = data.type;
  const Icon = aiIcons[nodeType] || Cog;
  const label = data.label || aiLabels[nodeType] || 'AI';
  const preview = getAiSummary(nodeType, data.config);

  const hasConfig = (() => {
    if (!data.config) return false;
    switch (nodeType) {
      case 'ai-response':   return !!data.config.prompt;
      case 'ai-classifier': return !!data.config.categories;
      case 'ai-extractor':  return !!data.config.fields;
      case 'ai-summarizer': return !!data.config.inputVariable;
      case 'ai-sentiment':  return !!data.config.inputVariable;
      case 'ai-translator': return !!data.config.targetLanguage;
      case 'ai-vision':     return !!data.config.inputVariable;
      default: return true;
    }
  })();

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
        <Handle
          type="target"
          position={Position.Left}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${AI_NODE}` }}
        />
        <div
          style={{ background: `linear-gradient(135deg, ${AI_FROM}, ${AI_TO})` }}
          className="rounded-xl px-2.5 py-2 flex items-center gap-2"
        >
          <div className="w-7 h-7 rounded-lg bg-white/90 shadow-sm flex items-center justify-center shrink-0">
            <Icon className="w-[15px] h-[15px]" style={{ color: AI_FROM }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-white truncate leading-tight">{label}</div>
            <div className="text-[9px] text-white/70 truncate leading-tight mt-0.5">
              {preview || <span className="italic opacity-60">Not set</span>}
            </div>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          style={{ width: 12, height: 12, background: 'white', border: `2.5px solid ${AI_NODE}` }}
        />
      </div>
    </NodeExecutionOverlay>
  );
}

function getAiSummary(nodeType: string, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'ai-response':   return config?.prompt ? String(config.prompt).slice(0, 35) : '';
    case 'ai-classifier': return config?.categories ? `Categories: ${String(config.categories).slice(0, 20)}` : '';
    case 'ai-extractor':  return config?.fields ? `Fields: ${String(config.fields).slice(0, 20)}` : '';
    case 'ai-summarizer': return config?.inputVariable ? `Input: ${String(config.inputVariable)}` : '';
    case 'ai-sentiment':  return config?.inputVariable ? `Input: ${String(config.inputVariable)}` : '';
    case 'ai-translator': return config?.targetLanguage ? `→ ${String(config.targetLanguage)}` : '';
    case 'ai-vision':     return config?.inputVariable ? `Input: ${String(config.inputVariable)}` : '';
    default: return '';
  }
}

export const AiAgentNodeComponent     = memo(AiAgentNode);
export const LlmNodeComponent         = memo(LlmNode);
export const MemoryNodeComponent      = memo(MemoryNode);
export const ToolNodeComponent        = memo(ToolNode);
export const WppConnectAllNodeComponent = memo(WppConnectAllNode);
export default memo(AiNode);
