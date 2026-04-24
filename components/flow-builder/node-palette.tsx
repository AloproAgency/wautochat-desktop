'use client';

import { useState, type DragEvent } from 'react';
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
  Type,
  FileText,
  Headphones,
  Video,
  MapPin,
  Contact,
  Smile,
  List,
  BarChart3,
  LayoutGrid,
  SmilePlus,
  Forward,
  CheckCheck,
  Keyboard,
  Tag,
  TagsIcon,
  UserMinus,
  Ban,
  ShieldCheck,
  GitBranch,
  Timer,
  Variable,
  Globe,
  BrainCircuit,
  ExternalLink,
  MessageCircle,
  CircleStop,
  Search,
  X,
  PhoneIncoming,
  Wifi,
  Plus,
} from 'lucide-react';
import type { FlowNodeType } from '@/lib/types';

interface PaletteItem {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: React.ElementType;
  category: 'Triggers' | 'Messages' | 'Actions' | 'Logic';
  nodeCategory: string;
  triggerCategory?: string;
}

const paletteItems: PaletteItem[] = [
  // Triggers
  { type: 'trigger', label: 'Discussion',   description: 'Any message: private, group, broadcast, media, keyword, regex…', icon: MessageSquare, category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'message' },
  { type: 'trigger', label: 'Status',        description: 'Contact presence: online, offline, typing, recording…',           icon: Wifi,          category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'presence' },
  { type: 'trigger', label: 'Group Event',   description: 'Added to group, participant joined/left…',                        icon: Users,         category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'group_event' },
  { type: 'trigger', label: 'Labels',        description: 'Label created, updated, removed, assigned or unassigned',         icon: Tag,           category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'label' },
  { type: 'trigger', label: 'Call',          description: 'Incoming, outgoing, or missed call (voice/video)',                icon: PhoneIncoming, category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'call' },
  { type: 'trigger', label: 'Webhook',       description: 'Triggered by an external system calling your webhook URL',        icon: Webhook,       category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'system' },
  { type: 'trigger', label: 'Schedule',      description: 'Runs at specific times (cron: daily, weekly, hourly…)',           icon: Clock,         category: 'Triggers', nodeCategory: 'trigger', triggerCategory: 'schedule' },
  // Messages
  { type: 'send-message',  label: 'Send Text',     description: 'Send a text message',               icon: Type,       category: 'Messages', nodeCategory: 'message' },
  { type: 'send-image',    label: 'Send Image',    description: 'Send an image with caption',         icon: Image,      category: 'Messages', nodeCategory: 'message' },
  { type: 'send-file',     label: 'Send File',     description: 'Send a document or file',            icon: FileText,   category: 'Messages', nodeCategory: 'message' },
  { type: 'send-audio',    label: 'Send Audio',    description: 'Send an audio message',              icon: Headphones, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-video',    label: 'Send Video',    description: 'Send a video with caption',          icon: Video,      category: 'Messages', nodeCategory: 'message' },
  { type: 'send-location', label: 'Send Location', description: 'Send a map location pin',           icon: MapPin,     category: 'Messages', nodeCategory: 'message' },
  { type: 'send-contact',  label: 'Send Contact',  description: 'Share a contact card',               icon: Contact,    category: 'Messages', nodeCategory: 'message' },
  { type: 'send-sticker',  label: 'Send Sticker',  description: 'Send a sticker message',             icon: Smile,      category: 'Messages', nodeCategory: 'message' },
  { type: 'send-list',     label: 'Send List',     description: 'Send an interactive list menu',      icon: List,       category: 'Messages', nodeCategory: 'message' },
  { type: 'send-poll',     label: 'Send Poll',     description: 'Send a poll with options',           icon: BarChart3,  category: 'Messages', nodeCategory: 'message' },
  { type: 'send-buttons',  label: 'Send Buttons',  description: 'Send a message with buttons',        icon: LayoutGrid, category: 'Messages', nodeCategory: 'message' },
  // Actions
  { type: 'send-reaction',    label: 'Add Reaction',      description: 'React to a message with emoji',   icon: SmilePlus,  category: 'Actions', nodeCategory: 'action' },
  { type: 'forward-message',  label: 'Forward Message',   description: 'Forward to another chat',         icon: Forward,    category: 'Actions', nodeCategory: 'action' },
  { type: 'mark-as-read',     label: 'Mark as Read',      description: 'Mark the message as read',        icon: CheckCheck, category: 'Actions', nodeCategory: 'action' },
  { type: 'typing-indicator', label: 'Typing Indicator',  description: 'Show typing status briefly',      icon: Keyboard,   category: 'Actions', nodeCategory: 'action' },
  { type: 'assign-label',     label: 'Assign Label',      description: 'Add a label to the contact',      icon: Tag,        category: 'Actions', nodeCategory: 'action' },
  { type: 'remove-label',     label: 'Remove Label',      description: 'Remove a label from contact',     icon: TagsIcon,   category: 'Actions', nodeCategory: 'action' },
  { type: 'add-to-group',     label: 'Add to Group',      description: 'Add contact to a group',          icon: UserPlus,   category: 'Actions', nodeCategory: 'action' },
  { type: 'remove-from-group',label: 'Remove from Group', description: 'Remove contact from group',       icon: UserMinus,  category: 'Actions', nodeCategory: 'action' },
  { type: 'block-contact',    label: 'Block Contact',     description: 'Block a contact',                 icon: Ban,        category: 'Actions', nodeCategory: 'action' },
  { type: 'unblock-contact',  label: 'Unblock Contact',   description: 'Unblock a blocked contact',       icon: ShieldCheck,category: 'Actions', nodeCategory: 'action' },
  // Logic
  { type: 'condition',     label: 'Condition',      description: 'Branch based on conditions',          icon: GitBranch,   category: 'Logic', nodeCategory: 'condition' },
  { type: 'delay',         label: 'Delay',          description: 'Wait before continuing',              icon: Timer,       category: 'Logic', nodeCategory: 'delay' },
  { type: 'set-variable',  label: 'Set Variable',   description: 'Store a value in a variable',        icon: Variable,    category: 'Logic', nodeCategory: 'logic' },
  { type: 'http-request',  label: 'HTTP Request',   description: 'Make an API call',                   icon: Globe,       category: 'Logic', nodeCategory: 'logic' },
  { type: 'ai-response',   label: 'AI Response',    description: 'Generate AI-powered reply',          icon: BrainCircuit,category: 'Logic', nodeCategory: 'logic' },
  { type: 'go-to-flow',    label: 'Go to Flow',     description: 'Jump to another flow',               icon: ExternalLink,category: 'Logic', nodeCategory: 'logic' },
  { type: 'wait-for-reply',label: 'Wait for Reply', description: 'Pause until user replies',           icon: MessageCircle,category: 'Logic', nodeCategory: 'logic' },
  { type: 'end',           label: 'End',            description: 'End the flow execution',             icon: CircleStop,  category: 'Logic', nodeCategory: 'logic' },
];

const triggerTypeMap: Record<string, string> = {
  'Discussion':  'message_received',
  'Status':      'presence_changed',
  'Group Event': 'added_to_group',
  'Labels':      'label_assigned',
  'Call':        'incoming_call',
  'Webhook':     'webhook',
  'Schedule':    'schedule',
};

export const triggerCategoryMap: Record<string, string> = {
  message_received: 'message', keyword: 'message', regex: 'message',
  direct_message: 'message', group_message: 'message', contact_message: 'message',
  new_contact: 'message', media_received: 'message', sticker_received: 'message',
  location_received: 'message', contact_card_received: 'message', link_received: 'message',
  mention_received: 'message', reply_received: 'message', reaction_received: 'message',
  poll_response: 'message', message_edited: 'message', message_deleted: 'message',
  message_read: 'message',
  presence_changed: 'presence',
  added_to_group: 'group_event', group_joined: 'group_event', group_left: 'group_event',
  label_created: 'label', label_updated: 'label', label_deleted: 'label',
  label_assigned: 'label', label_unassigned: 'label',
  incoming_call: 'call',
  webhook: 'system',
  schedule: 'schedule',
};

type TabCategory = 'All' | 'Triggers' | 'Messages' | 'Actions' | 'Logic';

interface CategoryColor {
  text: string;
  bg: string;
  activeBg: string;
  from: string;
  to: string;
}

const categoryColors: Record<string, CategoryColor> = {
  Triggers: { text: 'text-green-800',  bg: 'bg-green-100',  activeBg: 'bg-green-700',  from: '#15803d', to: '#22c55e' },
  Messages: { text: 'text-zinc-800',   bg: 'bg-zinc-100',   activeBg: 'bg-zinc-900',   from: '#09090b', to: '#3f3f46' },
  Actions:  { text: 'text-violet-800', bg: 'bg-violet-100', activeBg: 'bg-violet-800', from: '#5b21b6', to: '#7c3aed' },
  Logic:    { text: 'text-orange-800', bg: 'bg-orange-100', activeBg: 'bg-orange-700', from: '#c2410c', to: '#ea580c' },
};

const tabActiveClass: Record<TabCategory, string> = {
  All:      'bg-slate-900 text-white shadow-sm',
  Triggers: 'bg-green-700 text-white shadow-sm shadow-green-300',
  Messages: 'bg-zinc-900 text-white shadow-sm shadow-zinc-300',
  Actions:  'bg-violet-800 text-white shadow-sm shadow-violet-300',
  Logic:    'bg-orange-700 text-white shadow-sm shadow-orange-300',
};

interface NodePaletteProps {
  mode?: 'sidebar' | 'overlay';
  onClose?: () => void;
  onItemSelect?: (item: PaletteItem) => void;
}

// ─── NodeCard ────────────────────────────────────────────────────────────────

function NodeCard({
  item,
  color,
  onDragStart,
  onClick,
}: {
  item: PaletteItem;
  color: CategoryColor;
  onDragStart: (e: DragEvent<HTMLDivElement>, item: PaletteItem) => void;
  onClick?: (item: PaletteItem) => void;
}) {
  const Icon = item.icon;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onClick={() => onClick?.(item)}
      className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-grab active:cursor-grabbing hover:bg-slate-50 active:scale-[0.98] transition-all group border border-transparent hover:border-slate-100 hover:shadow-sm"
    >
      {/* Colored left accent on hover */}
      <div
        className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: color.to }}
      />

      {/* Gradient icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform"
        style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-slate-800 leading-tight">{item.label}</div>
        <div className="text-[10px] text-slate-500 leading-tight truncate mt-0.5">{item.description}</div>
      </div>

      {/* Add button — appears on hover */}
      <div className="w-5 h-5 rounded-full bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-all">
        <Plus className="w-3 h-3 text-slate-500" />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NodePalette({ mode = 'sidebar', onClose, onItemSelect }: NodePaletteProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TabCategory>('All');

  const filteredItems = paletteItems.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = !search || item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
    const matchesTab = activeCategory === 'All' || item.category === activeCategory;
    return matchesSearch && matchesTab;
  });

  const categories: TabCategory[] = ['Triggers', 'Messages', 'Actions', 'Logic'];

  const groupedItems = (activeCategory === 'All' ? categories : [activeCategory]).flatMap((cat) => {
    const items = filteredItems.filter((i) => i.category === cat);
    if (items.length === 0) return [];
    return [{ category: cat as TabCategory, color: categoryColors[cat], items }];
  });

  function onDragStart(e: DragEvent<HTMLDivElement>, item: PaletteItem) {
    const nodeData = {
      type: item.type,
      nodeCategory: item.nodeCategory,
      label: item.label,
      triggerType: triggerTypeMap[item.label] || undefined,
      triggerCategory: item.triggerCategory || undefined,
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleItemClick(item: PaletteItem) {
    onItemSelect?.(item);
  }

  const isOverlay = mode === 'overlay';

  // ── Overlay / mobile bottom-sheet ────────────────────────────────────────────
  if (isOverlay) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
        <div className="relative z-10 bg-white rounded-t-2xl flex flex-col" style={{ maxHeight: '78vh' }}>
          <div className="flex items-center justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-slate-200" />
          </div>
          <div className="px-4 pt-2 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Node</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Tap a node to add it to the canvas</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Search nodes…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 placeholder:text-slate-400 text-slate-700 transition-all"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-slate-400" /></button>}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(['All', ...categories] as TabCategory[]).map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all ${activeCategory === cat ? tabActiveClass[cat] : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6">
            {groupedItems.map((group) => (
              <div key={group.category} className="mb-2">
                {activeCategory === 'All' && (
                  <div className="flex items-center gap-2 px-1 py-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color.to }} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${group.color.text}`}>{group.category}</span>
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${group.color.bg} ${group.color.text}`}>{group.items.length}</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                      <button key={`${item.type}-${item.label}-${idx}`} onClick={() => handleItemClick(item)}
                        className="flex w-full items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${group.color.from}, ${group.color.to})` }}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{item.label}</div>
                          <div className="text-xs text-slate-400 truncate leading-tight mt-0.5">{item.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Search className="w-8 h-8 mb-3 opacity-30" />
                <span className="text-sm font-semibold">No nodes found</span>
                <span className="text-xs mt-1 opacity-60">Try a different search term</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Sidebar mode ─────────────────────────────────────────────────────────────
  return (
    <div className="h-full w-full flex flex-col bg-white border-r border-slate-200/80 select-none">

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-[13px] font-bold text-slate-900 tracking-tight">Components</h2>
          <span className="text-[10px] text-slate-500 font-medium tabular-nums">{paletteItems.length}</span>
        </div>
        <p className="text-[10px] text-slate-500 mb-3">Drag or click to add to canvas</p>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 focus:bg-white placeholder:text-slate-400 text-slate-700 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-200 transition-colors">
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs — flex-wrap so no scrolling */}
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {(['All', ...categories] as TabCategory[]).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
              activeCategory === cat
                ? tabActiveClass[cat]
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-100 mx-3 mb-1" />

      {/* Nodes list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {groupedItems.map(({ category, color, items }) => (
          <div key={category} className="mb-1">

            {/* Section header */}
            <div className="flex items-center gap-2 px-1.5 pt-3 pb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color.to }} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${color.text}`}>{category}</span>
              </div>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${color.to}25, transparent)` }} />
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${color.bg} ${color.text}`}>
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-0.5">
              {items.map((item) => (
                <NodeCard
                  key={`${item.type}-${item.triggerCategory || item.label}`}
                  item={item}
                  color={color}
                  onDragStart={onDragStart}
                  onClick={handleItemClick}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-[12px] font-semibold text-slate-500">No results for "{search}"</p>
            <p className="text-[11px] text-slate-400 mt-1">Try a different keyword</p>
          </div>
        )}
      </div>
    </div>
  );
}

export { paletteItems, triggerTypeMap };
export type { PaletteItem };
