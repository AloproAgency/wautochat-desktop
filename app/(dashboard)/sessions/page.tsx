'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useSessionStore } from '@/lib/store';
import { formatTimestamp } from '@/lib/utils';
import type { Session, ApiResponse } from '@/lib/types';

const statusConfig: Record<
  Session['status'],
  { variant: 'success' | 'danger' | 'warning' | 'info' | 'default'; label: string }
> = {
  connected: { variant: 'success', label: 'Connected' },
  disconnected: { variant: 'danger', label: 'Disconnected' },
  connecting: { variant: 'warning', label: 'Connecting' },
  qr_ready: { variant: 'info', label: 'QR Ready' },
  failed: { variant: 'danger', label: 'Failed' },
};

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wa-text">Sessions WhatsApp</h1>
          <p className="mt-1 text-sm text-wa-text-secondary">
            Manage your WhatsApp sessions and connections
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
          New Session
        </Button>
      </div>

      {/* Sessions Grid */}
      {sessions.length === 0 ? (
        <EmptyState
          icon={<Smartphone className="h-8 w-8" />}
          title="No sessions yet"
          description="Create your first WhatsApp session to get started with automation."
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
              Create Session
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => {
            const statusInfo = statusConfig[session.status];
            return (
              <Card key={session.id} className="hover:shadow-md transition-shadow">
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wa-teal/10">
                        <Smartphone className="h-5 w-5 text-wa-teal" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-wa-text">{session.name}</h3>
                        <Badge variant={statusInfo.variant} className="mt-1">
                          {statusInfo.label}
                        </Badge>
                      </div>
                    </div>
                    {session.status === 'qr_ready' && (
                      <button
                        onClick={() => setShowQrModal(session.id)}
                        className="rounded-lg p-2 text-wa-blue hover:bg-wa-blue/10 transition-colors"
                        title="Show QR Code"
                      >
                        <QrCode className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 text-xs text-wa-text-secondary">
                    {session.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{session.phone}</span>
                      </div>
                    )}
                    {session.deviceName && (
                      <div className="flex items-center gap-2">
                        <Monitor className="h-3.5 w-3.5" />
                        <span>{session.deviceName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Created {formatTimestamp(session.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-wa-border">
                    {session.status === 'connected' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<WifiOff className="h-3.5 w-3.5" />}
                        loading={actionLoading === session.id}
                        onClick={() => handleDisconnect(session.id)}
                        className="flex-1"
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Wifi className="h-3.5 w-3.5" />}
                        loading={actionLoading === session.id}
                        onClick={() => handleConnect(session.id)}
                        className="flex-1"
                      >
                        Connect
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setShowDeleteModal(session.id)}
                      className="text-wa-danger hover:bg-wa-danger/10"
                    />
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

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

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Session"
        description="Are you sure you want to delete this session? This action cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actionLoading === showDeleteModal}
              onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-wa-text-secondary">
          All data associated with this session including messages, contacts, and flows will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}
