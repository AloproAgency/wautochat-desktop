'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  MessageSquare,
  User,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Avatar } from '@/components/ui/avatar';
import { useLabelStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import type { Label, Contact, Chat } from '@/lib/types';

// ---- Inline utility components ----

function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-wa-border dark:border-zinc-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-wa-text dark:text-zinc-100">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-wa-text-secondary dark:text-zinc-300">{description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-wa-hover dark:hover:bg-zinc-700">
            <X className="h-5 w-5 text-wa-text-muted dark:text-zinc-500" />
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
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[150px] rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-800 py-1 shadow-lg">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-wa-hover dark:hover:bg-zinc-700 ${
                  item.danger ? 'text-wa-danger' : 'text-wa-text dark:text-zinc-100'
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
      <div className="mb-4 rounded-full bg-wa-bg dark:bg-zinc-800 p-4 text-wa-text-muted dark:text-zinc-500">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-wa-text dark:text-zinc-100">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-wa-text-secondary dark:text-zinc-300">{description}</p>
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
          <button onClick={() => onChange('')} className="hover:text-wa-text dark:hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        ) : undefined
      }
    />
  );
}

const PRESET_COLORS = [
  { name: 'Green', value: '#25D366' },
  { name: 'Blue', value: '#34B7F1' },
  { name: 'Red', value: '#ea4335' },
  { name: 'Yellow', value: '#fbbc04' },
  { name: 'Purple', value: '#9333ea' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Teal', value: '#075E54' },
];

export default function LabelsPage() {
  const activeSessionId = useActiveSession();
  const { labels, setLabels } = useLabelStore();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [showLabelDetail, setShowLabelDetail] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);
  const [labelContacts, setLabelContacts] = useState<Contact[]>([]);
  const [labelChats, setLabelChats] = useState<Chat[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(PRESET_COLORS[0].value);
  const [saving, setSaving] = useState(false);

  const fetchLabels = useCallback(async () => {
    if (!activeSessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/labels?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setLabels(data.data);
      }
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, setLabels]);

  const handleSyncLabels = useCallback(async () => {
    if (!activeSessionId || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/labels/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchLabels();
      } else {
        alert(data.error || 'Failed to sync labels. Make sure your WhatsApp session is connected.');
      }
    } catch (err) {
      alert('Error syncing labels: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  }, [activeSessionId, syncing, fetchLabels]);

  useEffect(() => {
    // Sync labels from WhatsApp first, then fetch from DB
    if (activeSessionId) {
      fetch('/api/labels/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      })
        .catch(() => {})
        .finally(() => fetchLabels());
    } else {
      fetchLabels();
    }
  }, [activeSessionId, fetchLabels]);

  const filteredLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingLabel(null);
    setFormName('');
    setFormColor(PRESET_COLORS[0].value);
    setShowModal(true);
  };

  const openEditModal = (label: Label) => {
    setEditingLabel(label);
    setFormName(label.name);
    setFormColor(label.color);
    setShowModal(true);
  };

  const handleSaveLabel = async () => {
    if (!formName.trim() || !activeSessionId) return;
    setSaving(true);
    try {
      if (editingLabel) {
        const res = await fetch(`/api/labels/${editingLabel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            name: formName,
            color: formColor,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setShowModal(false);
          fetchLabels();
        }
      } else {
        const res = await fetch('/api/labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            name: formName,
            color: formColor,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setShowModal(false);
          fetchLabels();
        }
      }
    } catch {
      // handle silently
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLabel = async (label: Label) => {
    if (!confirm(`Delete label "${label.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/labels/${label.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchLabels();
    } catch {
      // handle silently
    }
  };

  const openLabelDetail = async (label: Label) => {
    setSelectedLabel(label);
    setShowLabelDetail(true);
    setLoadingDetail(true);
    try {
      const [contactsRes, chatsRes] = await Promise.all([
        fetch(
          `/api/labels/${label.id}/contacts?sessionId=${activeSessionId}`
        ),
        fetch(`/api/labels/${label.id}/chats?sessionId=${activeSessionId}`),
      ]);
      const contactsData = await contactsRes.json();
      const chatsData = await chatsRes.json();
      if (contactsData.success && Array.isArray(contactsData.data)) {
        setLabelContacts(contactsData.data);
      } else {
        setLabelContacts([]);
      }
      if (chatsData.success && Array.isArray(chatsData.data)) {
        setLabelChats(chatsData.data);
      } else {
        setLabelChats([]);
      }
    } catch {
      setLabelContacts([]);
      setLabelChats([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-6 lg:max-w-none bg-slate-50 dark:bg-zinc-900 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
        <div className="flex items-center gap-3 px-5 h-14">
          <div className="flex items-baseline gap-2 shrink-0">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-100">Labels</h1>
            <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 tabular-nums">{labels.length}</span>
          </div>
          <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700" />
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labels…"
              className="w-full rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-3 h-8 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-zinc-700 transition"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={handleSyncLabels}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 h-8 px-3 text-[13px] font-medium text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-zinc-700 h-8 px-3 text-[13px] font-medium text-white hover:bg-slate-800 dark:hover:bg-zinc-600 active:scale-[0.98] transition-all"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New label</span>
            </button>
          </div>
        </div>
      </header>

      <div className="p-5">

      {/* Labels Grid */}
      {filteredLabels.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-10 w-10" />}
          title="No labels found"
          description={
            search
              ? 'No labels match your search.'
              : 'Create labels to organize your contacts and chats.'
          }
          action={
            !search ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={openCreateModal}>
                Create Label
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredLabels.map((label) => (
            <Card
              key={label.id}
              className="cursor-pointer transition-shadow hover:shadow-md overflow-hidden dark:bg-zinc-800 dark:border-zinc-700"
              onClick={() => openLabelDetail(label)}
            >
              <CardBody>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-wa-text dark:text-zinc-100 text-sm">
                      {label.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-wa-text-secondary dark:text-zinc-300">
                      {label.count} {label.count === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <DropdownMenu
                    trigger={
                      <button className="rounded-lg p-1.5 hover:bg-wa-hover dark:hover:bg-zinc-700 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical className="h-4 w-4 text-wa-text-muted dark:text-zinc-500" />
                      </button>
                    }
                    items={[
                      {
                        label: 'Edit',
                        icon: <Pencil className="h-4 w-4" />,
                        onClick: () => openEditModal(label),
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="h-4 w-4" />,
                        onClick: () => handleDeleteLabel(label),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Label Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingLabel ? 'Edit Label' : 'Create Label'}
        description={
          editingLabel
            ? 'Update the label name and color'
            : 'Create a new label to organize contacts'
        }
      >
        <div className="space-y-4">
          <Input
            label="Label Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Enter label name..."
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-wa-text dark:text-zinc-100">
              Color
            </label>
            <div className="flex flex-wrap gap-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setFormColor(color.value)}
                  className={`group relative h-10 w-10 rounded-full transition-transform hover:scale-110 ${
                    formColor === color.value
                      ? 'ring-2 ring-wa-teal ring-offset-2 dark:ring-offset-gray-800'
                      : ''
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {formColor === color.value && (
                    <span className="absolute inset-0 flex items-center justify-center text-white">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveLabel}
              loading={saving}
              disabled={!formName.trim()}
            >
              {editingLabel ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Label Detail Modal - WhatsApp style discussions list */}
      <Modal
        open={showLabelDetail}
        onClose={() => {
          setShowLabelDetail(false);
          setSelectedLabel(null);
          setLabelContacts([]);
          setLabelChats([]);
        }}
        title={selectedLabel?.name || 'Label Details'}
      >
        {loadingDetail ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div>
            {/* Label header */}
            {selectedLabel && (
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-wa-border dark:border-zinc-700">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: selectedLabel.color + '30' }}
                >
                  <Tag className="h-5 w-5" style={{ color: selectedLabel.color }} />
                </div>
                <div>
                  <h3 className="font-semibold text-wa-text dark:text-zinc-100">{selectedLabel.name}</h3>
                  <p className="text-sm text-wa-text-secondary dark:text-zinc-300">
                    {labelContacts.length + labelChats.length} discussion{labelContacts.length + labelChats.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}

            {/* Discussions list - contacts + chats combined */}
            <div>
              <h4 className="mb-3 text-sm font-semibold text-wa-text dark:text-zinc-100">Discussions</h4>

              {labelContacts.length === 0 && labelChats.length === 0 ? (
                <p className="rounded-lg bg-wa-bg dark:bg-zinc-700 px-4 py-8 text-center text-sm text-wa-text-muted dark:text-zinc-500">
                  No discussions with this label
                </p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-wa-border dark:border-zinc-700 divide-y divide-wa-border dark:divide-gray-700">
                  {/* Contacts as discussions */}
                  {labelContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => {
                        setShowLabelDetail(false);
                        window.location.href = `/conversations?chat=${contact.wppId}`;
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wa-hover dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Avatar
                        src={contact.profilePicUrl}
                        name={contact.name}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-wa-text dark:text-zinc-100 truncate">{contact.name}</p>
                        <p className="text-xs text-wa-text-muted dark:text-zinc-500 truncate">{contact.phone}</p>
                      </div>
                      <MessageSquare className="h-4 w-4 text-wa-text-muted dark:text-zinc-500 shrink-0" />
                    </button>
                  ))}

                  {/* Chats as discussions */}
                  {labelChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setShowLabelDetail(false);
                        window.location.href = `/conversations?chat=${chat.wppId}`;
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-wa-hover dark:hover:bg-zinc-700 transition-colors"
                    >
                      <Avatar
                        src={chat.profilePicUrl}
                        name={chat.name}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-wa-text dark:text-zinc-100 truncate">
                          {chat.name}
                          {chat.isGroup && (
                            <span className="ml-2 rounded bg-wa-bg dark:bg-zinc-700 px-1.5 py-0.5 text-xs text-wa-text-muted dark:text-zinc-500">
                              Group
                            </span>
                          )}
                        </p>
                        {chat.unreadCount > 0 && (
                          <p className="text-xs text-wa-green font-medium">{chat.unreadCount} unread</p>
                        )}
                      </div>
                      <MessageSquare className="h-4 w-4 text-wa-text-muted dark:text-zinc-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      </div>
    </div>
  );
}
