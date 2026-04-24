'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import {
  Smartphone,
  Plus,
  Wifi,
  WifiOff,
  Trash2,
  QrCode,
  Monitor,
  Calendar,
  Phone,
  Hash,
  RefreshCw,
  MoreVertical,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useSessionStore } from '@/lib/store';
import { formatTimestamp, formatPhoneNumber } from '@/lib/utils';
import type { Session, ApiResponse } from '@/lib/types';

// Status palette — sober solid colors only, no gradients.
const statusMeta: Record<
  Session['status'],
  { dot: string; text: string; pillBg: string; pillBorder: string; label: string }
> = {
  connected:    { dot: 'bg-emerald-500', text: 'text-emerald-700', pillBg: 'bg-emerald-50',  pillBorder: 'border-emerald-200',  label: 'Connected' },
  connecting:   { dot: 'bg-amber-500',   text: 'text-amber-700',   pillBg: 'bg-amber-50',    pillBorder: 'border-amber-200',    label: 'Connecting' },
  qr_ready:     { dot: 'bg-sky-500',     text: 'text-sky-700',     pillBg: 'bg-sky-50',      pillBorder: 'border-sky-200',      label: 'QR ready' },
  disconnected: { dot: 'bg-slate-400',   text: 'text-slate-600',   pillBg: 'bg-slate-100',   pillBorder: 'border-slate-200',    label: 'Disconnected' },
  failed:       { dot: 'bg-red-500',     text: 'text-red-700',     pillBg: 'bg-red-50',      pillBorder: 'border-red-200',      label: 'Failed' },
};

type FilterKey = 'all' | Session['status'];

