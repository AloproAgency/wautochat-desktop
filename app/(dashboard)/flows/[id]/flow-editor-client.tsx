'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Flow, Session, ApiResponse } from '@/lib/types';
import FlowCanvas from '@/components/flow-builder/flow-canvas';
import TestChat from '@/components/flow-builder/test-chat';
import {
  ArrowLeft,
  Check,
  Pencil,
  Power,
  PowerOff,
  Smartphone,
  ChevronDown,
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
  const [sessionId, setSessionId] = useState(flow.sessionId);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [savedText, setSavedText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setIsMac(window.electronAPI?.platform === 'darwin');
  }, []);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((d: ApiResponse<Session[]>) => { if (d.success && d.data) setSessions(d.data); })
      .catch(() => {});
  }, []);

  const handleSessionChange = useCallback(async (newSessionId: string) => {
    setSessionId(newSessionId);
    try {
      await fetch(`/api/flows/${flow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: newSessionId }),
      });
    } catch (err) {
      console.error('Failed to update session:', err);
      setSessionId(sessionId);
    }
  }, [flow.id, sessionId]);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-zinc-900">
      {/* Top bar — also serves as macOS drag region */}
      <div
        className="flex items-center h-14 shrink-0 bg-white dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700"
        style={isMac ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}
      >
        {/* Brand — fills the traffic lights zone on macOS */}
        {isMac && (
          <div
            className="flex items-center gap-2 pl-21 pr-3 shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <img src="/wautochat_logo.png" alt="WAutoChat" className="h-5 w-5 rounded-md shrink-0" />
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 whitespace-nowrap">Flow Editor</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 flex-1 min-w-0" style={isMac ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
        {/* Back */}
        <button
          onClick={() => router.push('/flows')}
          className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-100 transition-colors"
          title="Back to Flows"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700" />

        {/* Editable flow name */}
        {editingName ? (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
              className="px-2.5 py-1.5 text-sm font-semibold text-slate-900 dark:text-zinc-100 rounded-lg border border-slate-300 dark:border-zinc-700 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-600 focus:ring-2 focus:ring-slate-100 dark:focus:ring-zinc-700 min-w-0 flex-1 bg-white dark:bg-zinc-900"
            />
            <button
              onClick={handleNameSave}
              disabled={savingName}
              className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors group min-w-0"
          >
            <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100 truncate">{flowName}</span>
            <Pencil className="w-3 h-3 text-slate-400 dark:text-zinc-400 shrink-0" />
          </button>
        )}

        {/* Session selector */}
        <div className="relative ml-auto shrink-0 hidden sm:flex items-center">
          <Smartphone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-400 pointer-events-none" />
          <select
            value={sessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
            className="h-8 appearance-none rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-7 text-xs font-medium text-slate-700 dark:text-zinc-100 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-600 transition-colors cursor-pointer"
          >
            {sessions.length === 0 && (
              <option value={sessionId}>{sessionId}</option>
            )}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.status === 'connected' ? ' ●' : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 dark:text-zinc-400 pointer-events-none" />
        </div>

        <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden sm:block" />

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Save status */}
          <div className="hidden md:flex items-center gap-1.5">
            {lastSaved ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-400 dark:text-zinc-400">Saved {savedText}</span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-xs text-slate-400 dark:text-zinc-400">Unsaved</span>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-slate-200 dark:bg-zinc-700 hidden md:block" />

          {/* Active/Inactive toggle */}
          <button
            onClick={handleToggleActive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isActive
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-600'
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
      </div>

      {/* Flow canvas (full remaining height) */}
      <div className="flex-1 overflow-hidden">
        <FlowCanvas
          flowId={flow.id}
          sessionId={flow.sessionId}
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
