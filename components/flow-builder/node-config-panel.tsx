'use client';

import { useState, useCallback, useEffect } from 'react';
import NextImage from 'next/image';
import type { Node } from 'reactflow';
import type { FlowNodeData, FlowNodeType } from '@/lib/types';
import {
  X, Trash2, Save, Copy, Check, Info, Plus, Minus,
  MessageSquare, Type, Image as ImageIcon, FileText, Headphones, Video, MapPin, Contact,
  Smile, List, BarChart3, LayoutGrid, SmilePlus, Forward, CheckCheck, Keyboard,
  Tag, TagsIcon, UserPlus, UserMinus, Ban, ShieldCheck, GitBranch, Timer,
  Variable, Globe, BrainCircuit, ExternalLink, CircleStop, Clock,
  Inbox, Reply, AtSign, Heart, Edit, FileX, Eye, Link as LinkIcon, Vote,
  Users as UsersIcon, User as UserIcon, Radio,
  Bot, Tags, Layers, FileSearch, ThumbsUp, Languages,
  Sparkles, CircleDot, Cpu, Server, Code2, Search as SearchIcon, Wrench, Database, Zap,
} from 'lucide-react';

// Node type to icon/color/gradient mapping for the header
const nodeIconConfig: Record<string, { icon: React.ElementType; bg: string; gradientFrom: string; gradientTo: string; category: string }> = {
  'trigger':          { icon: MessageSquare, bg: '#15803d', gradientFrom: '#15803d', gradientTo: '#22c55e', category: 'Trigger' },
  'send-message':     { icon: Type,          bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-image':       { icon: ImageIcon,     bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-file':        { icon: FileText,      bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-audio':       { icon: Headphones,    bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-video':       { icon: Video,         bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-location':    { icon: MapPin,        bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-contact':     { icon: Contact,       bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-sticker':     { icon: Smile,         bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-list':        { icon: List,          bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-poll':        { icon: BarChart3,     bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-buttons':     { icon: LayoutGrid,    bg: '#09090b', gradientFrom: '#09090b', gradientTo: '#3f3f46', category: 'Message' },
  'send-reaction':    { icon: SmilePlus,     bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'forward-message':  { icon: Forward,       bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'mark-as-read':     { icon: CheckCheck,    bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'typing-indicator': { icon: Keyboard,      bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'assign-label':     { icon: Tag,           bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'remove-label':     { icon: TagsIcon,      bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'add-to-group':     { icon: UserPlus,      bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'remove-from-group':{ icon: UserMinus,     bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'block-contact':    { icon: Ban,           bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'unblock-contact':  { icon: ShieldCheck,   bg: '#5b21b6', gradientFrom: '#5b21b6', gradientTo: '#7c3aed', category: 'Action' },
  'condition':        { icon: GitBranch,     bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'delay':            { icon: Timer,         bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'set-variable':     { icon: Variable,      bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'http-request':     { icon: Globe,         bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'ai-response':      { icon: BrainCircuit,  bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-agent':         { icon: Bot,           bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-classifier':    { icon: Tags,          bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-extractor':     { icon: Layers,        bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-summarizer':    { icon: FileSearch,    bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-sentiment':     { icon: ThumbsUp,      bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-translator':    { icon: Languages,     bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'ai-vision':        { icon: Eye,           bg: '#0c4a6e', gradientFrom: '#0c4a6e', gradientTo: '#0284c7', category: 'AI' },
  'llm-claude':       { icon: Sparkles,      bg: '#312e81', gradientFrom: '#312e81', gradientTo: '#6366f1', category: 'AI Model' },
  'llm-openai':       { icon: CircleDot,     bg: '#312e81', gradientFrom: '#312e81', gradientTo: '#6366f1', category: 'AI Model' },
  'llm-gemini':       { icon: Cpu,           bg: '#312e81', gradientFrom: '#312e81', gradientTo: '#6366f1', category: 'AI Model' },
  'llm-ollama':       { icon: Server,        bg: '#312e81', gradientFrom: '#312e81', gradientTo: '#6366f1', category: 'AI Model' },
  'memory-buffer':    { icon: Database,      bg: '#0f766e', gradientFrom: '#0f766e', gradientTo: '#0d9488', category: 'Memory' },
  'memory-vector':    { icon: Layers,        bg: '#0f766e', gradientFrom: '#0f766e', gradientTo: '#0d9488', category: 'Memory' },
  'memory-window':    { icon: FileSearch,    bg: '#0f766e', gradientFrom: '#0f766e', gradientTo: '#0d9488', category: 'Memory' },
  'tool-code':        { icon: Code2,      bg: '#92400e', gradientFrom: '#92400e', gradientTo: '#d97706', category: 'Tool' },
  'tool-http':        { icon: Globe,      bg: '#92400e', gradientFrom: '#92400e', gradientTo: '#d97706', category: 'Tool' },
  'tool-search':      { icon: SearchIcon, bg: '#92400e', gradientFrom: '#92400e', gradientTo: '#d97706', category: 'Tool' },
  'tool-mcp':         { icon: Wrench,     bg: '#92400e', gradientFrom: '#92400e', gradientTo: '#d97706', category: 'Tool' },
  'wppconnect-all':   { icon: Zap,        bg: '#064e3b', gradientFrom: '#064e3b', gradientTo: '#10b981', category: 'WPPConnect' },
  'go-to-flow':       { icon: ExternalLink,  bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'wait-for-reply':   { icon: Clock,         bg: '#c2410c', gradientFrom: '#c2410c', gradientTo: '#ea580c', category: 'Logic' },
  'end':              { icon: CircleStop,    bg: '#18181b', gradientFrom: '#18181b', gradientTo: '#3f3f46', category: 'End' },
};

interface NodeConfigPanelProps {
  node: Node<FlowNodeData> | null;
  sessionId?: string;
  currentFlowId?: string;
  onClose: () => void;
  onUpdate: (nodeId: string, data: FlowNodeData) => void;
  onDelete: (nodeId: string) => void;
}

export default function NodeConfigPanel({
  node,
  sessionId,
  currentFlowId,
  onClose,
  onUpdate,
  onDelete,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(
    () => ({ ...(node?.data.config ?? {}) })
  );
  const [label, setLabel] = useState(() => node?.data.label ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateConfig = useCallback((key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  function handleSave() {
    if (!node) return;
    onUpdate(node.id, {
      ...node.data,
      label,
      config,
    });
    onClose();
  }

  function handleDelete() {
    if (!node) return;
    onDelete(node.id);
    onClose();
  }

  if (!node) return null;

  const nodeType = node.data.type;
  const iconCfg = nodeIconConfig[nodeType] || { icon: CircleStop, bg: '#6b7280', gradientFrom: '#4b5563', gradientTo: '#6b7280', category: 'Node' };
  const HeaderIcon = iconCfg.icon;
  const nodeTypeName = nodeType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-800 border-l border-slate-200 dark:border-zinc-700 shadow-xl" style={{ width: 320 }}>
      {/* Header */}
      <div
        className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${iconCfg.gradientFrom}, ${iconCfg.gradientTo})` }}
      >
        <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <HeaderIcon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white/70 font-medium">{iconCfg.category}</div>
          <div className="text-sm font-bold text-white truncate">{label || nodeTypeName}</div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Node Label Input */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50">
        <label className="block text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Node Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Enter node name..."
          className="w-full px-3 py-2 text-sm font-medium text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-300 dark:placeholder:text-zinc-500"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Type-specific config */}
          {renderConfigForm(nodeType, config, updateConfig, sessionId)}
        </div>
      </div>

      {/* Footer */}
      {showDeleteConfirm ? (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-zinc-100 text-center mb-2">Delete Node?</h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 text-center mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center gap-2">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          title="Delete node"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors shadow-sm"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ---- Config form router ----

function renderConfigForm(
  nodeType: FlowNodeType,
  config: Record<string, unknown>,
  updateConfig: (key: string, value: unknown) => void,
  sessionId?: string,
  currentFlowId?: string
) {
  switch (nodeType) {
    case 'trigger':
      return <TriggerConfig config={config} updateConfig={updateConfig} />;
    case 'send-message':
      return <SendTextConfig config={config} updateConfig={updateConfig} />;
    case 'send-image':
    case 'send-file':
    case 'send-audio':
    case 'send-video':
    case 'send-sticker':
      return <SendMediaConfig config={config} updateConfig={updateConfig} nodeType={nodeType} />;
    case 'send-location':
      return <SendLocationConfig config={config} updateConfig={updateConfig} />;
    case 'send-contact':
      return <SendContactConfig config={config} updateConfig={updateConfig} />;
    case 'send-list':
      return <SendListConfig config={config} updateConfig={updateConfig} />;
    case 'send-poll':
      return <SendPollConfig config={config} updateConfig={updateConfig} />;
    case 'send-buttons':
      return <SendButtonsConfig config={config} updateConfig={updateConfig} />;
    case 'condition':
      return <ConditionConfig config={config} updateConfig={updateConfig} />;
    case 'delay':
      return <DelayConfig config={config} updateConfig={updateConfig} />;
    case 'set-variable':
      return <SetVariableConfig config={config} updateConfig={updateConfig} />;
    case 'http-request':
      return <HttpRequestConfig config={config} updateConfig={updateConfig} />;
    case 'ai-response':
      return <AiResponseConfig config={config} updateConfig={updateConfig} />;
    case 'ai-agent':
      return <AiAgentConfig config={config} updateConfig={updateConfig} />;
    case 'ai-classifier':
      return <AiClassifierConfig config={config} updateConfig={updateConfig} />;
    case 'ai-extractor':
      return <AiExtractorConfig config={config} updateConfig={updateConfig} />;
    case 'ai-summarizer':
      return <AiSummarizerConfig config={config} updateConfig={updateConfig} />;
    case 'ai-sentiment':
      return <AiSentimentConfig config={config} updateConfig={updateConfig} />;
    case 'ai-translator':
      return <AiTranslatorConfig config={config} updateConfig={updateConfig} />;
    case 'ai-vision':
      return <AiVisionConfig config={config} updateConfig={updateConfig} />;
    case 'assign-label':
    case 'remove-label':
      return <LabelConfig config={config} updateConfig={updateConfig} />;
    case 'add-to-group':
    case 'remove-from-group':
      return <GroupConfig config={config} updateConfig={updateConfig} sessionId={sessionId} nodeType={nodeType} />;
    case 'go-to-flow':
      return <GoToFlowConfig config={config} updateConfig={updateConfig} sessionId={sessionId} currentFlowId={currentFlowId} />;
    case 'send-reaction':
      return <ReactionConfig config={config} updateConfig={updateConfig} />;
    case 'forward-message':
      return <ForwardConfig config={config} updateConfig={updateConfig} sessionId={sessionId} />;
    case 'mark-as-read':
      return <InfoText text="This node marks the incoming message as read. No configuration needed." />;
    case 'typing-indicator':
      return <TypingConfig config={config} updateConfig={updateConfig} />;
    case 'block-contact':
      return <InfoText text="This node blocks the contact that sent the message. No configuration needed." />;
    case 'unblock-contact':
      return <InfoText text="This node unblocks the contact. No configuration needed." />;
    case 'end':
      return <InfoText text="This node ends the flow execution. No configuration needed." />;
    case 'wait-for-reply':
      return <WaitForReplyConfig config={config} updateConfig={updateConfig} />;
    case 'llm-claude':
    case 'llm-openai':
    case 'llm-gemini':
    case 'llm-ollama':
      return <LlmConfig config={config} updateConfig={updateConfig} nodeType={nodeType} />;
    case 'memory-buffer':
      return <MemoryBufferConfig config={config} updateConfig={updateConfig} />;
    case 'memory-vector':
      return <MemoryVectorConfig config={config} updateConfig={updateConfig} />;
    case 'memory-window':
      return <MemoryWindowConfig config={config} updateConfig={updateConfig} />;
    case 'tool-code':
      return <ToolCodeConfig config={config} updateConfig={updateConfig} />;
    case 'tool-http':
      return <ToolHttpConfig config={config} updateConfig={updateConfig} />;
    case 'tool-search':
      return <ToolSearchConfig config={config} updateConfig={updateConfig} />;
    case 'tool-mcp':
      return <ToolMcpConfig config={config} updateConfig={updateConfig} />;
    case 'wppconnect-all':
      return <WppConnectAllConfig config={config} updateConfig={updateConfig} />;
    default:
      return <InfoText text="No configuration available for this node type." />;
  }
}

// ---- Shared field components ----

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  large,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  large?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={large ? { fontSize: 18, textAlign: 'center', padding: '12px 16px' } : undefined}
      className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ minHeight: 100 }}
      className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none transition-all"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  large,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  large?: boolean;
}) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(Number(e.target.value))}
      placeholder={placeholder}
      min={min}
      max={max}
      style={large ? { fontSize: 24, textAlign: 'center', padding: '12px 16px' } : undefined}
      className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
    />
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={
            value === opt.value
              ? { backgroundColor: '#1f2937', color: '#ffffff' }
              : undefined
          }
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            value === opt.value
              ? ''
              : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SliderInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {label && <span className="text-xs text-gray-500 dark:text-zinc-400">{label}</span>}
        <span className="text-xs font-medium text-gray-900 dark:text-zinc-100">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
      <div className="flex justify-between text-xs text-gray-400 dark:text-zinc-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function InfoText({ text }: { text: string }) {
  return (
    <div className="flex gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-lg">
      <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
      <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug">{text}</p>
    </div>
  );
}

function HintBox({ text }: { text: string }) {
  return (
    <div className="flex gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-lg">
      <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
      <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-snug">{text}</p>
    </div>
  );
}

function VariableToolbar({ onInsert }: { onInsert: (v: string) => void }) {
  const vars = [
    { label: 'name', value: '{{name}}' },
    { label: 'phone', value: '{{phone}}' },
    { label: 'message', value: '{{message}}' },
  ];
  const [customVar, setCustomVar] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {vars.map((v) => (
        <button
          key={v.label}
          type="button"
          onClick={() => onInsert(v.value)}
          className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
        >
          {v.value}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={customVar}
          onChange={(e) => setCustomVar(e.target.value)}
          placeholder="custom"
          className="px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 w-20 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
        />
        <button
          type="button"
          onClick={() => {
            if (customVar.trim()) {
              onInsert(`{{${customVar.trim()}}}`);
              setCustomVar('');
            }
          }}
          className="px-2 py-1 text-xs font-medium rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

// ---- Config form props ----

interface ConfigProps {
  config: Record<string, unknown>;
  updateConfig: (key: string, value: unknown) => void;
}

// ---- Trigger Config ----

// Trigger options grouped by category
const triggerOptionsByCategory: Record<string, { value: string; label: string }[]> = {
  message: [
    { value: 'message_received', label: '💬 Any message' },
    { value: 'direct_message', label: '👤 Direct (private) message' },
    { value: 'group_message', label: '👥 Group message' },
    { value: 'contact_message', label: '📞 Specific contact only' },
    { value: 'new_contact', label: '🆕 New contact (first message)' },
    { value: 'keyword', label: '🔑 Keyword match' },
    { value: 'regex', label: '🧬 Regex pattern' },
    { value: 'media_received', label: '📎 Media received (image/video/audio/doc)' },
    { value: 'sticker_received', label: '😀 Sticker received' },
    { value: 'location_received', label: '📍 Location received' },
    { value: 'contact_card_received', label: '📇 Contact card received' },
    { value: 'link_received', label: '🔗 Link/URL received' },
    { value: 'mention_received', label: '@ Mention (@you)' },
    { value: 'reply_received', label: '↩️ Reply to my message' },
    { value: 'reaction_received', label: '❤️ Reaction received' },
    { value: 'poll_response', label: '🗳️ Poll response' },
    { value: 'message_edited', label: '✏️ Message edited' },
    { value: 'message_deleted', label: '🗑️ Message deleted' },
    { value: 'message_read', label: '👁️ My message read (blue ticks)' },
  ],
  presence: [
    { value: 'presence_changed', label: '🟢 Any presence change' },
  ],
  group_event: [
    { value: 'added_to_group', label: '➕ I was added to a group' },
    { value: 'group_joined', label: '🎉 Someone joined a group' },
    { value: 'group_left', label: '👋 Someone left a group' },
  ],
  label: [
    { value: 'label_assigned', label: '🏷️ Label assigned to a chat' },
    { value: 'label_unassigned', label: '🚫 Label removed from a chat' },
    { value: 'label_created', label: '✨ New label created' },
    { value: 'label_updated', label: '✏️ Label renamed / color changed' },
    { value: 'label_deleted', label: '🗑️ Label deleted' },
  ],
  call: [
    { value: 'incoming_call', label: '📞 Incoming call' },
  ],
  system: [
    { value: 'webhook', label: '🪝 Webhook (external)' },
  ],
  schedule: [
    { value: 'schedule', label: '⏰ Schedule (cron)' },
  ],
};

const categoryLabels: Record<string, string> = {
  message: 'Message event',
  presence: 'Status',
  group_event: 'Group Event',
  label: 'Labels',
  call: 'Call',
  system: 'System',
  schedule: 'Schedule',
};

const categoryIcons: Record<string, React.ElementType> = {
  message: MessageSquare,
  presence: Radio,
  group_event: UsersIcon,
  label: Tag,
  call: MessageSquare, // fallback
  system: Globe,
  schedule: Clock,
};

function CategoryIcon({ category }: { category: string }) {
  const Icon = categoryIcons[category] || MessageSquare;
  return (
    <div className="w-8 h-8 rounded-md bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-white" />
    </div>
  );
}

function TriggerConfig({ config, updateConfig }: ConfigProps) {
  const triggerCategory = (config.triggerCategory as string) || 'message';
  const availableOptions = triggerOptionsByCategory[triggerCategory] || triggerOptionsByCategory.message;
  const defaultTriggerType = availableOptions[0]?.value || 'message_received';
  const triggerType = (config.triggerType as string) || defaultTriggerType;

  const [copied, setCopied] = useState(false);
  const generatedWebhookPath = useState(
    () => `/webhook/${Math.random().toString(36).slice(2, 10)}`
  )[0];

  const webhookPath = (config.path as string) || generatedWebhookPath;

  function copyWebhookPath() {
    navigator.clipboard.writeText(webhookPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* Trigger Type dropdown — only for non-message categories */}
      {triggerCategory !== 'message' && (
        <Field label="Trigger Type" hint="Choose the specific event">
          <SelectInput
            value={availableOptions.some((o) => o.value === triggerType) ? triggerType : defaultTriggerType}
            onChange={(v) => updateConfig('triggerType', v)}
            options={availableOptions}
          />
        </Field>
      )}

      {/* Help text for non-Discussion categories */}
      {triggerCategory !== 'message' && (
        <div className="text-xs text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-900/60 rounded-md p-2.5 leading-relaxed">
          {triggerType === 'added_to_group' && 'Se déclenche quand vous êtes ajouté à un NOUVEAU groupe. Parfait pour auto-saluer.'}
          {triggerType === 'group_joined' && 'Se déclenche quand une personne rejoint un groupe où vous êtes.'}
          {triggerType === 'group_left' && 'Se déclenche quand quelqu\'un quitte un groupe.'}
          {triggerType === 'label_assigned' && 'Se déclenche quand un label est assigné à un chat ou un contact.'}
          {triggerType === 'label_unassigned' && 'Se déclenche quand un label est retiré d\'un chat ou d\'un contact.'}
          {triggerType === 'label_created' && 'Se déclenche quand un nouveau label est créé dans WhatsApp.'}
          {triggerType === 'label_updated' && 'Se déclenche quand un label existant est renommé ou change de couleur.'}
          {triggerType === 'label_deleted' && 'Se déclenche quand un label est supprimé définitivement.'}
          {triggerType === 'incoming_call' && 'Se déclenche quand on vous appelle. Vous pouvez rejeter ou répondre.'}
          {triggerType === 'presence_changed' && 'Se déclenche quand un contact passe en ligne, commence à taper, etc.'}
          {triggerType === 'webhook' && 'Votre système externe peut appeler cette URL pour déclencher le flow.'}
          {triggerType === 'schedule' && 'Exécute le flow à intervalles fixes: rappels quotidiens, rapports hebdo, etc.'}
        </div>
      )}

      {triggerCategory !== 'message' && triggerType === 'keyword' && (
        <>
          <Field label="Keywords" hint="Enter one keyword per line">
            <textarea
              value={(config.keywords as string) || ''}
              onChange={(e) => updateConfig('keywords', e.target.value)}
              placeholder={"hello\nhi\nhey\nwelcome"}
              rows={4}
              style={{ minHeight: 80 }}
              className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 dark:placeholder:text-zinc-500 resize-none transition-all font-mono"
            />
          </Field>
        </>
      )}

      {triggerCategory !== 'message' && triggerType === 'regex' && (
        <Field label="Regex Pattern">
          <TextInput
            value={(config.pattern as string) || ''}
            onChange={(v) => updateConfig('pattern', v)}
            placeholder="^hello.*world$"
          />
        </Field>
      )}

      {triggerType === 'schedule' && (
        <>
          <Field label="Cron Expression">
            <TextInput
              value={(config.cron as string) || ''}
              onChange={(v) => updateConfig('cron', v)}
              placeholder="0 9 * * *"
            />
          </Field>
          <Field label="Quick Presets">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Every minute', value: '* * * * *' },
                { label: 'Hourly', value: '0 * * * *' },
                { label: 'Daily 9AM', value: '0 9 * * *' },
                { label: 'Weekly Mon', value: '0 9 * * 1' },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => updateConfig('cron', preset.value)}
                  className="px-2.5 py-1 text-xs rounded-md bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {triggerType === 'webhook' && (
        <Field label="Webhook Path">
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 font-mono truncate">
              {webhookPath}
            </div>
            <button
              type="button"
              onClick={copyWebhookPath}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors shrink-0"
              title="Copy path"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
              )}
            </button>
          </div>
        </Field>
      )}

      {/* All these were for individual Discussion triggerTypes — removed since filters handle them now */}

      {triggerType === 'incoming_call' && (
        <Field label="Call Type">
          <SelectInput
            value={(config.callType as string) || 'any'}
            onChange={(v) => updateConfig('callType', v)}
            options={[
              { value: 'any', label: 'Any call (voice or video)' },
              { value: 'voice', label: 'Voice only' },
              { value: 'video', label: 'Video only' },
            ]}
          />
        </Field>
      )}

      {triggerType === 'presence_changed' && (
        <Field label="Presence State">
          <SelectInput
            value={(config.presenceState as string) || 'any'}
            onChange={(v) => updateConfig('presenceState', v)}
            options={[
              { value: 'any', label: 'Any change' },
              { value: 'available', label: 'Online' },
              { value: 'unavailable', label: 'Offline' },
              { value: 'composing', label: 'Typing' },
              { value: 'recording', label: 'Recording audio' },
            ]}
          />
        </Field>
      )}

      {triggerCategory === 'label' && (
        <>
          <Field label="Label name filter" hint="Leave empty to match ANY label. Supports comma-separated list.">
            <TextInput
              value={(config.labelName as string) || ''}
              onChange={(v) => updateConfig('labelName', v)}
              placeholder="Important, VIP, Lead"
            />
          </Field>

          <Field label="Match mode">
            <SelectInput
              value={(config.labelMatchMode as string) || 'exact'}
              onChange={(v) => updateConfig('labelMatchMode', v)}
              options={[
                { value: 'exact', label: 'Exact match' },
                { value: 'contains', label: 'Contains' },
                { value: 'startsWith', label: 'Starts with' },
                { value: 'regex', label: 'Regex pattern' },
              ]}
            />
          </Field>

          <Field label="Label color filter (optional)" hint="Hex, e.g. #FF0000 — leave empty to ignore color">
            <TextInput
              value={(config.labelColor as string) || ''}
              onChange={(v) => updateConfig('labelColor', v)}
              placeholder="#ef4444"
            />
          </Field>

          {(triggerType === 'label_assigned' || triggerType === 'label_unassigned') && (
            <>
              <Field label="Target type">
                <SelectInput
                  value={(config.labelTargetType as string) || 'any'}
                  onChange={(v) => updateConfig('labelTargetType', v)}
                  options={[
                    { value: 'any', label: 'Any target' },
                    { value: 'contact', label: 'Contact only' },
                    { value: 'chat', label: 'Chat only' },
                    { value: 'group', label: 'Group only' },
                  ]}
                />
              </Field>

              <Field label="Specific chat/contact ID (optional)" hint="Format: 12345@c.us or 12345@g.us">
                <TextInput
                  value={(config.labelTargetId as string) || ''}
                  onChange={(v) => updateConfig('labelTargetId', v)}
                  placeholder="22912345678@c.us"
                />
              </Field>
            </>
          )}

          <Field label="Trigger only if chat has this label count" hint="Optional. e.g. '>2' means more than 2 labels">
            <TextInput
              value={(config.labelCountFilter as string) || ''}
              onChange={(v) => updateConfig('labelCountFilter', v)}
              placeholder=">0"
            />
          </Field>
        </>
      )}

      {triggerCategory !== 'message' &&
        (triggerType === 'group_joined' ||
         triggerType === 'group_left') && (
          <Field label="Group ID (optional)" hint="Leave empty to match ALL groups. Format: 12345@g.us">
            <TextInput
              value={(config.groupId as string) || ''}
              onChange={(v) => updateConfig('groupId', v)}
              placeholder="120363xxx@g.us"
            />
          </Field>
        )}

      {/* 🎯 Discussion filters — always shown for Discussion category */}
      {triggerCategory === 'message' && (
        <TriggerFilters config={config} updateConfig={updateConfig} />
      )}
    </>
  );
}

// ---- Filter Block (card wrapper) ----

function FilterBlock({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
      <div className="p-3">
        <div className="flex items-start gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-zinc-700 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">{title}</div>
            <div className="text-xs text-gray-500 dark:text-zinc-400">{description}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Filter Selector Component ----

const CONTENT_TYPE_OPTIONS = [
  { value: 'text',     label: 'Texte' },
  { value: 'image',    label: 'Image' },
  { value: 'video',    label: 'Vidéo' },
  { value: 'audio',    label: 'Audio' },
  { value: 'document', label: 'Document' },
  { value: 'sticker',  label: 'Sticker' },
  { value: 'location', label: 'Position' },
  { value: 'contact',  label: 'Contact' },
  { value: 'link',     label: 'Lien' },
  { value: 'poll',     label: 'Sondage' },
];

function TriggerFilters({ config, updateConfig }: ConfigProps) {
  const filters = (config.filters as Record<string, unknown>) || {};
  const [newContact, setNewContact] = useState('');

  const updateFilter = (key: string, value: unknown) => {
    updateConfig('filters', { ...filters, [key]: value });
  };

  // Sender filter
  const senderMode = (filters.senderMode as string) || 'all';
  const senderList = (filters.senderList as string[]) || [];

  const addContact = () => {
    const cleaned = newContact.trim().replace(/\s/g, '');
    if (!cleaned) return;
    if (!senderList.includes(cleaned)) {
      updateFilter('senderList', [...senderList, cleaned]);
    }
    setNewContact('');
  };

  const removeContact = (i: number) => {
    updateFilter('senderList', senderList.filter((_, idx) => idx !== i));
  };

  // Chat type — normalize legacy values not in new UI options
  const VALID_CHAT_TYPES = ['all', 'private', 'group', 'broadcast'];
  const rawChatType = (filters.chatType as string) || 'all';
  const chatType = VALID_CHAT_TYPES.includes(rawChatType) ? rawChatType : 'all';

  // Content types (multi-select)
  const contentTypes = (filters.contentTypes as string[]) || [];
  const toggleContentType = (type: string) => {
    if (contentTypes.includes(type)) {
      updateFilter('contentTypes', contentTypes.filter((t) => t !== type));
    } else {
      updateFilter('contentTypes', [...contentTypes, type]);
    }
  };

  // Message event type — normalize legacy values not in new UI options
  const VALID_MESSAGE_TYPES = ['any', 'new', 'reply', 'mention', 'reaction', 'forwarded', 'quoted'];
  const rawMessageType = (filters.messageType as string) || 'any';
  const messageType = VALID_MESSAGE_TYPES.includes(rawMessageType) ? rawMessageType : 'any';

  // Content condition
  const contentFilter = (filters.content as Record<string, unknown>) || {};
  const contentEnabled = contentFilter.enabled === true;

  const activeCount =
    (senderMode !== 'all' && senderList.length > 0 ? 1 : 0) +
    (chatType !== 'all' ? 1 : 0) +
    (contentTypes.length > 0 ? 1 : 0) +
    (messageType !== 'any' ? 1 : 0) +
    (contentEnabled ? 1 : 0);

  return (
    <>
      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900 dark:text-zinc-100">Filtres</div>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-full">
              {activeCount} actif{activeCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Définissez quels messages déclenchent ce flow</div>
      </div>

      {/* 1. Expéditeur */}
      <FilterBlock
        icon={UserIcon}
        title="Expéditeur"
        description={senderMode === 'all' ? 'Tout le monde' : `${senderMode === 'include' ? 'Inclure' : 'Exclure'} — ${senderList.length} contact${senderList.length > 1 ? 's' : ''}`}
      >
        <div className="mb-2">
          <SegmentedControl
            value={senderMode}
            onChange={(v) => updateFilter('senderMode', v)}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'include', label: 'Inclure' },
              { value: 'exclude', label: 'Exclure' },
            ]}
          />
        </div>
        {senderMode !== 'all' && (
          <>
            {senderList.length > 0 && (
              <div className="flex flex-col gap-1 mb-2">
                {senderList.map((contact, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-zinc-700/50 rounded-md border border-gray-200 dark:border-zinc-700">
                    <span className="text-xs text-gray-700 dark:text-zinc-300 font-mono flex-1 truncate">{contact}</span>
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addContact()}
                placeholder="22991234567 ou +229..."
                className="flex-1 px-2.5 py-1.5 text-xs text-gray-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 placeholder:text-gray-400 dark:placeholder:text-zinc-500 font-mono"
              />
              <button
                type="button"
                onClick={addContact}
                disabled={!newContact.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Ajouter
              </button>
            </div>
            {senderList.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5 italic">Ajouter des contacts pour filtrer</p>
            )}
          </>
        )}
      </FilterBlock>

      {/* 2. Type de discussion */}
      <FilterBlock icon={MessageSquare} title="Type de discussion" description="Privé, groupe ou diffusion">
        <SegmentedControl
          value={chatType}
          onChange={(v) => updateFilter('chatType', v)}
          options={[
            { value: 'all', label: 'Tout' },
            { value: 'private', label: 'Privé' },
            { value: 'group', label: 'Groupe' },
            { value: 'broadcast', label: 'Diffusion' },
          ]}
        />
        {chatType === 'group' && (
          <div className="mt-2">
            <TextInput
              value={(filters.groupId as string) || ''}
              onChange={(v) => updateFilter('groupId', v)}
              placeholder="ID groupe spécifique (optionnel): 120363xxx@g.us"
            />
          </div>
        )}
      </FilterBlock>

      {/* 3. Type de contenu (multi-select chips) */}
      <FilterBlock
        icon={FileText}
        title="Type de contenu"
        description={contentTypes.length === 0 ? 'Tous les types (aucun filtre)' : `${contentTypes.length} type${contentTypes.length > 1 ? 's' : ''} sélectionné${contentTypes.length > 1 ? 's' : ''}`}
      >
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_TYPE_OPTIONS.map((opt) => {
            const selected = contentTypes.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleContentType(opt.value)}
                style={selected ? { backgroundColor: '#15803d', color: '#fff', borderColor: '#15803d' } : undefined}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${
                  selected
                    ? ''
                    : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-700 hover:border-emerald-300 hover:text-emerald-700 dark:hover:border-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {contentTypes.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5 italic">Aucun = tous les types acceptés</p>
        )}
      </FilterBlock>

      {/* 4. Condition sur le contenu du message */}
      <FilterBlock icon={GitBranch} title="Condition sur le contenu" description="Filtrer par le texte du message">
        <label className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-700 dark:text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={contentEnabled}
            onChange={(e) => updateFilter('content', { ...contentFilter, enabled: e.target.checked })}
            className="rounded border-gray-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500"
          />
          Activer ce filtre
        </label>
        {contentEnabled && (
          <div className="space-y-2">
            <SelectInput
              value={(contentFilter.operator as string) || 'contains'}
              onChange={(v) => updateFilter('content', { ...contentFilter, operator: v })}
              options={[
                { value: 'contains', label: 'Contient' },
                { value: 'equals', label: 'Égal à' },
                { value: 'startsWith', label: 'Commence par' },
                { value: 'endsWith', label: 'Finit par' },
                { value: 'regex', label: 'Expression régulière (regex)' },
              ]}
            />
            <TextInput
              value={(contentFilter.value as string) || ''}
              onChange={(v) => updateFilter('content', { ...contentFilter, value: v })}
              placeholder="Valeur à comparer..."
            />
          </div>
        )}
      </FilterBlock>

      {/* 5. Message event */}
      <FilterBlock icon={Inbox} title="Message event" description="Nature du message reçu">
        <SelectInput
          value={messageType}
          onChange={(v) => updateFilter('messageType', v)}
          options={[
            { value: 'any', label: 'Tous les messages' },
            { value: 'new', label: 'Nouveau message' },
            { value: 'reply', label: 'Réponse à mon message' },
            { value: 'mention', label: 'Mention (@moi)' },
            { value: 'reaction', label: 'Réaction' },
            { value: 'forwarded', label: 'Message transféré' },
            { value: 'quoted', label: 'Message cité' },
          ]}
        />
      </FilterBlock>

    </>
  );
}

// ---- Regex tester sub-component ----

function RegexTester({ pattern }: { pattern: string }) {
  const [testInput, setTestInput] = useState('');
  const match = (() => {
    if (!pattern || !testInput) return null;
    try {
      const regex = new RegExp(pattern);
      return regex.test(testInput);
    } catch {
      return null;
    }
  })();

  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={testInput}
        onChange={(e) => setTestInput(e.target.value)}
        placeholder="Type text to test..."
        className="w-full px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 dark:placeholder:text-zinc-500 transition-all"
      />
      {testInput && match !== null && (
        <div
          className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            backgroundColor: match ? '#f0fdf4' : '#fef2f2',
            color: match ? '#16a34a' : '#dc2626',
          }}
        >
          {match ? 'Match found' : 'No match'}
        </div>
      )}
    </div>
  );
}

// ---- Media type checkboxes ----

function MediaTypeCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const types = ['image', 'video', 'audio', 'document', 'any'];

  function toggle(type: string) {
    if (type === 'any') {
      onChange(['any']);
      return;
    }
    const without = value.filter((v) => v !== 'any' && v !== type);
    if (value.includes(type)) {
      onChange(without.length === 0 ? ['any'] : without);
    } else {
      onChange([...without, type]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {types.map((type) => {
        const isActive = value.includes(type) || (type === 'any' && value.length === 0);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${
              isActive
                ? 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : 'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-700'
            }`}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}

// ---- Send Text Config ----

function SendTextConfig({ config, updateConfig }: ConfigProps) {
  const text = (config.text as string) || '';
  const [showPreview, setShowPreview] = useState(false);

  function insertVariable(v: string) {
    updateConfig('text', text + v);
  }

  const charCount = text.length;

  return (
    <>
      <Field label="Message Content">
        <TextArea
          value={text}
          onChange={(v) => updateConfig('text', v)}
          placeholder="Hello {{name}}, welcome!"
          rows={5}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-gray-400 dark:text-zinc-500">{charCount} characters</span>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </Field>

      {showPreview && (
        <div
          className="p-3 rounded-lg border"
          style={{ backgroundColor: '#DCF8C6', borderColor: '#c6f0a8' }}
        >
          <p className="text-sm text-gray-800 dark:text-zinc-200 whitespace-pre-wrap">
            {text
              .replace(/\{\{name\}\}/g, 'John')
              .replace(/\{\{phone\}\}/g, '+1234567890')
              .replace(/\{\{message\}\}/g, 'Hello!')
              || 'Preview will appear here...'}
          </p>
        </div>
      )}

      <Field label="Insert Variable">
        <VariableToolbar onInsert={insertVariable} />
      </Field>
    </>
  );
}

// ---- Send Media Config ----

function SendMediaConfig({ config, updateConfig, nodeType }: ConfigProps & { nodeType: string }) {
  const mediaLabel = nodeType.replace('send-', '').charAt(0).toUpperCase() + nodeType.replace('send-', '').slice(1);
  const fileExts: Record<string, string> = {
    'send-image': 'jpg',
    'send-video': 'mp4',
    'send-audio': 'mp3',
    'send-file': 'pdf',
    'send-sticker': 'webp',
  };
  const acceptMap: Record<string, string> = {
    'send-image': 'image/*',
    'send-video': 'video/*',
    'send-audio': 'audio/*',
    'send-sticker': 'image/webp,image/png',
    'send-file': '*/*',
  };
  const ext = fileExts[nodeType] || 'file';
  const url = (config.url as string) || '';
  const sourceMode = (config.sourceMode as string) || 'url';

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadError(data.error || 'Upload failed');
        return;
      }
      // Build absolute URL for wppconnect (needs http(s)://...)
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      updateConfig('url', `${origin}${data.data.url}`);
      updateConfig('uploadedFileName', data.data.filename);
      if (nodeType === 'send-file' && !config.fileName) {
        updateConfig('fileName', data.data.filename);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Field label={`${mediaLabel} Source`}>
        <SegmentedControl
          value={sourceMode}
          onChange={(v) => updateConfig('sourceMode', v)}
          options={[
            { value: 'url', label: 'URL' },
            { value: 'upload', label: 'Upload' },
          ]}
        />
      </Field>

      {sourceMode === 'url' ? (
        <Field label={`${mediaLabel} URL`}>
          <TextInput
            value={url}
            onChange={(v) => updateConfig('url', v)}
            placeholder={`https://example.com/file.${ext}`}
          />
        </Field>
      ) : (
        <Field label={`Upload ${mediaLabel}`} hint="Max 50 MB">
          <div className="space-y-2">
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900/50 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-emerald-400 cursor-pointer transition-colors">
              <input
                type="file"
                accept={acceptMap[nodeType] || '*/*'}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={uploading}
              />
              <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">
                {uploading ? 'Uploading...' : url ? 'Replace file' : 'Choose a file'}
              </span>
            </label>
            {url && (
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate" title={url}>
                {(config.uploadedFileName as string) || url.split('/').pop()}
              </p>
            )}
            {uploadError && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}
          </div>
        </Field>
      )}

      {url && (nodeType === 'send-image' || nodeType === 'send-sticker') && (
        <div className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden bg-gray-50 dark:bg-zinc-900/50">
          <NextImage
            src={url}
            alt="Preview"
            width={512}
            height={128}
            unoptimized
            className="w-full h-32 object-contain"
            style={{ height: '8rem' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {nodeType !== 'send-sticker' && (
        <Field label="Caption">
          <TextArea
            value={(config.caption as string) || ''}
            onChange={(v) => updateConfig('caption', v)}
            placeholder="Caption for the media..."
            rows={2}
          />
        </Field>
      )}

      {nodeType === 'send-file' && (
        <Field label="File Name">
          <TextInput
            value={(config.fileName as string) || ''}
            onChange={(v) => updateConfig('fileName', v)}
            placeholder="document.pdf"
          />
        </Field>
      )}
    </>
  );
}

// ---- Send Location Config ----

function SendLocationConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <TextInput
            value={(config.latitude as string) || ''}
            onChange={(v) => updateConfig('latitude', v)}
            placeholder="48.8566"
          />
        </Field>
        <Field label="Longitude">
          <TextInput
            value={(config.longitude as string) || ''}
            onChange={(v) => updateConfig('longitude', v)}
            placeholder="2.3522"
          />
        </Field>
      </div>
      <Field label="Title">
        <TextInput
          value={(config.title as string) || ''}
          onChange={(v) => updateConfig('title', v)}
          placeholder="Paris, France"
        />
      </Field>
      <Field label="Address">
        <TextInput
          value={(config.address as string) || ''}
          onChange={(v) => updateConfig('address', v)}
          placeholder="Optional address text"
        />
      </Field>
    </>
  );
}

// ---- Send Contact Config ----

function SendContactConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Contact Name">
        <TextInput
          value={(config.contactName as string) || ''}
          onChange={(v) => updateConfig('contactName', v)}
          placeholder="John Doe"
        />
      </Field>
      <Field label="Phone Number">
        <TextInput
          value={(config.contactPhone as string) || ''}
          onChange={(v) => updateConfig('contactPhone', v)}
          placeholder="+1234567890"
        />
      </Field>
    </>
  );
}

// ---- Send List Config ----

function SendListConfig({ config, updateConfig }: ConfigProps) {
  const sections = (config.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description: string }> }>) || [
    { title: '', rows: [{ id: '1', title: '', description: '' }] },
  ];

  function updateSections(newSections: typeof sections) {
    updateConfig('sections', newSections);
  }

  function addSection() {
    updateSections([...sections, { title: '', rows: [{ id: String(Date.now()), title: '', description: '' }] }]);
  }

  function removeSection(idx: number) {
    updateSections(sections.filter((_, i) => i !== idx));
  }

  function updateSectionTitle(idx: number, title: string) {
    const updated = [...sections];
    updated[idx] = { ...updated[idx], title };
    updateSections(updated);
  }

  function addRow(sectionIdx: number) {
    const updated = [...sections];
    updated[sectionIdx] = {
      ...updated[sectionIdx],
      rows: [...updated[sectionIdx].rows, { id: String(Date.now()), title: '', description: '' }],
    };
    updateSections(updated);
  }

  function removeRow(sectionIdx: number, rowIdx: number) {
    const updated = [...sections];
    updated[sectionIdx] = {
      ...updated[sectionIdx],
      rows: updated[sectionIdx].rows.filter((_, i) => i !== rowIdx),
    };
    updateSections(updated);
  }

  function updateRow(sectionIdx: number, rowIdx: number, field: string, value: string) {
    const updated = [...sections];
    const rows = [...updated[sectionIdx].rows];
    rows[rowIdx] = { ...rows[rowIdx], [field]: value };
    updated[sectionIdx] = { ...updated[sectionIdx], rows };
    updateSections(updated);
  }

  return (
    <>
      <Field label="List Title">
        <TextInput
          value={(config.title as string) || ''}
          onChange={(v) => updateConfig('title', v)}
          placeholder="Choose an option"
        />
      </Field>
      <Field label="Body Text">
        <TextArea
          value={(config.body as string) || ''}
          onChange={(v) => updateConfig('body', v)}
          placeholder="Please select from the list below"
          rows={2}
        />
      </Field>
      <Field label="Button Text">
        <TextInput
          value={(config.buttonText as string) || ''}
          onChange={(v) => updateConfig('buttonText', v)}
          placeholder="View Options"
        />
      </Field>

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">Sections</span>
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Section
          </button>
        </div>

        {sections.map((section, sIdx) => (
          <div key={sIdx} className="border border-gray-200 dark:border-zinc-700 rounded-lg p-3 space-y-2.5 bg-gray-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                placeholder={`Section ${sIdx + 1} title`}
                className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
              />
              {sections.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSection(sIdx)}
                  className="text-red-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {section.rows.map((row, rIdx) => (
              <div key={rIdx} className="ml-3 border-l-2 border-slate-200 dark:border-zinc-700 pl-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(sIdx, rIdx, 'title', e.target.value)}
                    placeholder="Row title"
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
                  />
                  {section.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(sIdx, rIdx)}
                      className="text-red-400 hover:text-red-500 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => updateRow(sIdx, rIdx, 'description', e.target.value)}
                  placeholder="Row description"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
                />
                <input
                  type="text"
                  value={row.id}
                  onChange={(e) => updateRow(sIdx, rIdx, 'id', e.target.value)}
                  placeholder="Row ID"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono dark:placeholder:text-zinc-500"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRow(sIdx)}
              className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium ml-3 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Row
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Send Poll Config ----

function SendPollConfig({ config, updateConfig }: ConfigProps) {
  const choices = (config.choices as string[]) || ['', ''];

  function updateChoices(newChoices: string[]) {
    updateConfig('choices', newChoices);
  }

  return (
    <>
      <Field label="Question">
        <TextInput
          value={(config.question as string) || ''}
          onChange={(v) => updateConfig('question', v)}
          placeholder="What do you prefer?"
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">Choices</span>
          <button
            type="button"
            onClick={() => updateChoices([...choices, ''])}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Choice
          </button>
        </div>
        {choices.map((choice, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="text-xs font-medium text-gray-400 dark:text-zinc-500 w-5 text-center shrink-0"
            >
              {idx + 1}.
            </span>
            <input
              type="text"
              value={choice}
              onChange={(e) => {
                const updated = [...choices];
                updated[idx] = e.target.value;
                updateChoices(updated);
              }}
              placeholder={`Choice ${idx + 1}`}
              className="flex-1 px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
            />
            {choices.length > 2 && (
              <button
                type="button"
                onClick={() => updateChoices(choices.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Field label="Allow Multiple Selections">
        <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={(config.allowMultiple as boolean) || false}
            onChange={(e) => updateConfig('allowMultiple', e.target.checked)}
            className="rounded border-gray-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500"
          />
          Users can select multiple options
        </label>
      </Field>
    </>
  );
}

// ---- Send Buttons Config ----

function SendButtonsConfig({ config, updateConfig }: ConfigProps) {
  const buttons = (config.buttons as Array<{ id: string; text: string }>) || [{ id: '1', text: '' }];

  function updateButtons(newButtons: typeof buttons) {
    updateConfig('buttons', newButtons);
  }

  return (
    <>
      <Field label="Body Text">
        <TextArea
          value={(config.body as string) || ''}
          onChange={(v) => updateConfig('body', v)}
          placeholder="Choose an option below"
          rows={3}
        />
      </Field>
      <Field label="Footer Text">
        <TextInput
          value={(config.footer as string) || ''}
          onChange={(v) => updateConfig('footer', v)}
          placeholder="Optional footer"
        />
      </Field>

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">Buttons (max 3)</span>
          {buttons.length < 3 && (
            <button
              type="button"
              onClick={() => updateButtons([...buttons, { id: String(Date.now()), text: '' }])}
              className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Button
            </button>
          )}
        </div>
        {buttons.map((btn, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={btn.id}
                onChange={(e) => {
                  const updated = [...buttons];
                  updated[idx] = { ...updated[idx], id: e.target.value };
                  updateButtons(updated);
                }}
                placeholder={`Button ${idx + 1} ID`}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 font-mono dark:placeholder:text-zinc-500"
              />
              <input
                type="text"
                value={btn.text}
                onChange={(e) => {
                  const updated = [...buttons];
                  updated[idx] = { ...updated[idx], text: e.target.value };
                  updateButtons(updated);
                }}
                placeholder={`Button ${idx + 1} text`}
                className="w-full px-2.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
              />
            </div>
            {buttons.length > 1 && (
              <button
                type="button"
                onClick={() => updateButtons(buttons.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-500 transition-colors self-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Condition Config ----

function ConditionConfig({ config, updateConfig }: ConfigProps) {
  const leftOperand = (config.leftOperand as string) || '';
  const operator = (config.operator as string) || 'equals';
  const rightOperand = (config.rightOperand as string) || '';
  const hideRight = ['exists', 'not_exists', 'is_empty'].includes(operator);

  const operatorLabels: Record<string, string> = {
    equals: '=',
    not_equals: '!=',
    contains: 'contains',
    not_contains: 'not contains',
    starts_with: 'starts with',
    ends_with: 'ends with',
    regex: 'matches',
    greater_than: '>',
    less_than: '<',
    exists: 'exists',
    not_exists: 'not exists',
    is_empty: 'is empty',
  };

  return (
    <>
      <Field label="Left Operand" hint="Use {{message}}, {{sender}}, or any variable">
        <TextInput
          value={leftOperand}
          onChange={(v) => updateConfig('leftOperand', v)}
          placeholder="{{message}}"
        />
      </Field>

      <Field label="Operator">
        <SelectInput
          value={operator}
          onChange={(v) => updateConfig('operator', v)}
          options={[
            { value: 'contains', label: 'Contains' },
            { value: 'equals', label: 'Equals' },
            { value: 'not_equals', label: 'Not Equals' },
            { value: 'starts_with', label: 'Starts With' },
            { value: 'ends_with', label: 'Ends With' },
            { value: 'regex', label: 'Matches Regex' },
            { value: 'greater_than', label: 'Greater Than' },
            { value: 'less_than', label: 'Less Than' },
            { value: 'exists', label: 'Exists' },
            { value: 'not_exists', label: 'Not Exists' },
            { value: 'is_empty', label: 'Is Empty' },
          ]}
        />
      </Field>

      {!hideRight && (
        <Field label="Right Operand">
          <TextInput
            value={rightOperand}
            onChange={(v) => updateConfig('rightOperand', v)}
            placeholder="value or {{variable}}"
          />
        </Field>
      )}

      {/* Visual preview pill */}
      {leftOperand && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40">
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium text-center">
            If{' '}
            <span className="font-bold">{leftOperand}</span>
            {' '}{operatorLabels[operator] || operator}{' '}
            {!hideRight && <span className="font-bold">{rightOperand || '...'}</span>}
          </p>
        </div>
      )}
    </>
  );
}

// ---- Delay Config ----

function DelayConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Duration">
        <NumberInput
          value={(config.duration as number) || 0}
          onChange={(v) => updateConfig('duration', v)}
          placeholder="5"
          min={1}
          large
        />
      </Field>
      <Field label="Unit">
        <SegmentedControl
          value={(config.unit as string) || 'seconds'}
          onChange={(v) => updateConfig('unit', v)}
          options={[
            { value: 'seconds', label: 'Seconds' },
            { value: 'minutes', label: 'Minutes' },
            { value: 'hours', label: 'Hours' },
          ]}
        />
      </Field>
    </>
  );
}

// ---- Set Variable Config ----

function SetVariableConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Variable Name">
        <TextInput
          value={(config.variableName as string) || ''}
          onChange={(v) => updateConfig('variableName', v)}
          placeholder="myVariable"
        />
      </Field>
      <Field label="Value Expression">
        <TextArea
          value={(config.value as string) || ''}
          onChange={(v) => updateConfig('value', v)}
          placeholder="Static value or {{expression}}"
          rows={2}
        />
      </Field>
      <HintBox text="Use expressions like {{message}}, {{sender}}, or combine with text. E.g.: Hello {{name}}!" />
    </>
  );
}

// ---- HTTP Request Config ----

function HttpRequestConfig({ config, updateConfig }: ConfigProps) {
  const method = (config.method as string) || 'GET';
  const headers = (config.headers as Array<{ key: string; value: string }>) || [];

  return (
    <>
      <Field label="Method">
        <SegmentedControl
          value={method}
          onChange={(v) => updateConfig('method', v)}
          options={[
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'DELETE', label: 'DEL' },
          ]}
        />
      </Field>

      <Field label="URL">
        <TextInput
          value={(config.url as string) || ''}
          onChange={(v) => updateConfig('url', v)}
          placeholder="https://api.example.com/data"
        />
      </Field>

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700 dark:text-zinc-300">Headers</span>
          <button
            type="button"
            onClick={() => updateConfig('headers', [...headers, { key: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Header
          </button>
        </div>
        {headers.map((header, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              type="text"
              value={header.key}
              onChange={(e) => {
                const updated = [...headers];
                updated[idx] = { ...updated[idx], key: e.target.value };
                updateConfig('headers', updated);
              }}
              placeholder="Key"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
            />
            <input
              type="text"
              value={header.value}
              onChange={(e) => {
                const updated = [...headers];
                updated[idx] = { ...updated[idx], value: e.target.value };
                updateConfig('headers', updated);
              }}
              placeholder="Value"
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => updateConfig('headers', headers.filter((_, i) => i !== idx))}
              className="text-red-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {['POST', 'PUT'].includes(method) && (
        <Field label="Request Body (JSON)">
          <TextArea
            value={(config.body as string) || ''}
            onChange={(v) => updateConfig('body', v)}
            placeholder='{"key": "value"}'
            rows={4}
          />
        </Field>
      )}

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <Field label="Store Response In Variable" hint="Save the API response to use later in the flow">
        <TextInput
          value={(config.responseVariable as string) || ''}
          onChange={(v) => updateConfig('responseVariable', v)}
          placeholder="apiResponse"
        />
      </Field>
    </>
  );
}

// ---- AI Response Config ----

function AiResponseConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="System Prompt">
        <TextArea
          value={(config.prompt as string) || ''}
          onChange={(v) => updateConfig('prompt', v)}
          placeholder="You are a helpful assistant. The user said: {{message}}"
          rows={5}
        />
      </Field>

      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={[
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
            { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
            { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
            { value: 'claude-3-opus', label: 'Claude 3 Opus' },
          ]}
        />
      </Field>

      <Field label="Max Tokens">
        <SliderInput
          value={(config.maxTokens as number) || 500}
          onChange={(v) => updateConfig('maxTokens', v)}
          min={100}
          max={4000}
          step={100}
        />
      </Field>

      <Field label="Temperature">
        <SliderInput
          value={(config.temperature as number) || 0.7}
          onChange={(v) => updateConfig('temperature', v)}
          min={0}
          max={2}
          step={0.1}
        />
      </Field>

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <Field label="Store Response In Variable">
        <TextInput
          value={(config.responseVariable as string) || ''}
          onChange={(v) => updateConfig('responseVariable', v)}
          placeholder="aiResponse"
        />
      </Field>
    </>
  );
}

// ---- Label Config ----

function LabelConfig({ config, updateConfig }: ConfigProps) {
  return (
    <Field label="Label Name">
      <TextInput
        value={(config.labelName as string) || ''}
        onChange={(v) => updateConfig('labelName', v)}
        placeholder="VIP Customer"
      />
    </Field>
  );
}

// ---- Group Config ----

interface GroupRow {
  id: string;
  wppId: string;
  name: string;
  participantCount: number;
  profilePicUrl?: string;
  isAdmin: boolean;
}

function GroupConfig({
  config,
  updateConfig,
  sessionId,
  nodeType,
}: ConfigProps & { sessionId?: string; nodeType: string }) {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const selectedGroupId = (config.groupId as string) || '';
  const selectedGroup = groups.find((g) => g.wppId === selectedGroupId);
  const selectedGroupName = (config.groupName as string) || selectedGroup?.name || '';

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/groups?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setGroups(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  // For add-to-group, the user typically needs to be admin to add participants.
  // For remove-from-group, same requirement.
  const actionableGroups = groups.filter((g) => (nodeType === 'add-to-group' ? g.isAdmin : g.isAdmin));

  const filteredGroups = actionableGroups.filter((g) => {
    const q = search.toLowerCase();
    return !q || g.name.toLowerCase().includes(q);
  });

  function selectGroup(g: GroupRow) {
    updateConfig('groupId', g.wppId);
    updateConfig('groupName', g.name);
    setShowPicker(false);
    setSearch('');
  }

  function clearGroup() {
    updateConfig('groupId', '');
    updateConfig('groupName', '');
  }

  const actionLabel = nodeType === 'add-to-group' ? 'Add contact to' : 'Remove contact from';

  return (
    <>
      <Field
        label={`${actionLabel} group`}
        hint="Only groups where you are an administrator can be used here"
      >
        {/* Selected group card */}
        {selectedGroupId ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <div className="flex items-center gap-3">
              {selectedGroup?.profilePicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedGroup.profilePicUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-sm font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                  {(selectedGroupName || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
                  {selectedGroupName || 'Unnamed group'}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {selectedGroup
                    ? `${selectedGroup.participantCount} members · ${selectedGroupId}`
                    : selectedGroupId}
                </p>
              </div>
              <button
                type="button"
                onClick={clearGroup}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
            >
              Change group
            </button>
          </div>
        ) : !showPicker ? (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-full px-3 py-3 text-sm rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900/50 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-emerald-400 text-gray-600 dark:text-zinc-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Choose a group
          </button>
        ) : null}

        {/* Picker */}
        {showPicker && (
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                autoFocus
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-zinc-500 text-gray-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => {
                  setShowPicker(false);
                  setSearch('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {!sessionId ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No session linked to this flow.
                </p>
              ) : loading ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  Loading groups...
                </p>
              ) : actionableGroups.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No groups where you are administrator. Sync groups from the Groups page.
                </p>
              ) : filteredGroups.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No groups match your search.
                </p>
              ) : (
                filteredGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGroup(g)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 text-left transition-colors"
                  >
                    {g.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.profilePicUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-sm font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {g.name.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                        {g.name || 'Unnamed group'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        {g.participantCount} members
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Field>

      <HintBox
        text={
          nodeType === 'add-to-group'
            ? "The contact who triggered this flow will be added to the selected group. You must be an administrator of that group."
            : "The contact who triggered this flow will be removed from the selected group. You must be an administrator of that group."
        }
      />
    </>
  );
}

// ---- Go to Flow Config ----

interface FlowSummary {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  isActive: boolean;
}

function GoToFlowConfig({
  config,
  updateConfig,
  sessionId,
  currentFlowId,
}: ConfigProps & { sessionId?: string; currentFlowId?: string }) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const selectedFlowId = (config.flowId as string) || '';
  const selectedFlow = flows.find((f) => f.id === selectedFlowId);
  const selectedFlowName =
    (config.flowName as string) || selectedFlow?.name || '';

  useEffect(() => {
    setLoading(true);
    const url = sessionId ? `/api/flows?sessionId=${sessionId}` : '/api/flows';
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setFlows(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Never show the current flow in the picker (prevents infinite loops)
  const availableFlows = flows.filter((f) => f.id !== currentFlowId);
  const filteredFlows = availableFlows.filter((f) => {
    const q = search.toLowerCase();
    return (
      !q ||
      f.name.toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  });

  function selectFlow(f: FlowSummary) {
    updateConfig('flowId', f.id);
    updateConfig('flowName', f.name);
    setShowPicker(false);
    setSearch('');
  }

  function clearSelection() {
    updateConfig('flowId', '');
    updateConfig('flowName', '');
  }

  return (
    <>
      <Field
        label="Jump to flow"
        hint="Execution will continue inside the selected flow."
      >
        {selectedFlowId ? (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
                  {selectedFlowName || 'Unnamed flow'}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                  {selectedFlow?.isActive ? 'Active' : 'Inactive'}
                  {selectedFlow?.description ? ` · ${selectedFlow.description}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="mt-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
            >
              Change flow
            </button>
          </div>
        ) : !showPicker ? (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-full px-3 py-3 text-sm rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900/50 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-emerald-400 text-gray-600 dark:text-zinc-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Choose a flow
          </button>
        ) : null}

        {showPicker && (
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search flows..."
                autoFocus
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-zinc-500 text-gray-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => {
                  setShowPicker(false);
                  setSearch('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {loading ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  Loading flows...
                </p>
              ) : availableFlows.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No other flows found. Create one first on the Flows page.
                </p>
              ) : filteredFlows.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No flows match your search.
                </p>
              ) : (
                filteredFlows.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => selectFlow(f)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 text-left transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        f.isActive
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                        {f.name || 'Unnamed flow'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                        {f.isActive ? 'Active' : 'Inactive'}
                        {f.description ? ` · ${f.description}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Field>

      <HintBox text="When this node runs, execution jumps to the selected flow and the current flow stops. The current flow is hidden from the list to prevent infinite loops." />
    </>
  );
}

// ---- Reaction Config ----

const REACTION_EMOJIS: Array<{ emoji: string; label: string }> = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🙏', label: 'Pray' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🎉', label: 'Party' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '✅', label: 'OK' },
  { emoji: '❌', label: 'No' },
  { emoji: '💯', label: '100' },
  { emoji: '🤔', label: 'Think' },
  { emoji: '😍', label: 'Heart eyes' },
  { emoji: '🥳', label: 'Celebrate' },
];

function ReactionConfig({ config, updateConfig }: ConfigProps) {
  const selectedEmoji = (config.emoji as string) || '';
  const [customEmoji, setCustomEmoji] = useState('');

  const isCustom = selectedEmoji && !REACTION_EMOJIS.some((e) => e.emoji === selectedEmoji);

  return (
    <>
      <Field label="Choose a Reaction" hint="Pick an emoji below or enter a custom one">
        <div className="grid grid-cols-6 gap-2">
          {REACTION_EMOJIS.map(({ emoji, label }) => {
            const isSelected = selectedEmoji === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  updateConfig('emoji', emoji);
                  setCustomEmoji('');
                }}
                title={label}
                className={`aspect-square flex items-center justify-center rounded-xl text-2xl transition-all ${
                  isSelected
                    ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 scale-110 shadow-md'
                    : 'bg-gray-50 dark:bg-zinc-700/50 hover:bg-gray-100 dark:hover:bg-zinc-700 hover:scale-105 border border-gray-200 dark:border-zinc-600'
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="w-full h-px bg-gray-100 dark:bg-zinc-700" />

      <Field label="Or enter a custom emoji">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={isCustom ? selectedEmoji : customEmoji}
            onChange={(e) => {
              const v = e.target.value;
              setCustomEmoji(v);
              if (v.trim()) updateConfig('emoji', v.trim());
            }}
            placeholder="🚀"
            maxLength={4}
            style={{ fontSize: 24, textAlign: 'center', padding: '8px 12px', width: 80 }}
            className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
          />
          {selectedEmoji && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
              <span>Selected:</span>
              <span className="text-xl">{selectedEmoji}</span>
            </div>
          )}
        </div>
      </Field>

      {/* Preview card */}
      {selectedEmoji && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20 border border-emerald-200 dark:border-emerald-700/40">
          <p className="text-xs text-gray-500 dark:text-zinc-400 mb-2">Preview</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 shadow-sm">
              Their message
            </div>
            <div className="text-3xl animate-bounce">{selectedEmoji}</div>
          </div>
        </div>
      )}

      <HintBox text="The reaction will be applied to the message that triggered this flow." />
    </>
  );
}

// ---- Forward Config ----

interface ForwardContact {
  id: string;
  wppId: string;
  name: string;
  phone: string;
  profilePicUrl?: string;
}

function ForwardConfig({
  config,
  updateConfig,
  sessionId,
}: ConfigProps & { sessionId?: string }) {
  const [contacts, setContacts] = useState<ForwardContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Stored as array of wpp_ids for multi-target forwarding.
  // Also accepts legacy single string values from config.targetChat / config.to
  const rawTargets = (config.targets as string[]) || [];
  const legacySingle = (config.targetChat as string) || (config.to as string) || '';
  const targets: string[] =
    rawTargets.length > 0
      ? rawTargets
      : legacySingle
        ? [legacySingle]
        : [];

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/contacts?sessionId=${sessionId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setContacts(json.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const selectedContacts = targets.map((wppId) => {
    const c = contacts.find((ct) => ct.wppId === wppId);
    return { wppId, contact: c };
  });

  const filteredContacts = contacts.filter((c) => {
    if (targets.includes(c.wppId)) return false;
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(search);
  });

  function addTarget(wppId: string) {
    const next = [...targets, wppId];
    updateConfig('targets', next);
    // Clean up legacy fields to avoid confusion
    updateConfig('targetChat', undefined);
    updateConfig('to', undefined);
    setSearch('');
  }

  function removeTarget(wppId: string) {
    const next = targets.filter((t) => t !== wppId);
    updateConfig('targets', next);
  }

  return (
    <>
      <Field
        label="Forward to"
        hint={
          targets.length === 0
            ? 'Select one or more contacts to forward the triggering message to'
            : `${targets.length} recipient${targets.length > 1 ? 's' : ''} selected`
        }
      >
        {/* Selected contacts chips */}
        {selectedContacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {selectedContacts.map(({ wppId, contact }) => (
              <span
                key={wppId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-xs text-emerald-700 dark:text-emerald-400"
              >
                {contact?.profilePicUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={contact.profilePicUrl}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-[9px] font-semibold">
                    {(contact?.name || wppId).charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="font-medium">
                  {contact?.name || wppId.replace('@c.us', '')}
                </span>
                <button
                  type="button"
                  onClick={() => removeTarget(wppId)}
                  className="text-emerald-500 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Trigger to open picker */}
        {!showPicker ? (
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-900/50 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-emerald-400 text-gray-600 dark:text-zinc-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add recipient
          </button>
        ) : (
          <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-700">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts..."
                autoFocus
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-zinc-500 text-gray-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => {
                  setShowPicker(false);
                  setSearch('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {!sessionId ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  No session linked to this flow.
                </p>
              ) : loading ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  Loading contacts...
                </p>
              ) : filteredContacts.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-500 dark:text-zinc-400 text-center">
                  {search ? 'No contacts match your search.' : 'No more contacts available. Sync contacts from the Contacts page.'}
                </p>
              ) : (
                filteredContacts.slice(0, 50).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addTarget(c.wppId)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-700 text-left transition-colors"
                  >
                    {c.profilePicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.profilePicUrl}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">
                        {c.name || c.phone}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                        {c.phone}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Field>

      <HintBox text="The message that triggers this flow will be forwarded to every selected contact." />
    </>
  );
}

// ---- Typing Config ----

function TypingConfig({ config, updateConfig }: ConfigProps) {
  return (
    <Field label="Duration (seconds)">
      <SliderInput
        value={(config.duration as number) || 3}
        onChange={(v) => updateConfig('duration', v)}
        min={1}
        max={30}
      />
    </Field>
  );
}

// ---- Wait for Reply Config ----

function WaitForReplyConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Timeout (seconds)" hint="How long to wait before timing out">
        <NumberInput
          value={(config.timeout as number) || 60}
          onChange={(v) => updateConfig('timeout', v)}
          min={1}
          max={86400}
        />
      </Field>
      <Field label="Timeout Message" hint="Sent when no reply is received in time">
        <TextArea
          value={(config.timeoutMessage as string) || ''}
          onChange={(v) => updateConfig('timeoutMessage', v)}
          placeholder="Sorry, I didn't get a response in time."
          rows={3}
        />
      </Field>
    </>
  );
}

// ---- AI Model Selector (shared) ----

const AI_MODELS = [
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku',    label: 'Claude 3 Haiku' },
  { value: 'gpt-4o',           label: 'GPT-4o' },
  { value: 'gpt-4o-mini',      label: 'GPT-4o Mini' },
];

// ---- AI Agent Config ----

function AiAgentConfig({ config, updateConfig }: ConfigProps) {
  const mcpTools = [
    'web-search', 'read-file', 'write-file', 'execute-code',
    'http-request', 'database', 'calendar', 'email', 'slack', 'github',
  ];
  const selectedTools: string[] = Array.isArray(config.mcpTools) ? (config.mcpTools as string[]) : [];

  function toggleTool(tool: string) {
    const next = selectedTools.includes(tool)
      ? selectedTools.filter((t) => t !== tool)
      : [...selectedTools, tool];
    updateConfig('mcpTools', next);
  }

  return (
    <>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'claude-3-5-sonnet'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
      <Field label="System Prompt" hint="Instructions that define the agent behavior">
        <TextArea
          value={(config.systemPrompt as string) || ''}
          onChange={(v) => updateConfig('systemPrompt', v)}
          placeholder="You are a helpful assistant that can browse the web and answer questions…"
          rows={5}
        />
      </Field>
      <Field label="MCP Tools" hint="Tools available to the autonomous agent">
        <div className="flex flex-wrap gap-1.5">
          {mcpTools.map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => toggleTool(tool)}
              className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                selectedTools.includes(tool)
                  ? 'bg-sky-800 text-white border-sky-800'
                  : 'bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-sky-400 hover:text-sky-700 dark:hover:border-sky-500 dark:hover:text-sky-400'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Max Iterations" hint="Maximum number of tool calls per run">
        <NumberInput
          value={(config.maxIterations as number) || 10}
          onChange={(v) => updateConfig('maxIterations', v)}
          min={1}
          max={50}
          placeholder="10"
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the agent's final answer">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="agentResult"
        />
      </Field>
    </>
  );
}

// ---- AI Classifier Config ----

function AiClassifierConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the text to classify">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{message}}"
        />
      </Field>
      <Field label="Categories" hint="Comma-separated list of categories">
        <TextInput
          value={(config.categories as string) || ''}
          onChange={(v) => updateConfig('categories', v)}
          placeholder="positive, negative, neutral"
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the detected category">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="category"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- AI Extractor Config ----

function AiExtractorConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the text to extract from">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{message}}"
        />
      </Field>
      <Field label="Fields to Extract" hint="One per line: fieldName: description">
        <TextArea
          value={(config.fields as string) || ''}
          onChange={(v) => updateConfig('fields', v)}
          placeholder={"name: Full name of the person\nemail: Email address\nphone: Phone number"}
          rows={5}
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the extracted data (JSON object)">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="extractedData"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- AI Summarizer Config ----

function AiSummarizerConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the text to summarize">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{message}}"
        />
      </Field>
      <Field label="Max Length (words)" hint="Maximum number of words in the summary">
        <NumberInput
          value={(config.maxLength as number) || 100}
          onChange={(v) => updateConfig('maxLength', v)}
          min={10}
          max={1000}
          placeholder="100"
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the summary">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="summary"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- AI Sentiment Config ----

function AiSentimentConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the text to analyze">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{message}}"
        />
      </Field>
      <Field label="Output Variable" hint="Stores: positive/negative/neutral + confidence score">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="sentiment"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- AI Translator Config ----

function AiTranslatorConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the text to translate">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{message}}"
        />
      </Field>
      <Field label="Target Language">
        <SelectInput
          value={(config.targetLanguage as string) || 'English'}
          onChange={(v) => updateConfig('targetLanguage', v)}
          options={[
            { value: 'French',     label: 'French' },
            { value: 'English',    label: 'English' },
            { value: 'Spanish',    label: 'Spanish' },
            { value: 'Portuguese', label: 'Portuguese' },
            { value: 'Arabic',     label: 'Arabic' },
            { value: 'Chinese',    label: 'Chinese' },
            { value: 'German',     label: 'German' },
            { value: 'Italian',    label: 'Italian' },
            { value: 'Japanese',   label: 'Japanese' },
            { value: 'Russian',    label: 'Russian' },
          ]}
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the translated text">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="translatedText"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o-mini'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- AI Vision Config ----

function AiVisionConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Input Variable" hint="Variable containing the image URL to analyze">
        <TextInput
          value={(config.inputVariable as string) || ''}
          onChange={(v) => updateConfig('inputVariable', v)}
          placeholder="{{mediaUrl}}"
        />
      </Field>
      <Field label="Prompt / Question" hint="What do you want to know about the image?">
        <TextArea
          value={(config.prompt as string) || ''}
          onChange={(v) => updateConfig('prompt', v)}
          placeholder="Describe what you see in this image."
          rows={4}
        />
      </Field>
      <Field label="Output Variable" hint="Variable to store the AI vision response">
        <TextInput
          value={(config.outputVariable as string) || ''}
          onChange={(v) => updateConfig('outputVariable', v)}
          placeholder="visionResult"
        />
      </Field>
      <Field label="Model">
        <SelectInput
          value={(config.model as string) || 'gpt-4o'}
          onChange={(v) => updateConfig('model', v)}
          options={AI_MODELS}
        />
      </Field>
    </>
  );
}

// ---- LLM Config ----

const LLM_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  'llm-claude': [
    { value: 'claude-opus-4-5',       label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5',     label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-3-5',      label: 'Claude Haiku 3.5' },
    { value: 'claude-3-5-sonnet',     label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-haiku',        label: 'Claude 3 Haiku' },
  ],
  'llm-openai': [
    { value: 'gpt-4o',           label: 'GPT-4o' },
    { value: 'gpt-4o-mini',      label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo',      label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo',    label: 'GPT-3.5 Turbo' },
  ],
  'llm-gemini': [
    { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  'llm-ollama': [
    { value: 'llama3.2',         label: 'Llama 3.2' },
    { value: 'llama3.1',         label: 'Llama 3.1' },
    { value: 'mistral',          label: 'Mistral' },
    { value: 'codellama',        label: 'Code Llama' },
    { value: 'phi3',             label: 'Phi-3' },
  ],
};

function LlmConfig({ config, updateConfig, nodeType }: ConfigProps & { nodeType: string }) {
  const modelOptions = LLM_MODEL_OPTIONS[nodeType] || [];
  const defaultModel = modelOptions[0]?.value || '';

  return (
    <>
      <Field label="Model" hint="The specific model version to use">
        <SelectInput
          value={(config.model as string) || defaultModel}
          onChange={(v) => updateConfig('model', v)}
          options={modelOptions}
        />
      </Field>
      <Field label="Temperature" hint="Controls randomness (0 = deterministic, 1 = creative)">
        <NumberInput
          value={(config.temperature as number) ?? 0.7}
          onChange={(v) => updateConfig('temperature', v)}
          min={0}
          max={1}
          placeholder="0.7"
        />
      </Field>
      <Field label="Max Tokens" hint="Maximum tokens to generate in the response">
        <NumberInput
          value={(config.maxTokens as number) || 1024}
          onChange={(v) => updateConfig('maxTokens', v)}
          min={1}
          max={8192}
          placeholder="1024"
        />
      </Field>
      {nodeType === 'llm-claude' && (
        <Field label="API Key" hint="Your Anthropic API key (leave blank to use server default)">
          <TextInput
            value={(config.apiKey as string) || ''}
            onChange={(v) => updateConfig('apiKey', v)}
            placeholder="sk-ant-..."
          />
        </Field>
      )}
      {nodeType === 'llm-openai' && (
        <Field label="API Key" hint="Your OpenAI API key (leave blank to use server default)">
          <TextInput
            value={(config.apiKey as string) || ''}
            onChange={(v) => updateConfig('apiKey', v)}
            placeholder="sk-..."
          />
        </Field>
      )}
      {nodeType === 'llm-gemini' && (
        <Field label="API Key" hint="Your Google AI API key (leave blank to use server default)">
          <TextInput
            value={(config.apiKey as string) || ''}
            onChange={(v) => updateConfig('apiKey', v)}
            placeholder="AIza..."
          />
        </Field>
      )}
      {nodeType === 'llm-ollama' && (
        <Field label="Base URL" hint="URL of your local Ollama instance">
          <TextInput
            value={(config.baseUrl as string) || 'http://localhost:11434'}
            onChange={(v) => updateConfig('baseUrl', v)}
            placeholder="http://localhost:11434"
          />
        </Field>
      )}
    </>
  );
}

// ---- Memory Configs ----

function MemoryBufferConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Buffer Size" hint="Number of recent messages to keep in memory">
        <NumberInput
          value={(config.bufferSize as number) || 20}
          onChange={(v) => updateConfig('bufferSize', v)}
          min={1}
          max={200}
          placeholder="20"
        />
      </Field>
      <Field label="Memory Key" hint="Variable name used to store and retrieve memory">
        <TextInput
          value={(config.memoryKey as string) || 'chat_history'}
          onChange={(v) => updateConfig('memoryKey', v)}
          placeholder="chat_history"
        />
      </Field>
    </>
  );
}

function MemoryVectorConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Collection Name" hint="Name of the vector store collection">
        <TextInput
          value={(config.collection as string) || ''}
          onChange={(v) => updateConfig('collection', v)}
          placeholder="my_memory"
        />
      </Field>
      <Field label="Top K Results" hint="Number of similar memories to retrieve">
        <NumberInput
          value={(config.topK as number) || 5}
          onChange={(v) => updateConfig('topK', v)}
          min={1}
          max={50}
          placeholder="5"
        />
      </Field>
      <Field label="Embedding Model" hint="Model used to create embeddings">
        <SelectInput
          value={(config.embeddingModel as string) || 'text-embedding-3-small'}
          onChange={(v) => updateConfig('embeddingModel', v)}
          options={[
            { value: 'text-embedding-3-small', label: 'OpenAI text-embedding-3-small' },
            { value: 'text-embedding-3-large', label: 'OpenAI text-embedding-3-large' },
            { value: 'text-embedding-ada-002',  label: 'OpenAI ada-002' },
          ]}
        />
      </Field>
    </>
  );
}

function MemoryWindowConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Window Size" hint="Number of conversation turns to keep in the sliding window">
        <NumberInput
          value={(config.windowSize as number) || 10}
          onChange={(v) => updateConfig('windowSize', v)}
          min={1}
          max={100}
          placeholder="10"
        />
      </Field>
      <Field label="Memory Key" hint="Variable name used to store and retrieve memory">
        <TextInput
          value={(config.memoryKey as string) || 'chat_history'}
          onChange={(v) => updateConfig('memoryKey', v)}
          placeholder="chat_history"
        />
      </Field>
    </>
  );
}

// ---- Tool Configs ----

function ToolCodeConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Language" hint="Programming language to execute">
        <SelectInput
          value={(config.language as string) || 'javascript'}
          onChange={(v) => updateConfig('language', v)}
          options={[
            { value: 'javascript', label: 'JavaScript' },
            { value: 'python',     label: 'Python' },
          ]}
        />
      </Field>
      <Field label="Timeout (ms)" hint="Maximum execution time in milliseconds">
        <NumberInput
          value={(config.timeout as number) || 5000}
          onChange={(v) => updateConfig('timeout', v)}
          min={100}
          max={30000}
          placeholder="5000"
        />
      </Field>
    </>
  );
}

function ToolHttpConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Base URL" hint="Default base URL for API requests (optional)">
        <TextInput
          value={(config.url as string) || ''}
          onChange={(v) => updateConfig('url', v)}
          placeholder="https://api.example.com"
        />
      </Field>
      <Field label="Auth Header" hint="Authorization header value (e.g. Bearer token)">
        <TextInput
          value={(config.authHeader as string) || ''}
          onChange={(v) => updateConfig('authHeader', v)}
          placeholder="Bearer your-token"
        />
      </Field>
    </>
  );
}

function ToolSearchConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Provider" hint="Search provider to use">
        <SelectInput
          value={(config.provider as string) || 'tavily'}
          onChange={(v) => updateConfig('provider', v)}
          options={[
            { value: 'tavily',     label: 'Tavily' },
            { value: 'serper',     label: 'Serper' },
            { value: 'brave',      label: 'Brave Search' },
          ]}
        />
      </Field>
      <Field label="API Key" hint="API key for the search provider">
        <TextInput
          value={(config.apiKey as string) || ''}
          onChange={(v) => updateConfig('apiKey', v)}
          placeholder="tvly-..."
        />
      </Field>
      <Field label="Max Results" hint="Maximum number of search results to return">
        <NumberInput
          value={(config.maxResults as number) || 5}
          onChange={(v) => updateConfig('maxResults', v)}
          min={1}
          max={20}
          placeholder="5"
        />
      </Field>
    </>
  );
}

function ToolMcpConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Server URL" hint="URL of the MCP server to connect to">
        <TextInput
          value={(config.serverUrl as string) || ''}
          onChange={(v) => updateConfig('serverUrl', v)}
          placeholder="http://localhost:3001"
        />
      </Field>
      <Field label="Tool Name" hint="Specific tool name to expose (leave blank for all tools)">
        <TextInput
          value={(config.toolName as string) || ''}
          onChange={(v) => updateConfig('toolName', v)}
          placeholder="my_tool"
        />
      </Field>
    </>
  );
}

const WPP_CAPABILITIES = [
  { key: 'messaging', label: 'Messaging',  description: 'Send & receive messages' },
  { key: 'media',     label: 'Media',      description: 'Images, files, audio, video' },
  { key: 'groups',    label: 'Groups',     description: 'Create & manage groups' },
  { key: 'labels',    label: 'Labels',     description: 'Assign & manage labels' },
  { key: 'contacts',  label: 'Contacts',   description: 'Access contact list' },
  { key: 'status',    label: 'Status',     description: 'View & post status updates' },
  { key: 'profile',   label: 'Profile',    description: 'Update profile info & picture' },
];

function WppConnectAllConfig({ config, updateConfig }: ConfigProps) {
  const allEnabled = (config.allCapabilities as boolean) !== false;
  const enabled = (config.capabilities as Record<string, boolean>) || {};

  function toggleAll(v: boolean) {
    updateConfig('allCapabilities', v);
  }

  function toggleCap(key: string, v: boolean) {
    updateConfig('capabilities', { ...enabled, [key]: v });
  }

  return (
    <>
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/20 p-3 mb-2">
        <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-snug">
          This node grants the AI Agent full access to all WPPConnect methods — acting like an MCP server for your WhatsApp account. The agent can send messages, manage groups, handle labels, and more.
        </p>
      </div>
      <Field label="Capabilities">
        <label className="flex items-center gap-2.5 py-2 cursor-pointer border-b border-slate-100 dark:border-zinc-700 mb-2">
          <input
            type="checkbox"
            checked={allEnabled}
            onChange={(e) => toggleAll(e.target.checked)}
            className="rounded border-slate-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500"
          />
          <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">All capabilities</span>
        </label>
        <div className="space-y-1">
          {WPP_CAPABILITIES.map(({ key, label, description }) => (
            <label key={key} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allEnabled || (enabled[key] !== false && enabled[key] !== undefined ? !!enabled[key] : false)}
                disabled={allEnabled}
                onChange={(e) => toggleCap(key, e.target.checked)}
                className="mt-0.5 rounded border-slate-300 dark:border-zinc-600 text-emerald-500 focus:ring-emerald-500 disabled:opacity-40"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">{label}</div>
                <div className="text-[10px] text-slate-400 dark:text-zinc-500 leading-tight">{description}</div>
              </div>
            </label>
          ))}
        </div>
      </Field>
    </>
  );
}
