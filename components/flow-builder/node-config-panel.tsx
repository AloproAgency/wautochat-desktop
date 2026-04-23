'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';

// Node type to icon/color mapping for the header
const nodeIconConfig: Record<string, { icon: React.ElementType; bg: string }> = {
  'trigger': { icon: MessageSquare, bg: '#22c55e' },
  'send-message': { icon: Type, bg: '#075E54' },
  'send-image': { icon: ImageIcon, bg: '#075E54' },
  'send-file': { icon: FileText, bg: '#075E54' },
  'send-audio': { icon: Headphones, bg: '#075E54' },
  'send-video': { icon: Video, bg: '#075E54' },
  'send-location': { icon: MapPin, bg: '#075E54' },
  'send-contact': { icon: Contact, bg: '#075E54' },
  'send-sticker': { icon: Smile, bg: '#075E54' },
  'send-list': { icon: List, bg: '#075E54' },
  'send-poll': { icon: BarChart3, bg: '#075E54' },
  'send-buttons': { icon: LayoutGrid, bg: '#075E54' },
  'send-reaction': { icon: SmilePlus, bg: '#6366f1' },
  'forward-message': { icon: Forward, bg: '#6366f1' },
  'mark-as-read': { icon: CheckCheck, bg: '#6366f1' },
  'typing-indicator': { icon: Keyboard, bg: '#6366f1' },
  'assign-label': { icon: Tag, bg: '#6366f1' },
  'remove-label': { icon: TagsIcon, bg: '#6366f1' },
  'add-to-group': { icon: UserPlus, bg: '#6366f1' },
  'remove-from-group': { icon: UserMinus, bg: '#6366f1' },
  'block-contact': { icon: Ban, bg: '#6366f1' },
  'unblock-contact': { icon: ShieldCheck, bg: '#6366f1' },
  'condition': { icon: GitBranch, bg: '#f59e0b' },
  'delay': { icon: Timer, bg: '#8b5cf6' },
  'set-variable': { icon: Variable, bg: '#8b5cf6' },
  'http-request': { icon: Globe, bg: '#8b5cf6' },
  'ai-response': { icon: BrainCircuit, bg: '#8b5cf6' },
  'go-to-flow': { icon: ExternalLink, bg: '#8b5cf6' },
  'end': { icon: CircleStop, bg: '#8b5cf6' },
  'wait-for-reply': { icon: Clock, bg: '#8b5cf6' },
};

interface NodeConfigPanelProps {
  node: Node<FlowNodeData> | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: FlowNodeData) => void;
  onDelete: (nodeId: string) => void;
}

