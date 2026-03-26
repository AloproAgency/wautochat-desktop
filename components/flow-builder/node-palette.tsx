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
} from 'lucide-react';
import type { FlowNodeType } from '@/lib/types';

interface PaletteItem {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: React.ElementType;
  category: 'Triggers' | 'Messages' | 'Actions' | 'Logic';
  nodeCategory: string;
}

const paletteItems: PaletteItem[] = [
  // Triggers
  { type: 'trigger', label: 'Message Received', description: 'Triggers when any message arrives', icon: MessageSquare, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Keyword Match', description: 'Triggers on specific keywords', icon: Key, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Regex Match', description: 'Triggers on pattern match', icon: Regex, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Media Received', description: 'Triggers on image, video, or audio', icon: Image, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'New Contact', description: 'Triggers when a new contact messages', icon: UserPlus, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Contact Message', description: 'Triggers for a specific contact', icon: UserCheck, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Group Message', description: 'Triggers on group chat messages', icon: Users, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Added to Group', description: 'Triggers when added to a group', icon: UserPlus, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Webhook', description: 'Triggers from an external webhook', icon: Webhook, category: 'Triggers', nodeCategory: 'trigger' },
  { type: 'trigger', label: 'Schedule', description: 'Triggers on a time schedule', icon: Clock, category: 'Triggers', nodeCategory: 'trigger' },
  // Messages
  { type: 'send-message', label: 'Send Text', description: 'Send a text message', icon: Type, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-image', label: 'Send Image', description: 'Send an image with caption', icon: Image, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-file', label: 'Send File', description: 'Send a document or file', icon: FileText, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-audio', label: 'Send Audio', description: 'Send an audio message', icon: Headphones, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-video', label: 'Send Video', description: 'Send a video with caption', icon: Video, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-location', label: 'Send Location', description: 'Send a map location pin', icon: MapPin, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-contact', label: 'Send Contact', description: 'Share a contact card', icon: Contact, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-sticker', label: 'Send Sticker', description: 'Send a sticker message', icon: Smile, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-list', label: 'Send List', description: 'Send an interactive list menu', icon: List, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-poll', label: 'Send Poll', description: 'Send a poll with options', icon: BarChart3, category: 'Messages', nodeCategory: 'message' },
  { type: 'send-buttons', label: 'Send Buttons', description: 'Send a message with buttons', icon: LayoutGrid, category: 'Messages', nodeCategory: 'message' },
  // Actions
  { type: 'send-reaction', label: 'Add Reaction', description: 'React to a message with emoji', icon: SmilePlus, category: 'Actions', nodeCategory: 'action' },
  { type: 'forward-message', label: 'Forward Message', description: 'Forward to another chat', icon: Forward, category: 'Actions', nodeCategory: 'action' },
  { type: 'mark-as-read', label: 'Mark as Read', description: 'Mark the message as read', icon: CheckCheck, category: 'Actions', nodeCategory: 'action' },
  { type: 'typing-indicator', label: 'Typing Indicator', description: 'Show typing status briefly', icon: Keyboard, category: 'Actions', nodeCategory: 'action' },
  { type: 'assign-label', label: 'Assign Label', description: 'Add a label to the contact', icon: Tag, category: 'Actions', nodeCategory: 'action' },
  { type: 'remove-label', label: 'Remove Label', description: 'Remove a label from contact', icon: TagsIcon, category: 'Actions', nodeCategory: 'action' },
  { type: 'add-to-group', label: 'Add to Group', description: 'Add contact to a group', icon: UserPlus, category: 'Actions', nodeCategory: 'action' },
  { type: 'remove-from-group', label: 'Remove from Group', description: 'Remove contact from group', icon: UserMinus, category: 'Actions', nodeCategory: 'action' },
  { type: 'block-contact', label: 'Block Contact', description: 'Block a contact', icon: Ban, category: 'Actions', nodeCategory: 'action' },
  { type: 'unblock-contact', label: 'Unblock Contact', description: 'Unblock a blocked contact', icon: ShieldCheck, category: 'Actions', nodeCategory: 'action' },
  // Logic
  { type: 'condition', label: 'Condition', description: 'Branch based on conditions', icon: GitBranch, category: 'Logic', nodeCategory: 'condition' },
  { type: 'delay', label: 'Delay', description: 'Wait before continuing', icon: Timer, category: 'Logic', nodeCategory: 'delay' },
  { type: 'set-variable', label: 'Set Variable', description: 'Store a value in a variable', icon: Variable, category: 'Logic', nodeCategory: 'logic' },
  { type: 'http-request', label: 'HTTP Request', description: 'Make an API call', icon: Globe, category: 'Logic', nodeCategory: 'logic' },
  { type: 'ai-response', label: 'AI Response', description: 'Generate AI-powered reply', icon: BrainCircuit, category: 'Logic', nodeCategory: 'logic' },
  { type: 'go-to-flow', label: 'Go to Flow', description: 'Jump to another flow', icon: ExternalLink, category: 'Logic', nodeCategory: 'logic' },
  { type: 'wait-for-reply', label: 'Wait for Reply', description: 'Pause until user replies', icon: MessageCircle, category: 'Logic', nodeCategory: 'logic' },
  { type: 'end', label: 'End', description: 'End the flow execution', icon: CircleStop, category: 'Logic', nodeCategory: 'logic' },
];

const triggerTypeMap: Record<string, string> = {
  'Message Received': 'message_received',
  'Keyword Match': 'keyword',
  'Regex Match': 'regex',
  'Media Received': 'media_received',
  'New Contact': 'new_contact',
  'Contact Message': 'contact_message',
  'Group Message': 'group_message',
  'Added to Group': 'added_to_group',
  'Webhook': 'webhook',
  'Schedule': 'schedule',
};

type TabCategory = 'All' | 'Triggers' | 'Messages' | 'Actions' | 'Logic';

const tabs: { label: TabCategory; color: string }[] = [
  { label: 'All', color: '#374151' },
  { label: 'Triggers', color: '#22c55e' },
  { label: 'Messages', color: '#0d9488' },
  { label: 'Actions', color: '#6366f1' },
  { label: 'Logic', color: '#8b5cf6' },
];

const categoryColors: Record<string, string> = {
  Triggers: '#22c55e',
  Messages: '#0d9488',
  Actions: '#6366f1',
  Logic: '#8b5cf6',
};

export default function NodePalette() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabCategory>('All');

  const filteredItems = paletteItems.filter((item) => {
    const matchesSearch = !search || item.label.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'All' || item.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const categories: TabCategory[] = ['Triggers', 'Messages', 'Actions', 'Logic'];
  const groupedItems = activeTab === 'All'
    ? categories.map((cat) => ({
        category: cat,
        items: filteredItems.filter((i) => i.category === cat),
      })).filter((g) => g.items.length > 0)
    : [{ category: activeTab, items: filteredItems }].filter((g) => g.items.length > 0);

  function onDragStart(e: DragEvent, item: PaletteItem) {
    const nodeData = {
      type: item.type,
      nodeCategory: item.nodeCategory,
      label: item.label,
      triggerType: triggerTypeMap[item.label] || undefined,
    };
    e.dataTransfer.setData('application/reactflow', JSON.stringify(nodeData));
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      style={{ width: 300 }}
      className="bg-white border-r border-gray-200 flex flex-col h-full shrink-0"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3
          style={{ fontSize: 16 }}
          className="font-bold text-gray-900 mb-3"
        >
          Nodes
        </h3>

        {/* Search */}
        <div className="relative mb-3">
          <Search
            style={{ width: 16, height: 16 }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 13 }}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-300 transition-all"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.label;
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                style={{
                  fontSize: 12,
                  backgroundColor: isActive ? tab.color : undefined,
                  color: isActive ? '#ffffff' : '#6b7280',
                }}
                className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-all shrink-0 ${
                  isActive
                    ? 'shadow-sm'
                    : 'hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groupedItems.map((group) => (
          <div key={group.category} className="mb-3">
            {/* Section header (only in All view) */}
            {activeTab === 'All' && (
              <div className="flex items-center gap-2 px-2 pt-2 pb-1.5">
                <div
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: categoryColors[group.category],
                  }}
                  className="rounded-full shrink-0"
                />
                <span
                  style={{ fontSize: 11, color: categoryColors[group.category] }}
                  className="font-bold uppercase tracking-wider"
                >
                  {group.category}
                </span>
                <div className="flex-1 border-t border-gray-100" />
                <span
                  style={{ fontSize: 10 }}
                  className="text-gray-400 font-medium"
                >
                  {group.items.length}
                </span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {group.items.map((item, idx) => {
                const Icon = item.icon;
                const color = categoryColors[item.category];
                return (
                  <div
                    key={`${item.type}-${item.label}-${idx}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors group"
                  >
                    <div
                      style={{
                        backgroundColor: color,
                        width: 36,
                        height: 36,
                      }}
                      className="rounded-full flex items-center justify-center shrink-0 shadow-sm"
                    >
                      <Icon
                        style={{ width: 18, height: 18 }}
                        className="text-white"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        style={{ fontSize: 13 }}
                        className="font-semibold text-gray-800 group-hover:text-gray-900 truncate leading-tight"
                      >
                        {item.label}
                      </div>
                      <div
                        style={{ fontSize: 11 }}
                        className="text-gray-400 group-hover:text-gray-500 truncate leading-tight mt-0.5"
                      >
                        {item.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Search style={{ width: 32, height: 32 }} className="mb-2 opacity-40" />
            <span style={{ fontSize: 13 }} className="font-medium">
              No nodes found
            </span>
            <span style={{ fontSize: 11 }} className="mt-0.5">
              Try a different search term
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
