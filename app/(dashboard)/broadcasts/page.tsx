'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Plus,
  Search,
  MoreVertical,
  Send,
  Clock,
  X,
  Eye,
  RefreshCw,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  File,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useSessionStore, useContactStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import type { Broadcast, Contact, MessageType } from '@/lib/types';

// ---- Inline utility components ----

function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative z-10 mx-4 flex max-h-[90vh] w-full flex-col rounded-lg border border-wa-border bg-wa-panel shadow-xl ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-wa-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-wa-text">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-wa-text-secondary">{description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-wa-hover">
            <X className="h-5 w-5 text-wa-text-muted" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function DropdownMenu({
  trigger,
  items,
}: {
  trigger: React.ReactNode;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full z-20 mb-1 min-w-[180px] rounded-lg border border-wa-border bg-wa-panel py-1 shadow-lg">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-wa-hover ${
                  item.danger ? 'text-wa-danger' : 'text-wa-text'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-wa-bg p-4 text-wa-text-muted">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-wa-text">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-wa-text-secondary">{description}</p>
      {action}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search...'}
      prefix={<Search className="h-4 w-4" />}
      suffix={
        value ? (
          <button onClick={() => onChange('')} className="hover:text-wa-text">
            <X className="h-4 w-4" />
          </button>
        ) : undefined
      }
    />
  );
}

const statusBadgeVariant: Record<string, 'default' | 'warning' | 'success' | 'danger' | 'info'> = {
  draft: 'default',
  sending: 'warning',
  sent: 'success',
  failed: 'danger',
};

const messageTypeIcon: Record<string, React.ReactNode> = {
  text: <FileText className="h-4 w-4" />,
  image: <ImageIcon className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  document: <File className="h-4 w-4" />,
};

export default function BroadcastsPage() {
  const activeSessionId = useActiveSession();
  const { sessions } = useSessionStore();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // New broadcast form
  const [formName, setFormName] = useState('');
  const [formSessionId, setFormSessionId] = useState(activeSessionId || '');
  const [formMessageType, setFormMessageType] = useState<MessageType>('text');
  const [formTextContent, setFormTextContent] = useState('');
  const [formMediaUrl, setFormMediaUrl] = useState('');
  const [formCaption, setFormCaption] = useState('');
  const [formFilename, setFormFilename] = useState('');
  const [formRecipients, setFormRecipients] = useState<string[]>([]);
  const [formRecipientSearch, setFormRecipientSearch] = useState('');
  const [formSchedule, setFormSchedule] = useState(false);
  const [formScheduleDate, setFormScheduleDate] = useState('');
  const [formScheduleTime, setFormScheduleTime] = useState('');
  const [sending, setSending] = useState(false);

  // Detail state
  const [detailRecipients, setDetailRecipients] = useState<
    { id: string; name: string; phone: string; status: string }[]
  >([]);

  const fetchBroadcasts = useCallback(async () => {
    if (!activeSessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcasts?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setBroadcasts(data.data);
      }
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

  const fetchContacts = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/contacts?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setContacts(data.data);
      }
    } catch {
      // handle silently
    }
  }, [activeSessionId]);

  useEffect(() => {
    // Sync broadcast lists from WhatsApp first
    if (activeSessionId) {
      fetch('/api/broadcasts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      })
        .catch(() => {})
        .finally(() => fetchBroadcasts());
    } else {
      fetchBroadcasts();
    }
    fetchContacts();
  }, [activeSessionId, fetchBroadcasts, fetchContacts]);

  // Auto-refresh while any broadcast is still sending
  useEffect(() => {
    const hasSending = broadcasts.some((b) => b.status === 'sending');
    if (!hasSending) return;
    const interval = setInterval(fetchBroadcasts, 3000);
    return () => clearInterval(interval);
  }, [broadcasts, fetchBroadcasts]);

  useEffect(() => {
    if (activeSessionId) setFormSessionId(activeSessionId);
  }, [activeSessionId]);

  const filteredBroadcasts = broadcasts.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContacts = contacts.filter(
    (c) =>
      !formRecipients.includes(c.wppId) &&
      (c.name.toLowerCase().includes(formRecipientSearch.toLowerCase()) ||
        c.phone.includes(formRecipientSearch))
  );

  const resetForm = () => {
    setFormName('');
    setFormMessageType('text');
    setFormTextContent('');
    setFormMediaUrl('');
    setFormCaption('');
    setFormFilename('');
    setFormRecipients([]);
    setFormRecipientSearch('');
    setFormSchedule(false);
    setFormScheduleDate('');
    setFormScheduleTime('');
  };

  const handleSendBroadcast = async () => {
    if (!formName.trim() || formRecipients.length === 0) return;
    setSending(true);

    let scheduledAt: string | undefined;
    if (formSchedule && formScheduleDate && formScheduleTime) {
      scheduledAt = new Date(`${formScheduleDate}T${formScheduleTime}`).toISOString();
    }

    let messageTemplate = formTextContent;
    if (formMessageType !== 'text') {
      messageTemplate = JSON.stringify({
        url: formMediaUrl,
        caption: formCaption,
        filename: formFilename,
      });
    }

    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: formSessionId,
          name: formName,
          messageType: formMessageType,
          messageTemplate,
          recipients: formRecipients,
          scheduledAt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewModal(false);
        resetForm();
        fetchBroadcasts();
      }
    } catch {
      // handle silently
    } finally {
      setSending(false);
    }
  };

  const handleDeleteBroadcast = async (broadcast: Broadcast) => {
    if (!confirm(`Delete broadcast "${broadcast.name}"?`)) return;
    try {
      await fetch(`/api/broadcasts/${broadcast.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchBroadcasts();
    } catch {
      // handle silently
    }
  };

  const handleResendFailed = async (broadcast: Broadcast) => {
    try {
      await fetch(`/api/broadcasts/${broadcast.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchBroadcasts();
    } catch {
      // handle silently
    }
  };

  const openDetail = async (broadcast: Broadcast) => {
    setSelectedBroadcast(broadcast);
    setShowDetail(true);
    try {
      const res = await fetch(
        `/api/broadcasts/${broadcast.id}/recipients?sessionId=${activeSessionId}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setDetailRecipients(data.data);
      } else {
        // Generate placeholder recipients from broadcast data
        setDetailRecipients(
          broadcast.recipients.map((r) => {
            const contact = contacts.find((c) => c.id === r);
            return {
              id: r,
              name: contact?.name || r,
              phone: contact?.phone || r,
              status: broadcast.status === 'sent' ? 'delivered' : 'pending',
            };
          })
        );
      }
    } catch {
      setDetailRecipients([]);
    }
  };

  const handleSelectAllContacts = () => {
    setFormRecipients(contacts.map((c) => c.wppId));
  };

  const progressPercent = (broadcast: Broadcast) => {
    if (broadcast.totalCount === 0) return 0;
    return Math.round(
      ((broadcast.sentCount + broadcast.failedCount) / broadcast.totalCount) * 100
    );
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wa-text">Broadcasts</h1>
          <p className="mt-1 text-sm text-wa-text-secondary">
            Send messages to multiple contacts at once
          </p>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowNewModal(true)}
        >
          New Broadcast
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search broadcasts..."
        />
      </div>

      {/* Broadcasts Table */}
      {filteredBroadcasts.length === 0 ? (
        <EmptyState
          icon={<Radio className="h-10 w-10" />}
          title="No broadcasts found"
          description={
            search
              ? 'No broadcasts match your search.'
              : 'Create your first broadcast to send messages to multiple contacts.'
          }
          action={
            !search ? (
              <Button
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setShowNewModal(true)}
              >
                New Broadcast
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-wa-border bg-wa-header text-left">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Status
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Type
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Recipients
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Scheduled
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Created
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredBroadcasts.map((broadcast) => (
                  <tr
                    key={broadcast.id}
                    className="border-b border-wa-border transition-colors hover:bg-wa-hover cursor-pointer"
                    onClick={() => openDetail(broadcast)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-wa-text">{broadcast.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant[broadcast.status] || 'default'}>
                        {broadcast.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-wa-text-secondary">
                        {messageTypeIcon[broadcast.messageType] || (
                          <FileText className="h-4 w-4" />
                        )}
                        <span className="capitalize">{broadcast.messageType}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-wa-text-secondary">
                      {broadcast.totalCount}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-wa-green transition-all"
                            style={{ width: `${progressPercent(broadcast)}%` }}
                          />
                        </div>
                        <span className="text-xs text-wa-text-muted">
                          <span className="text-wa-green">{broadcast.sentCount}</span>
                          {broadcast.failedCount > 0 && (
                            <>
                              {' / '}
                              <span className="text-wa-danger">
                                {broadcast.failedCount}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-wa-text-secondary">
                      {broadcast.scheduledAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(broadcast.scheduledAt).toLocaleString()}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-wa-text-muted">
                      {new Date(broadcast.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu
                        trigger={
                          <button className="rounded-lg p-1.5 hover:bg-gray-200">
                            <MoreVertical className="h-4 w-4 text-wa-text-muted" />
                          </button>
                        }
                        items={[
                          {
                            label: 'View Details',
                            icon: <Eye className="h-4 w-4" />,
                            onClick: () => openDetail(broadcast),
                          },
                          ...(broadcast.failedCount > 0
                            ? [
                                {
                                  label: 'Resend Failed',
                                  icon: <RefreshCw className="h-4 w-4" />,
                                  onClick: () => handleResendFailed(broadcast),
                                },
                              ]
                            : []),
                          {
                            label: 'Delete',
                            icon: <Trash2 className="h-4 w-4" />,
                            onClick: () => handleDeleteBroadcast(broadcast),
                            danger: true,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New Broadcast Modal */}
      <Modal
        open={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          resetForm();
        }}
        title="New Broadcast"
        description="Send a message to multiple contacts"
        wide
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Left: Configuration */}
          <div className="space-y-4">
            <Input
              label="Broadcast Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="E.g., Weekly Newsletter"
            />

            <Select
              label="Session"
              value={formSessionId}
              onChange={(e) => setFormSessionId(e.target.value)}
              options={sessions.map((s) => ({ value: s.id, label: s.name }))}
            />

            <Select
              label="Message Type"
              value={formMessageType}
              onChange={(e) => setFormMessageType(e.target.value as MessageType)}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
                { value: 'document', label: 'Document' },
              ]}
            />

            {/* Message content based on type */}
            {formMessageType === 'text' && (
              <div>
                <Textarea
                  label="Message Content"
                  value={formTextContent}
                  onChange={(e) => setFormTextContent(e.target.value)}
                  placeholder="Type your message... Use {{name}} for contact name, {{phone}} for phone number"
                  maxLength={4096}
                  showCount
                />
                <div className="mt-1 flex flex-wrap gap-1">
                  {['{{name}}', '{{phone}}'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setFormTextContent((prev) => prev + v)}
                      className="rounded bg-wa-light-green px-2 py-0.5 text-xs text-wa-teal-dark hover:bg-wa-green/20"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {formMessageType === 'image' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-wa-text">Image</label>
                  <div className="flex items-center gap-3">
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-wa-border bg-white px-4 py-2 text-sm text-wa-text-secondary transition-colors hover:border-wa-green hover:bg-wa-light-green/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                      Choose Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setFormMediaUrl(reader.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {formMediaUrl && (
                      <span className="text-xs text-wa-green font-medium">Image selected</span>
                    )}
                  </div>
                  {!formMediaUrl && (
                    <Input
                      value={formMediaUrl}
                      onChange={(e) => setFormMediaUrl(e.target.value)}
                      placeholder="Or paste an image URL..."
                      className="mt-2"
                    />
                  )}
                </div>
                <Input
                  label="Caption"
                  value={formCaption}
                  onChange={(e) => setFormCaption(e.target.value)}
                  placeholder="Optional caption..."
                />
              </>
            )}

            {formMessageType === 'video' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-wa-text">Video</label>
                  <div className="flex items-center gap-3">
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-wa-border bg-white px-4 py-2 text-sm text-wa-text-secondary transition-colors hover:border-wa-green hover:bg-wa-light-green/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
                      Choose Video
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setFormMediaUrl(reader.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {formMediaUrl && (
                      <span className="text-xs text-wa-green font-medium">Video selected</span>
                    )}
                  </div>
                  {!formMediaUrl && (
                    <Input
                      value={formMediaUrl}
                      onChange={(e) => setFormMediaUrl(e.target.value)}
                      placeholder="Or paste a video URL..."
                      className="mt-2"
                    />
                  )}
                </div>
                <Input
                  label="Caption"
                  value={formCaption}
                  onChange={(e) => setFormCaption(e.target.value)}
                  placeholder="Optional caption..."
                />
              </>
            )}

            {formMessageType === 'document' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-wa-text">Document</label>
                  <div className="flex items-center gap-3">
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-wa-border bg-white px-4 py-2 text-sm text-wa-text-secondary transition-colors hover:border-wa-green hover:bg-wa-light-green/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                      Choose File
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!formFilename) setFormFilename(file.name);
                          const reader = new FileReader();
                          reader.onload = () => setFormMediaUrl(reader.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    {formMediaUrl && (
                      <span className="text-xs text-wa-green font-medium">{formFilename || 'File selected'}</span>
                    )}
                  </div>
                  {!formMediaUrl && (
                    <Input
                      value={formMediaUrl}
                      onChange={(e) => setFormMediaUrl(e.target.value)}
                      placeholder="Or paste a document URL..."
                      className="mt-2"
                    />
                  )}
                </div>
                <Input
                  label="Filename"
                  value={formFilename}
                  onChange={(e) => setFormFilename(e.target.value)}
                  placeholder="document.pdf"
                />
              </>
            )}

            {/* Schedule */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formSchedule}
                  onChange={(e) => setFormSchedule(e.target.checked)}
                  className="h-4 w-4 rounded border-wa-border text-wa-teal accent-wa-teal"
                />
                <span className="text-sm font-medium text-wa-text">
                  Schedule for later
                </span>
              </label>
              {formSchedule && (
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={formScheduleDate}
                    onChange={(e) => setFormScheduleDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    value={formScheduleTime}
                    onChange={(e) => setFormScheduleTime(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Recipients + Preview */}
          <div className="space-y-4">
            {/* Recipients */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-wa-text">Recipients</label>
                <button
                  onClick={handleSelectAllContacts}
                  className="text-xs font-medium text-wa-teal hover:underline"
                >
                  Select All ({contacts.length})
                </button>
              </div>

              {/* Selected recipients chips */}
              {formRecipients.length > 0 && (
                <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {formRecipients.slice(0, 20).map((rid) => {
                    const contact = contacts.find((c) => c.wppId === rid);
                    return (
                      <span
                        key={rid}
                        className="inline-flex items-center gap-1 rounded-full bg-wa-light-green px-2 py-0.5 text-xs text-wa-teal-dark"
                      >
                        {contact?.name || rid}
                        <button
                          onClick={() =>
                            setFormRecipients((prev) => prev.filter((id) => id !== rid))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                  {formRecipients.length > 20 && (
                    <span className="text-xs text-wa-text-muted">
                      +{formRecipients.length - 20} more
                    </span>
                  )}
                </div>
              )}
              <p className="mb-2 text-xs text-wa-text-muted">
                {formRecipients.length} recipient
                {formRecipients.length !== 1 ? 's' : ''} selected
              </p>

              <SearchInput
                value={formRecipientSearch}
                onChange={setFormRecipientSearch}
                placeholder="Search contacts..."
              />

              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-wa-border">
                {filteredContacts.length === 0 ? (
                  <p className="px-4 py-3 text-center text-sm text-wa-text-muted">
                    No contacts found
                  </p>
                ) : (
                  filteredContacts.slice(0, 50).map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() =>
                        setFormRecipients((prev) => [...prev, contact.wppId])
                      }
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-wa-hover"
                    >
                      <Avatar
                        src={contact.profilePicUrl}
                        name={contact.name}
                        size="sm"
                      />
                      <div>
                        <span className="text-sm font-medium text-wa-text">
                          {contact.name}
                        </span>
                        <span className="ml-2 text-xs text-wa-text-muted">
                          {contact.phone}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-wa-text">
                Message Preview
              </label>
              <div className="rounded-lg bg-wa-bg-chat p-4">
                <div className="inline-block max-w-[280px] rounded-lg bg-wa-light-green p-3 shadow-sm">
                  {formMessageType === 'text' ? (
                    <p className="whitespace-pre-wrap text-sm text-wa-text">
                      {formTextContent || 'Your message will appear here...'}
                    </p>
                  ) : formMessageType === 'image' ? (
                    <div>
                      {formMediaUrl && (
                        <div className="mb-2 h-32 w-full overflow-hidden rounded bg-gray-200">
                          <img
                            src={formMediaUrl}
                            alt="Preview"
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      {!formMediaUrl && (
                        <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-gray-200">
                          <ImageIcon className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                      <p className="text-sm text-wa-text">
                        {formCaption || 'Image caption'}
                      </p>
                    </div>
                  ) : formMessageType === 'video' ? (
                    <div>
                      <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-gray-800">
                        <Video className="h-8 w-8 text-white" />
                      </div>
                      <p className="text-sm text-wa-text">
                        {formCaption || 'Video caption'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <File className="h-8 w-8 text-wa-teal" />
                      <div>
                        <p className="text-sm font-medium text-wa-text">
                          {formFilename || 'document.pdf'}
                        </p>
                        <p className="text-xs text-wa-text-muted">Document</p>
                      </div>
                    </div>
                  )}
                  <div className="mt-1 text-right text-[10px] text-wa-text-muted">
                    {new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2 border-t border-wa-border pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setShowNewModal(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            icon={formSchedule ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            onClick={handleSendBroadcast}
            loading={sending}
            disabled={!formName.trim() || formRecipients.length === 0}
          >
            {formSchedule ? 'Schedule' : 'Send Now'}
          </Button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={showDetail}
        onClose={() => {
          setShowDetail(false);
          setSelectedBroadcast(null);
          setDetailRecipients([]);
        }}
        title={selectedBroadcast?.name || 'Broadcast Details'}
        wide
      >
        {selectedBroadcast && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-wa-bg p-4 text-center">
                <div className="text-2xl font-bold text-wa-text">
                  {selectedBroadcast.totalCount}
                </div>
                <div className="text-xs text-wa-text-muted">Total</div>
              </div>
              <div className="rounded-lg bg-wa-success/10 p-4 text-center">
                <div className="text-2xl font-bold text-green-700">
                  {selectedBroadcast.sentCount}
                </div>
                <div className="text-xs text-wa-text-muted">Sent</div>
              </div>
              <div className="rounded-lg bg-wa-danger/10 p-4 text-center">
                <div className="text-2xl font-bold text-red-700">
                  {selectedBroadcast.failedCount}
                </div>
                <div className="text-xs text-wa-text-muted">Failed</div>
              </div>
              <div className="rounded-lg bg-wa-blue/10 p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {selectedBroadcast.totalCount -
                    selectedBroadcast.sentCount -
                    selectedBroadcast.failedCount}
                </div>
                <div className="text-xs text-wa-text-muted">Pending</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="mb-1 flex justify-between text-xs text-wa-text-muted">
                <span>Progress</span>
                <span>{progressPercent(selectedBroadcast)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-wa-green transition-all"
                  style={{ width: `${progressPercent(selectedBroadcast)}%` }}
                />
              </div>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-wa-text-muted">Status:</span>{' '}
                <Badge
                  variant={
                    statusBadgeVariant[selectedBroadcast.status] || 'default'
                  }
                >
                  {selectedBroadcast.status}
                </Badge>
              </div>
              <div>
                <span className="text-wa-text-muted">Type:</span>{' '}
                <span className="capitalize text-wa-text">
                  {selectedBroadcast.messageType}
                </span>
              </div>
              <div>
                <span className="text-wa-text-muted">Created:</span>{' '}
                <span className="text-wa-text">
                  {new Date(selectedBroadcast.createdAt).toLocaleString()}
                </span>
              </div>
              {selectedBroadcast.scheduledAt && (
                <div>
                  <span className="text-wa-text-muted">Scheduled:</span>{' '}
                  <span className="text-wa-text">
                    {new Date(selectedBroadcast.scheduledAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Recipient List */}
            <div>
              <h4 className="mb-2 text-sm font-medium text-wa-text">
                Recipients ({detailRecipients.length})
              </h4>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-wa-border">
                {detailRecipients.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-wa-text-muted">
                    No recipient data available
                  </p>
                ) : (
                  detailRecipients.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between border-b border-wa-border px-4 py-2 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <span className="text-sm font-medium text-wa-text">
                            {r.name}
                          </span>
                          <span className="ml-2 text-xs text-wa-text-muted">
                            {r.phone}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={
                          r.status === 'delivered' || r.status === 'sent'
                            ? 'success'
                            : r.status === 'failed'
                            ? 'danger'
                            : r.status === 'sending'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