export default function NodeConfigPanel({
  node,
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
  const iconCfg = nodeIconConfig[nodeType] || { icon: CircleStop, bg: '#6b7280' };
  const HeaderIcon = iconCfg.icon;

  return (
    <div
      className="bg-white border-l border-gray-200 flex flex-col h-full shrink-0"
      style={{
        width: 380,
        animation: 'slideInFromRight 0.2s ease-out',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/50">
        <div
          style={{ backgroundColor: iconCfg.bg }}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm"
        >
          <HeaderIcon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            Configure: {node.data.label}
          </h3>
          <p className="text-xs text-gray-500 truncate capitalize">
            {nodeType.replace(/-/g, ' ')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Node Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
          />
        </div>

        <div className="w-full h-px bg-gray-100" />

        {/* Type-specific config */}
        {renderConfigForm(nodeType, config, updateConfig)}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-100 flex items-center gap-2">
        {/* Delete on left */}
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}

        {/* Cancel + Save on right */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Config form router ----

function renderConfigForm(
  nodeType: FlowNodeType,
  config: Record<string, unknown>,
  updateConfig: (key: string, value: unknown) => void
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
    case 'assign-label':
    case 'remove-label':
      return <LabelConfig config={config} updateConfig={updateConfig} />;
    case 'add-to-group':
    case 'remove-from-group':
      return <GroupConfig config={config} updateConfig={updateConfig} />;
    case 'go-to-flow':
      return <GoToFlowConfig config={config} updateConfig={updateConfig} />;
    case 'send-reaction':
      return <ReactionConfig config={config} updateConfig={updateConfig} />;
    case 'forward-message':
      return <ForwardConfig config={config} updateConfig={updateConfig} />;
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
    default:
      return <InfoText text="No configuration available for this node type." />;
  }
}

// ---- Shared field components ----

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
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
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
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
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 resize-none transition-all"
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
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
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
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
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
    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
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
              : 'bg-white text-gray-600 hover:bg-gray-50'
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
        {label && <span className="text-xs text-gray-500">{label}</span>}
        <span className="text-xs font-medium text-gray-900">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function InfoText({ text }: { text: string }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex items-start gap-2.5">
      <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
      <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
    </div>
  );
}

function HintBox({ text }: { text: string }) {
  return (
    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
      <p className="text-xs text-blue-600 leading-relaxed">{text}</p>
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
          className="px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
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
          className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-900 w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={() => {
            if (customVar.trim()) {
              onInsert(`{{${customVar.trim()}}}`);
              setCustomVar('');
            }
          }}
          className="px-2 py-1 text-xs font-medium rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
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
  message: 'Discussion',
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
    <div className="w-8 h-8 rounded-md bg-emerald-500 flex items-center justify-center shrink-0">
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
      {/* Category badge */}
      <div className="flex items-center gap-2 p-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg">
        <CategoryIcon category={triggerCategory} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-emerald-900">
            {categoryLabels[triggerCategory] || 'Discussion'}
          </div>
          <div className="text-xs text-emerald-700">
            {triggerCategory === 'message'
              ? 'Configurez les filtres ci-dessous'
              : `${availableOptions.length} événement${availableOptions.length > 1 ? 's' : ''}`}
          </div>
        </div>
      </div>

      {/* Trigger Type dropdown — only for non-Discussion categories */}
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
        <div className="text-xs text-gray-500 bg-gray-50 rounded-md p-2.5 leading-relaxed">
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
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 resize-none transition-all font-mono"
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
                  className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
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
            <div className="flex-1 px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 font-mono truncate">
              {webhookPath}
            </div>
            <button
              type="button"
              onClick={copyWebhookPath}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
              title="Copy path"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400" />
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
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-3">
        <div className="flex items-start gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">{title}</div>
            <div className="text-xs text-gray-500">{description}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Filter Selector Component ----

function TriggerFilters({ config, updateConfig }: ConfigProps) {
  const filters = (config.filters as Record<string, unknown>) || {};

  const updateFilter = (key: string, value: unknown) => {
    updateConfig('filters', { ...filters, [key]: value });
  };

  // ===== 4 FILTRES PRINCIPAUX =====
  // 1. Type de message (Message Type)
  // 2. Type de contenu (Content Type / Media Type)
  // 3. Type de discussion (Chat Type)
  // 4. Expéditeur (Sender)

  const messageTypeFilter = (filters.messageType as string) || 'any';
  const contentTypeFilter = (filters.mediaType as string) || 'none';
  const chatTypeFilter = (filters.chatType as string) || 'all';
  const senderFilter = (filters.sender as string) || '';

  const messageFilter = (filters.content as Record<string, unknown>) || {};
  const keywordFilter = (filters.keyword as Record<string, unknown>) || {};

  const messageTypeEnabled = messageTypeFilter !== 'any';
  const contentTypeEnabled = contentTypeFilter !== 'none';
  const chatTypeEnabled = chatTypeFilter !== 'all';
  const senderEnabled = senderFilter.length > 0;

  // Legacy hidden filters (kept for backward compat)
  const keywordEnabled = keywordFilter.enabled === true;
  const contentEnabled = messageFilter.enabled === true;

  const activeFiltersCount =
    (messageTypeEnabled ? 1 : 0) +
    (contentTypeEnabled ? 1 : 0) +
    (chatTypeEnabled ? 1 : 0) +
    (senderEnabled ? 1 : 0) +
    (keywordEnabled ? 1 : 0) +
    (contentEnabled ? 1 : 0);

  return (
    <>
      <div className="w-full h-px bg-gray-100" />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">Filtres</div>
          <div className="text-xs text-gray-500 mt-0.5">Affiner quand ce trigger se déclenche</div>
        </div>
        {activeFiltersCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
            {activeFiltersCount} actif{activeFiltersCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* 1. Type de message — WHAT EVENT happened */}
      <FilterBlock icon={Inbox} title="Type de message" description="Quel genre d'événement message">
        <SelectInput
          value={messageTypeFilter}
          onChange={(v) => updateFilter('messageType', v)}
          options={[
            { value: 'any', label: 'Tous les événements' },
            { value: 'new', label: 'Nouveau message reçu' },
            { value: 'reply', label: 'Réponse à mon message' },
            { value: 'mention', label: 'Mention (@moi)' },
            { value: 'reaction', label: 'Réaction' },
            { value: 'forwarded', label: 'Message transféré' },
            { value: 'quoted', label: 'Message cité' },
            { value: 'edited', label: 'Message modifié' },
            { value: 'deleted', label: 'Message supprimé' },
            { value: 'read', label: 'Message lu (coche bleue)' },
          ]}
        />
      </FilterBlock>

      {/* 2. Type de contenu — WHAT's in the message */}
      <FilterBlock icon={FileText} title="Type de contenu" description="Quel type de contenu est envoyé">
        <SelectInput
          value={contentTypeFilter}
          onChange={(v) => updateFilter('mediaType', v)}
          options={[
            { value: 'none', label: 'Aucun filtre (tout type)' },
            { value: 'text_only', label: 'Texte uniquement' },
            { value: 'any_media', label: 'Tout média (image/vidéo/audio/doc)' },
            { value: 'image', label: 'Images' },
            { value: 'video', label: 'Vidéos' },
            { value: 'audio', label: 'Audio / message vocal' },
            { value: 'document', label: 'Documents (PDF, Word, etc.)' },
            { value: 'location', label: 'Localisation' },
            { value: 'contact', label: 'Carte de contact' },
            { value: 'link', label: 'Lien / URL' },
            { value: 'poll', label: 'Sondage' },
          ]}
        />
      </FilterBlock>

      {/* 3. Type de discussion — WHERE */}
      <FilterBlock icon={MessageSquare} title="Type de discussion" description="Où ce trigger doit écouter">
        <SelectInput
          value={chatTypeFilter}
          onChange={(v) => updateFilter('chatType', v)}
          options={[
            { value: 'all', label: 'Toutes les discussions' },
            { value: 'private', label: 'Message privé uniquement' },
            { value: 'group', label: 'Groupe uniquement' },
            { value: 'broadcast', label: 'Liste de diffusion uniquement' },
            { value: 'private_or_group', label: 'Privé + Groupes (exclure diffusions)' },
          ]}
        />
        {chatTypeFilter === 'group' && (
          <div className="mt-2">
            <TextInput
              value={(filters.groupId as string) || ''}
              onChange={(v) => updateFilter('groupId', v)}
              placeholder="Groupe spécifique (optionnel): 120363xxx@g.us"
            />
          </div>
        )}
      </FilterBlock>

      {/* 4. Expéditeur — WHO */}
      <FilterBlock icon={UserIcon} title="Expéditeur" description="Filtrer par numéro ou liste de contacts (vide = tous)">
        <TextInput
          value={senderFilter}
          onChange={(v) => updateFilter('sender', v)}
          placeholder="22991234567 (séparer par virgule pour plusieurs)"
        />
      </FilterBlock>

      {/* 5. État du contact — WHO ELSE */}
      <FilterBlock icon={UserPlus} title="État du contact" description="Distinguer nouveaux et anciens contacts">
        <SelectInput
          value={(filters.contactStatus as string) || 'all'}
          onChange={(v) => updateFilter('contactStatus', v)}
          options={[
            { value: 'all', label: 'Tous les contacts' },
            { value: 'new', label: 'Nouveau contact uniquement (1er message)' },
            { value: 'existing', label: 'Contact existant uniquement' },
            { value: 'saved', label: 'Contact enregistré dans le carnet' },
            { value: 'unsaved', label: 'Contact non enregistré' },
            { value: 'labeled', label: 'Contact avec label spécifique' },
          ]}
        />
        {(filters.contactStatus as string) === 'labeled' && (
          <div className="mt-2">
            <TextInput
              value={(filters.contactLabel as string) || ''}
              onChange={(v) => updateFilter('contactLabel', v)}
              placeholder="Nom du label (ex: VIP, Prospect)"
            />
          </div>
        )}
      </FilterBlock>

      {/* BONUS: Keyword & content filters (collapsed by default) */}
      <details className="rounded-lg border border-gray-200 overflow-hidden">
        <summary className="p-3 cursor-pointer hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-gray-500" />
          Filtres avancés (mots-clés, regex…)
        </summary>
        <div className="p-3 border-t border-gray-200 bg-gray-50 space-y-3">
          {/* Keyword */}
          <div>
            <label className="flex items-center gap-2 mb-1.5 text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={keywordEnabled}
                onChange={(e) => updateFilter('keyword', { ...keywordFilter, enabled: e.target.checked })}
                className="rounded border-gray-300 text-emerald-500"
              />
              <Keyboard className="w-3.5 h-3.5 text-gray-500" />
              Mots-clés
            </label>
            {keywordEnabled && (
              <>
                <textarea
                  value={(keywordFilter.words as string) || ''}
                  onChange={(e) => updateFilter('keyword', { ...keywordFilter, words: e.target.value })}
                  placeholder={"bonjour\ncommande\nprix"}
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30 focus:border-emerald-400 resize-none font-mono"
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-gray-600">Mode:</span>
                  <SegmentedControl
                    value={(keywordFilter.mode as string) || 'contains'}
                    onChange={(v) => updateFilter('keyword', { ...keywordFilter, mode: v })}
                    options={[
                      { value: 'contains', label: 'Contient' },
                      { value: 'exact', label: 'Exact' },
                      { value: 'startsWith', label: 'Commence par' },
                    ]}
                  />
                </div>
              </>
            )}
          </div>

          {/* Content filter */}
          <div>
            <label className="flex items-center gap-2 mb-1.5 text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={contentEnabled}
                onChange={(e) => updateFilter('content', { ...messageFilter, enabled: e.target.checked })}
                className="rounded border-gray-300 text-emerald-500"
              />
              <FileText className="w-3.5 h-3.5 text-gray-500" />
              Contenu exact / regex
            </label>
            {contentEnabled && (
              <div className="space-y-1.5">
                <SelectInput
                  value={(messageFilter.operator as string) || 'contains'}
                  onChange={(v) => updateFilter('content', { ...messageFilter, operator: v })}
                  options={[
                    { value: 'contains', label: 'Contient' },
                    { value: 'equals', label: 'Égal à' },
                    { value: 'startsWith', label: 'Commence par' },
                    { value: 'endsWith', label: 'Finit par' },
                    { value: 'regex', label: 'Regex' },
                    { value: 'minLength', label: 'Longueur min.' },
                    { value: 'maxLength', label: 'Longueur max.' },
                  ]}
                />
                <TextInput
                  value={(messageFilter.value as string) || ''}
                  onChange={(v) => updateFilter('content', { ...messageFilter, value: v })}
                  placeholder="Valeur..."
                />
              </div>
            )}
          </div>
        </div>
      </details>

      {/* Advanced toggles (existing) */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-2">
        <div className="text-sm font-medium text-gray-900">⚙️ Advanced options</div>
        <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={(config.ignoreOwnMessages as boolean) !== false}
            onChange={(e) => updateConfig('ignoreOwnMessages', e.target.checked)}
            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
          />
          Ignore messages I send myself
        </label>
        <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={(config.ignoreForwarded as boolean) || false}
            onChange={(e) => updateConfig('ignoreForwarded', e.target.checked)}
            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
          />
          Ignore forwarded messages
        </label>
      </div>
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
        className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
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
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
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
          <span className="text-xs text-gray-400">{charCount} characters</span>
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
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
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
  const ext = fileExts[nodeType] || 'file';
  const url = (config.url as string) || '';

  return (
    <>
      <Field label={`${mediaLabel} URL`}>
        <TextInput
          value={url}
          onChange={(v) => updateConfig('url', v)}
          placeholder={`https://example.com/file.${ext}`}
        />
      </Field>

      {url && (nodeType === 'send-image' || nodeType === 'send-sticker') && (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
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

      <div className="w-full h-px bg-gray-100" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Sections</span>
          <button
            type="button"
            onClick={addSection}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Section
          </button>
        </div>

        {sections.map((section, sIdx) => (
          <div key={sIdx} className="border border-gray-200 rounded-lg p-3 space-y-2.5 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                placeholder={`Section ${sIdx + 1} title`}
                className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              <div key={rIdx} className="ml-3 border-l-2 border-gray-200 pl-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => updateRow(sIdx, rIdx, 'title', e.target.value)}
                    placeholder="Row title"
                    className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="text"
                  value={row.id}
                  onChange={(e) => updateRow(sIdx, rIdx, 'id', e.target.value)}
                  placeholder="Row ID"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRow(sIdx)}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium ml-3 transition-colors"
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
          <span className="text-xs font-medium text-gray-700">Choices</span>
          <button
            type="button"
            onClick={() => updateChoices([...choices, ''])}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Choice
          </button>
        </div>
        {choices.map((choice, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span
              className="text-xs font-medium text-gray-400 w-5 text-center shrink-0"
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
              className="flex-1 px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
        <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={(config.allowMultiple as boolean) || false}
            onChange={(e) => updateConfig('allowMultiple', e.target.checked)}
            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
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

      <div className="w-full h-px bg-gray-100" />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Buttons (max 3)</span>
          {buttons.length < 3 && (
            <button
              type="button"
              onClick={() => updateButtons([...buttons, { id: String(Date.now()), text: '' }])}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
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
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
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
                className="w-full px-2.5 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800 font-medium text-center">
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

      <div className="w-full h-px bg-gray-100" />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Headers</span>
          <button
            type="button"
            onClick={() => updateConfig('headers', [...headers, { key: '', value: '' }])}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
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
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
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

      <div className="w-full h-px bg-gray-100" />

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

      <div className="w-full h-px bg-gray-100" />

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

function GroupConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Group Name">
        <TextInput
          value={(config.groupName as string) || ''}
          onChange={(v) => updateConfig('groupName', v)}
          placeholder="Support Group"
        />
      </Field>
      <Field label="Group ID">
        <TextInput
          value={(config.groupId as string) || ''}
          onChange={(v) => updateConfig('groupId', v)}
          placeholder="123456789@g.us"
        />
      </Field>
    </>
  );
}

// ---- Go to Flow Config ----

function GoToFlowConfig({ config, updateConfig }: ConfigProps) {
  return (
    <>
      <Field label="Flow Name">
        <TextInput
          value={(config.flowName as string) || ''}
          onChange={(v) => updateConfig('flowName', v)}
          placeholder="Welcome Flow"
        />
      </Field>
      <Field label="Flow ID">
        <TextInput
          value={(config.flowId as string) || ''}
          onChange={(v) => updateConfig('flowId', v)}
          placeholder="flow-uuid"
        />
      </Field>
    </>
  );
}

// ---- Reaction Config ----

function ReactionConfig({ config, updateConfig }: ConfigProps) {
  return (
    <Field label="Reaction Emoji">
      <TextInput
        value={(config.emoji as string) || ''}
        onChange={(v) => updateConfig('emoji', v)}
        placeholder="e.g. thumbs up, heart"
        large
      />
    </Field>
  );
}

// ---- Forward Config ----

function ForwardConfig({ config, updateConfig }: ConfigProps) {
  return (
    <Field label="Target Chat ID">
      <TextInput
        value={(config.targetChat as string) || ''}
        onChange={(v) => updateConfig('targetChat', v)}
        placeholder="123456789@c.us"
      />
    </Field>
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