export default function SessionsPage() {
  const { sessions, setSessions, addSession, updateSession, removeSession } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showConnectMethodModal, setShowConnectMethodModal] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [qrModalMode, setQrModalMode] = useState<'qr' | 'paircode'>('qr');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [connectionMode, setConnectionMode] = useState<'qr' | 'paircode'>('qr');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [connectMode, setConnectMode] = useState<'qr' | 'paircode'>('qr');
  const [connectPhoneNumber, setConnectPhoneNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data: ApiResponse<Session[]> = await res.json();
        if (data.success && data.data) {
          setSessions(data.data);
        }
      }
    } catch {
      toast({ title: 'Failed to load sessions', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setSessions, toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // QR / Pair Code Polling
  const [qrStatus, setQrStatus] = useState<string>('');
  const qrPollCountRef = useRef(0);

  useEffect(() => {
    if (showQrModal) {
      qrPollCountRef.current = 0;
      setQrStatus('Initializing browser...');

      const pollQr = async () => {
        qrPollCountRef.current++;
        try {
          const res = await fetch(`/api/sessions/${showQrModal}/qr`);
          if (res.ok) {
            const data: ApiResponse<{ qrCode: string | null; pairCode: string | null; status: string; message?: string }> = await res.json();
            if (data.success && data.data) {
              if (data.data.status === 'connected') {
                setShowQrModal(null);
                setQrImage(null);
                setPairCode(null);
                setQrStatus('');
                updateSession(showQrModal, { status: 'connected' });
                toast({ title: 'Session connected!', variant: 'success' });
                return;
              }
              if (data.data.pairCode) {
                setPairCode(data.data.pairCode);
                setQrImage(null);
                setQrStatus('Enter this code in WhatsApp on your phone');
                updateSession(showQrModal, { status: 'qr_ready' });
                return;
              }
              if (data.data.qrCode) {
                setQrImage(data.data.qrCode);
                setPairCode(null);
                setQrStatus('Scan the QR code with WhatsApp');
                updateSession(showQrModal, { status: 'qr_ready' });
                return;
              }
              if (data.data.status === 'failed') {
                if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
                setQrImage(null);
                setPairCode(null);
                setQrStatus(data.data.message || 'Unable to start this WhatsApp session.');
                updateSession(showQrModal, { status: data.data.status as Session['status'] });
                toast({ title: data.data.message || 'Session connection failed', variant: 'error' });
                return;
              }
              if (data.data.status === 'disconnected') {
                setQrImage(null);
                setPairCode(null);
                setQrStatus(data.data.message || 'Waiting for WhatsApp to prepare a new QR code...');
                updateSession(showQrModal, { status: 'disconnected' });
              } else {
                // Nothing ready yet — update status based on poll count
                if (qrPollCountRef.current < 5) {
                  setQrStatus('Initializing browser...');
                } else if (qrPollCountRef.current < 15) {
                  setQrStatus('Loading WhatsApp Web...');
                } else {
                  setQrStatus(qrModalMode === 'paircode' ? 'Generating pair code, please wait...' : 'Generating QR code, please wait...');
                }
              }
            }
          }
        } catch {
          // silently retry
        }
      };

      pollQr();
      qrIntervalRef.current = setInterval(pollQr, 1500);

      return () => {
        if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      };
    } else {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      setQrStatus('');
    }
  }, [showQrModal, qrModalMode, updateSession, toast]);

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;
    if (connectionMode === 'paircode' && !newPhoneNumber.trim()) return;
    try {
      setCreating(true);
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSessionName.trim(),
          deviceName: newDeviceName.trim() || undefined,
          phoneNumber: connectionMode === 'paircode' ? newPhoneNumber.trim() : undefined,
        }),
      });
      if (res.ok) {
        const data: ApiResponse<Session> = await res.json();
        if (data.success && data.data) {
          addSession(data.data);
          toast({ title: 'Session created', variant: 'success' });
          setShowNewModal(false);
          setNewSessionName('');
          setNewDeviceName('');
          setNewPhoneNumber('');
          setQrImage(null);
          setPairCode(null);
          setQrModalMode(connectionMode);
          setConnectionMode('qr');
          // Open connection modal — polls until QR or pair code is ready
          setShowQrModal(data.data.id);
        }
      } else {
        const err = await res.json();
        toast({ title: err.error || 'Failed to create session', variant: 'error' });
      }
    } catch {
      toast({ title: 'Failed to create session', variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = (id: string) => {
    setConnectMode('qr');
    setConnectPhoneNumber('');
    setShowConnectMethodModal(id);
  };

  const handleConfirmConnect = async () => {
    const id = showConnectMethodModal;
    if (!id) return;
    if (connectMode === 'paircode' && !connectPhoneNumber.trim()) return;
    try {
      setActionLoading(id);
      setShowConnectMethodModal(null);
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          phoneNumber: connectMode === 'paircode' ? connectPhoneNumber.trim() : undefined,
        }),
      });
      if (res.ok) {
        const data: ApiResponse<Session> = await res.json();
        if (data.success && data.data) {
          updateSession(id, data.data);
          setQrImage(null);
          setPairCode(null);
          setQrModalMode(connectMode);
          setShowQrModal(id);
          toast({ title: 'Connecting...', variant: 'info' });
        }
      }
    } catch {
      toast({ title: 'Failed to connect session', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (res.ok) {
        updateSession(id, { status: 'disconnected' });
        toast({ title: 'Session disconnected', variant: 'success' });
      }
    } catch {
      toast({ title: 'Failed to disconnect session', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        removeSession(id);
        toast({ title: 'Session deleted', variant: 'success' });
        setShowDeleteModal(null);
      }
    } catch {
      toast({ title: 'Failed to delete session', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // All hooks must be called on every render in the same order. The loading
  // skeleton is handled inside the render tree below (not as an early return)
  // so that `useMemo` calls always run.

  // Count sessions per status for filter chips (always from full list, so the
  // numbers reflect the real state even while the user has filters active).
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: sessions.length,
      connected: 0,
      connecting: 0,
      qr_ready: 0,
      disconnected: 0,
      failed: 0,
    };
    for (const s of sessions) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter !== 'all' && s.status !== filter) return false;
      if (q) {
        const hit =
          s.name.toLowerCase().includes(q) ||
          (s.phone || '').includes(searchQuery) ||
          (s.deviceName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [sessions, filter, searchQuery]);

  const filters: { key: FilterKey; label: string; count: number }[] = (
    [
      { key: 'all', label: 'All', count: counts.all },
      { key: 'connected', label: 'Connected', count: counts.connected },
      { key: 'qr_ready', label: 'QR ready', count: counts.qr_ready },
      { key: 'connecting', label: 'Connecting', count: counts.connecting },
      { key: 'disconnected', label: 'Disconnected', count: counts.disconnected },
      { key: 'failed', label: 'Failed', count: counts.failed },
    ] as const
  ).filter((f) => f.key === 'all' || f.count > 0);

  return (
    // Negative margins cancel the parent layout's padding so this page is
    // edge-to-edge (header stuck to the top, cards touch the sidebar and the
    // right edge). `lg:max-w-none` overrides the parent's `max-w-7xl`.
    <div className="flex flex-col -m-4 md:-m-6 lg:max-w-none bg-slate-50 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
      {/* ===== Sticky header — single compact row ===== */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 px-5 h-14">
          <div className="flex items-baseline gap-2 shrink-0">
            <h1 className="text-base font-semibold tracking-tight text-slate-900">Sessions</h1>
            <span className="text-xs font-mono text-slate-400 tabular-nums">{sessions.length}</span>
          </div>

          <div className="h-5 w-px bg-slate-200" />

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone…"
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 h-8 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
            />
          </div>

          {/* Filter pills */}
          <div className="hidden md:flex items-center gap-0.5 overflow-x-auto">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md h-8 px-2.5 text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded px-1 text-[10px] font-mono tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'text-slate-400'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Primary action — ml-auto to stick to the edge */}
          <button
            onClick={() => setShowNewModal(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 h-8 px-3 text-[13px] font-medium text-white hover:bg-slate-800 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New session</span>
          </button>
        </div>
      </header>

      {/* ===== Grid ===== */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <SessionGridSkeleton />
        ) : sessions.length === 0 ? (
          <SessionEmptyState onCreate={() => setShowNewModal(true)} />
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-slate-500">No sessions match your filters.</p>
            <button
              onClick={() => { setFilter('all'); setSearchQuery(''); }}
              className="mt-3 text-xs font-medium text-slate-700 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSessions.map((session, idx) => {
              const meta = statusMeta[session.status];
              const isConnected = session.status === 'connected';
              const isQrReady = session.status === 'qr_ready';
              const isConnecting = session.status === 'connecting';
              return (
                <div
                  key={session.id}
                  className="group relative rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-sm animate-in-row"
                  style={{ animationDelay: `${Math.min(idx * 25, 200)}ms` }}
                >
                  {/* Top row: avatar + name + status */}
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <Smartphone className="h-5 w-5" />
                      </div>
                      {isConnected && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center">
                          <span className="absolute h-3.5 w-3.5 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                          <span className="relative h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {session.name}
                      </h3>
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pillBg} ${meta.pillBorder} ${meta.text}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>

                    {/* Quick QR button when applicable */}
                    {isQrReady && (
                      <button
                        onClick={() => setShowQrModal(session.id)}
                        className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 transition-colors shrink-0"
                        title="Show QR code"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Meta info */}
                  <dl className="mt-3.5 space-y-1.5 text-xs">
                    <InfoLine
                      icon={<Phone className="h-3 w-3" />}
                      value={session.phone ? formatPhoneNumber(session.phone) : '—'}
                      muted={!session.phone}
                    />
                    <InfoLine
                      icon={<Monitor className="h-3 w-3" />}
                      value={session.deviceName || '—'}
                      muted={!session.deviceName}
                    />
                    <InfoLine
                      icon={<Calendar className="h-3 w-3" />}
                      value={`Created ${formatTimestamp(session.createdAt)}`}
                      muted
                    />
                  </dl>

                  {/* Actions row */}
                  <div className="mt-4 flex items-center gap-1.5 pt-3 border-t border-slate-100">
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(session.id)}
                        disabled={actionLoading === session.id}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white h-8 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        <WifiOff className="h-3.5 w-3.5" />
                        {actionLoading === session.id ? 'Disconnecting…' : 'Disconnect'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(session.id)}
                        disabled={actionLoading === session.id || isConnecting}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 h-8 px-3 text-xs font-medium text-white hover:bg-slate-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        {isConnecting || actionLoading === session.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wifi className="h-3.5 w-3.5" />
                        )}
                        {isConnecting ? 'Connecting…' : 'Connect'}
                      </button>
                    )}

                    <button
                      onClick={() => setShowDeleteModal(session.id)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect Method Modal */}
      <Modal
        open={!!showConnectMethodModal}
        onClose={() => { setShowConnectMethodModal(null); setConnectMode('qr'); setConnectPhoneNumber(''); }}
        title="Connect Session"
        description="Choose how you want to connect this WhatsApp session."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowConnectMethodModal(null); setConnectMode('qr'); setConnectPhoneNumber(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConnect}
              disabled={connectMode === 'paircode' && !connectPhoneNumber.trim()}
            >
              Connect
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConnectMode('qr')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                connectMode === 'qr'
                  ? 'border-wa-teal bg-wa-teal/10 text-wa-teal'
                  : 'border-wa-border text-wa-text-secondary hover:border-wa-teal/50 hover:text-wa-text'
              }`}
            >
              <QrCode className="h-4 w-4" />
              QR Code
            </button>
            <button
              type="button"
              onClick={() => setConnectMode('paircode')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                connectMode === 'paircode'
                  ? 'border-wa-teal bg-wa-teal/10 text-wa-teal'
                  : 'border-wa-border text-wa-text-secondary hover:border-wa-teal/50 hover:text-wa-text'
              }`}
            >
              <Hash className="h-4 w-4" />
              Pair Code
            </button>
          </div>

          {connectMode === 'paircode' && (
            <div className="space-y-2">
              <Input
                label="Phone Number"
                placeholder="e.g., +33612345678"
                value={connectPhoneNumber}
                onChange={(e) => setConnectPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-wa-text-secondary">
                Enter the number linked to your WhatsApp account with country code. A 8-digit code will appear to link without scanning a QR.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* New Session Modal */}
      <Modal
        open={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          setConnectionMode('qr');
          setNewPhoneNumber('');
        }}
        title="New Session"
        description="Create a new WhatsApp session to connect your device."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowNewModal(false); setConnectionMode('qr'); setNewPhoneNumber(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSession}
              loading={creating}
              disabled={!newSessionName.trim() || (connectionMode === 'paircode' && !newPhoneNumber.trim())}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Session Name"
            placeholder="e.g., Main Business"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
          />
          <Input
            label="Device Name (optional)"
            placeholder="e.g., iPhone 15 Pro"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
          />

          {/* Connection mode toggle */}
          <div>
            <p className="mb-2 text-sm font-medium text-wa-text">Connection Method</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConnectionMode('qr')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  connectionMode === 'qr'
                    ? 'border-wa-teal bg-wa-teal/10 text-wa-teal'
                    : 'border-wa-border text-wa-text-secondary hover:border-wa-teal/50 hover:text-wa-text'
                }`}
              >
                <QrCode className="h-4 w-4" />
                QR Code
              </button>
              <button
                type="button"
                onClick={() => setConnectionMode('paircode')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  connectionMode === 'paircode'
                    ? 'border-wa-teal bg-wa-teal/10 text-wa-teal'
                    : 'border-wa-border text-wa-text-secondary hover:border-wa-teal/50 hover:text-wa-text'
                }`}
              >
                <Hash className="h-4 w-4" />
                Pair Code
              </button>
            </div>
          </div>

          {connectionMode === 'paircode' && (
            <div className="space-y-2">
              <Input
                label="Phone Number"
                placeholder="e.g., +33612345678"
                value={newPhoneNumber}
                onChange={(e) => setNewPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-wa-text-secondary">
                Enter the number linked to your WhatsApp account including country code. A 8-digit code will be generated to link without scanning a QR.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* QR Code / Pair Code Modal */}
      <Modal
        open={!!showQrModal}
        onClose={() => {
          setShowQrModal(null);
          setQrImage(null);
          setPairCode(null);
        }}
        title={qrModalMode === 'paircode' ? 'Enter Pair Code' : 'Scan QR Code'}
        description={
          qrModalMode === 'paircode'
            ? 'Open WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number instead.'
            : 'Open WhatsApp on your phone and scan the QR code to connect.'
        }
      >
        <div className="flex flex-col items-center py-4">
          {pairCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl border border-wa-border bg-wa-teal/5 px-8 py-6">
                <div className="flex items-center gap-3">
                  {pairCode.match(/.{1,4}/g)?.map((chunk, i) => (
                    <span key={i} className="font-mono text-3xl font-bold tracking-widest text-wa-teal">
                      {chunk}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="space-y-1.5 text-sm text-wa-text-secondary list-decimal list-inside">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Settings → Linked Devices</li>
                <li>Tap <strong>Link a Device</strong></li>
                <li>Tap <strong>Link with phone number instead</strong></li>
                <li>Enter the code above</li>
              </ol>
            </div>
          ) : qrImage ? (
            <div className="rounded-xl border border-wa-border bg-white p-4">
              <Image
                src={qrImage.startsWith('data:') ? qrImage : `data:image/png;base64,${qrImage}`}
                alt="WhatsApp QR Code"
                width={256}
                height={256}
                unoptimized
                className="h-64 w-64"
              />
            </div>
          ) : (
            <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-xl border border-wa-border bg-gray-50">
              <Spinner size="lg" />
              <p className="text-xs text-wa-text-secondary px-4 text-center">
                {qrStatus || (qrModalMode === 'paircode' ? 'Generating pair code...' : 'Initializing...')}
              </p>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm text-wa-text-secondary">
            <Spinner size="sm" />
            <span>
              {pairCode
                ? 'Waiting for phone confirmation...'
                : qrImage
                ? 'Waiting for scan...'
                : qrStatus || 'Initializing...'}
            </span>
          </div>
        </div>
      </Modal>

      {/* ===== Delete Session — confirmation dialog ===== */}
      {showDeleteModal && (() => {
        const target = sessions.find((s) => s.id === showDeleteModal);
        const isDeleting = actionLoading === showDeleteModal;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-session-title"
          >
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => !isDeleting && setShowDeleteModal(null)}
            />
            <div
              className="relative w-full max-w-sm rounded-xl bg-white shadow-xl ring-1 ring-slate-900/5 animate-dialog-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 shrink-0">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="delete-session-title" className="text-base font-semibold text-slate-900">
                    Delete this session?
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 truncate">
                    {target?.name}
                    {target?.phone ? ` · ${target.phone}` : ''}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-2.5">
                <ul className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-sm text-slate-700 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="shrink-0 text-slate-400">•</span>
                    <span className="flex-1 min-w-0">
                      La session sera déconnectée de WhatsApp Web.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 text-slate-400">•</span>
                    <span className="flex-1 min-w-0">
                      Les messages, contacts, groupes et flows stockés dans
                      WAutoChat pour cette session seront supprimés
                      définitivement.
                    </span>
                  </li>
                </ul>
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 leading-relaxed">
                  <p>
                    <span className="font-semibold">Bon à savoir :</span>{' '}
                    ton numéro WhatsApp n&apos;est pas affecté. Tu pourras le
                    reconnecter à tout moment en créant une nouvelle session et
                    en scannant un QR code. Seules les données locales de cette
                    session sont effacées.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 pb-5">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  disabled={isDeleting}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition active:scale-[0.98]"
                >
                  Annuler
                </button>
                <button
                  onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.98]"
                >
                  {isDeleting ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {isDeleting ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Local animations */}
      <style jsx global>{`
        @keyframes sessions-row-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-in-row { animation: sessions-row-in 220ms ease-out both; }
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        .animate-fade-in { animation: fade-in 150ms ease-out; }
        @keyframes dialog-in {
          from { transform: translateY(8px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        .animate-dialog-in { animation: dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
}

// ---------- Small local components ----------

function InfoLine({ icon, value, muted }: { icon: React.ReactNode; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${muted ? 'text-slate-400' : 'text-slate-600'}`}>
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function SessionGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4"
          style={{ opacity: 1 - i * 0.08 }}
        >
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-20 rounded-full bg-slate-100 animate-pulse" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2.5 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-3/4 rounded bg-slate-100 animate-pulse" />
          </div>
          <div className="mt-4 h-8 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function SessionEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        <Smartphone className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">No sessions yet</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Connect your first WhatsApp account to start building conversations and automations.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-all active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        Create a session
      </button>
    </div>
  );
}
