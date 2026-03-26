'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Flow } from '@/lib/types';
import FlowCanvas from '@/components/flow-builder/flow-canvas';
import TestChat from '@/components/flow-builder/test-chat';
import {
  ArrowLeft,
  Check,
  Pencil,
  Power,
  PowerOff,
} from 'lucide-react';

interface FlowEditorClientProps {
  flow: Flow;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

export default function FlowEditorClient({ flow }: FlowEditorClientProps) {
  const router = useRouter();
  const [flowName, setFlowName] = useState(flow.name);
  const [isActive, setIsActive] = useState(flow.isActive);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [savedText, setSavedText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Responsive
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Update the saved text every 10 seconds
  useEffect(() => {
    if (!lastSaved) return;
    function update() {
      if (lastSaved) setSavedText(formatTimeAgo(lastSaved));
    }
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // Focus input when editing
  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingName]);

  const handleNameSave = useCallback(async () => {
    if (!flowName.trim() || flowName === flow.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await fetch(`/api/flows/${flow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: flowName }),
      });
    } catch (err) {
      console.error('Failed to save name:', err);
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  }, [flowName, flow.id, flow.name]);

  const handleToggleActive = useCallback(async () => {
    const newActive = !isActive;
    setIsActive(newActive);
    try {
      await fetch(`/api/flows/${flow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newActive }),
      });
    } catch (err) {
      console.error('Failed to toggle active:', err);
      setIsActive(!newActive);
    }
  }, [isActive, flow.id]);

  const handleSaveTimestamp = useCallback((ts: Date) => {
    setLastSaved(ts);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
      {/* Top bar */}
      <div
        className="bg-white border-b border-gray-200 flex items-center px-2 md:px-4 gap-2 md:gap-3 shrink-0"
        style={{ height: isMobile ? 48 : 56 }}
      >
        {/* Left side: back + name */}
        <button
          onClick={() => router.push('/flows')}
          className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          title="Back to Flows"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>

        <div className="w-px h-5 md:h-7 bg-gray-200" />

        {/* Editable flow name */}
        {editingName ? (
          <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') {
                  setFlowName(flow.name);
                  setEditingName(false);
                }
              }}
              onBlur={handleNameSave}
              className="px-2 md:px-3 py-1 md:py-1.5 text-sm font-semibold text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white min-w-0 flex-1"
            />
            <button
              onClick={handleNameSave}
              disabled={savingName}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 shrink-0"
            >
              <Check className="w-4 h-4 text-emerald-500" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-1.5 md:gap-2 hover:bg-gray-50 px-2 md:px-3 py-1 md:py-1.5 rounded-lg transition-colors group min-w-0"
          >
            <span className="text-sm font-semibold text-gray-900 truncate">{flowName}</span>
            <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </button>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 md:gap-3 shrink-0">
          {/* Saved timestamp - hide on mobile */}
          <div className="items-center gap-1.5 text-xs text-gray-400 hidden md:flex">
            {lastSaved ? (
              <span>Saved {savedText}</span>
            ) : (
              <span>Not saved yet</span>
            )}
          </div>

          <div className="w-px h-5 md:h-7 bg-gray-200 hidden md:block" />

          {/* Active/Inactive toggle */}
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1 md:py-1.5 rounded-full text-xs font-semibold transition-all ${
              isActive
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 ring-1 ring-emerald-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 ring-1 ring-gray-200'
            }`}
          >
            {isActive ? (
              <>
                <Power className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Active</span>
              </>
            ) : (
              <>
                <PowerOff className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Inactive</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Flow canvas (full remaining height) */}
      <div className="flex-1 overflow-hidden">
        <FlowCanvas
          flowId={flow.id}
          initialNodes={flow.nodes}
          initialEdges={flow.edges}
          onSaveTimestamp={handleSaveTimestamp}
        />
      </div>

      {/* Test chat widget - smaller on mobile */}
      <TestChat flowId={flow.id} sessionId={flow.sessionId} />
    </div>
  );
}
