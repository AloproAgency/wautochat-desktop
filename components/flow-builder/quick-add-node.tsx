'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  MessageSquare,
  Webhook,
  Clock,
  Type,
  Image,
  FileText,
  Headphones,
  Video,
  List,
  LayoutGrid,
  Keyboard,
  CheckCheck,
  Tag,
  GitBranch,
  Timer,
  Variable,
  Globe,
  BrainCircuit,
  MessageCircle,
  CircleStop,
} from 'lucide-react';

interface NodeItem {
  type: string;
  nodeCategory: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: string;
  triggerCategory?: string;
}

interface CategoryColor {
  from: string;
  to: string;
}

const categoryColors: Record<string, CategoryColor> = {
  Triggers: { from: '#15803d', to: '#16a34a' },
  Messages: { from: '#0f766e', to: '#0d9488' },
  Actions:  { from: '#3730a3', to: '#4f46e5' },
  Logic:    { from: '#6d28d9', to: '#7c3aed' },
};

const allNodes: NodeItem[] = [
  // Triggers
  { type: 'trigger', nodeCategory: 'trigger', label: 'Discussion',  description: 'Any message: private, group, keyword…', icon: MessageSquare, category: 'Triggers', triggerCategory: 'message' },
  { type: 'trigger', nodeCategory: 'trigger', label: 'Webhook',     description: 'Triggered by an external HTTP call', icon: Webhook,        category: 'Triggers', triggerCategory: 'system' },
  { type: 'trigger', nodeCategory: 'trigger', label: 'Schedule',    description: 'Runs at specific times (cron)', icon: Clock,            category: 'Triggers', triggerCategory: 'schedule' },
  // Messages
  { type: 'send-message', nodeCategory: 'message', label: 'Send Text',    description: 'Send a text message',              icon: Type,       category: 'Messages' },
  { type: 'send-image',   nodeCategory: 'message', label: 'Send Image',   description: 'Send an image with caption',       icon: Image,      category: 'Messages' },
  { type: 'send-file',    nodeCategory: 'message', label: 'Send File',    description: 'Send a document or file',          icon: FileText,   category: 'Messages' },
  { type: 'send-audio',   nodeCategory: 'message', label: 'Send Audio',   description: 'Send an audio message',            icon: Headphones, category: 'Messages' },
  { type: 'send-video',   nodeCategory: 'message', label: 'Send Video',   description: 'Send a video with caption',        icon: Video,      category: 'Messages' },
  { type: 'send-list',    nodeCategory: 'message', label: 'Send List',    description: 'Send an interactive list menu',    icon: List,       category: 'Messages' },
  { type: 'send-buttons', nodeCategory: 'message', label: 'Send Buttons', description: 'Send a message with buttons',      icon: LayoutGrid, category: 'Messages' },
  // Actions
  { type: 'typing-indicator', nodeCategory: 'action', label: 'Typing Indicator', description: 'Show typing status briefly',     icon: Keyboard,   category: 'Actions' },
  { type: 'mark-as-read',     nodeCategory: 'action', label: 'Mark as Read',     description: 'Mark the message as read',       icon: CheckCheck, category: 'Actions' },
  { type: 'assign-label',     nodeCategory: 'action', label: 'Assign Label',     description: 'Add a label to the contact',    icon: Tag,        category: 'Actions' },
  // Logic
  { type: 'condition',    nodeCategory: 'condition', label: 'Condition',     description: 'Branch based on conditions',          icon: GitBranch,    category: 'Logic' },
  { type: 'delay',        nodeCategory: 'delay',     label: 'Delay',         description: 'Wait before continuing',              icon: Timer,        category: 'Logic' },
  { type: 'set-variable', nodeCategory: 'logic',     label: 'Set Variable',  description: 'Store a value in a variable',         icon: Variable,     category: 'Logic' },
  { type: 'http-request', nodeCategory: 'logic',     label: 'HTTP Request',  description: 'Make an API call',                    icon: Globe,        category: 'Logic' },
  { type: 'ai-response',  nodeCategory: 'logic',     label: 'AI Response',   description: 'Generate AI-powered reply',           icon: BrainCircuit, category: 'Logic' },
  { type: 'wait-for-reply', nodeCategory: 'logic',   label: 'Wait for Reply',description: 'Pause until user replies',            icon: MessageCircle, category: 'Logic' },
  { type: 'end',          nodeCategory: 'logic',     label: 'End',           description: 'End the flow execution',              icon: CircleStop,   category: 'Logic' },
];

const CATEGORIES = ['Triggers', 'Messages', 'Actions', 'Logic'] as const;

interface Props {
  x: number;
  y: number;
  onSelect: (item: { type: string; nodeCategory: string; label: string; triggerCategory?: string }) => void;
  onClose: () => void;
}

export function QuickAddNode({ x, y, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MENU_WIDTH = 240;
  const MENU_HEIGHT = 320;
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  const filtered = search.trim()
    ? allNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(search.toLowerCase()) ||
          n.description.toLowerCase().includes(search.toLowerCase())
      )
    : allNodes;

  const groupedItems = CATEGORIES.flatMap((cat) => {
    const items = filtered.filter((n) => n.category === cat);
    if (items.length === 0) return [];
    return [{ category: cat, color: categoryColors[cat], items }];
  });

  function handleSelect(item: NodeItem) {
    onSelect({
      type: item.type,
      nodeCategory: item.nodeCategory,
      label: item.label,
      triggerCategory: item.triggerCategory,
    });
    onClose();
  }

  useEffect(() => {
    // Auto-focus search on mount
    inputRef.current?.focus();

    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      style={{ left: clampedX, top: clampedY, width: 240, maxHeight: 320 }}
      className="fixed z-[1000] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[12px] text-slate-700 outline-none placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="shrink-0">
              <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Node list */}
      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
        {groupedItems.length > 0 ? (
          groupedItems.map(({ category, color, items }) => (
            <div key={category}>
              <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                {category}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type + item.label}
                    onClick={() => handleSelect(item)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
                    >
                      <Icon className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <span className="text-[12px] font-medium text-slate-700">{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Search className="w-6 h-6 mb-1.5 opacity-40" />
            <span className="text-[11px] font-medium">No nodes found</span>
          </div>
        )}
      </div>
    </div>
  );
}
