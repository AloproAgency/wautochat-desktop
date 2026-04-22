'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users,
  RefreshCw,
  Check,
  X,
  Ban,
  MessageSquare,
  Eye,
  Tag,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useToast } from '@/components/ui/toast';
import { useContactStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatPhoneNumber, formatTimestamp } from '@/lib/utils';
import type { Contact, ApiResponse } from '@/lib/types';

const PAGE_SIZE = 20;

const labelColors: Record<string, string> = {
  VIP: 'bg-purple-100 text-purple-700 border-purple-200',
  Customer: 'bg-blue-100 text-blue-700 border-blue-200',
  Lead: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Support: 'bg-green-100 text-green-700 border-green-200',
  Blocked: 'bg-red-100 text-red-700 border-red-200',
};

export default function ContactsPage() {
  const activeSessionId = useActiveSession();
  const { contacts, setContacts, updateContact } = useContactStore();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [availableLabels, setAvailableLabels] = useState<{ id: string; name: string; color: string }[]>([]);
  const { toast } = useToast();

  const fetchContacts = useCallback(async () => {
    if (!activeSessionId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await fetch(`/api/contacts?sessionId=${activeSessionId}`);
      if (res.ok) {
        const data: ApiResponse<Contact[]> = await res.json();
        if (data.success && data.data) {
          setContacts(data.data);
        }
      }
    } catch {
      toast({ title: 'Failed to load contacts', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, setContacts, toast]);

  // Fetch available labels from DB
  const fetchLabels = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/labels?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setAvailableLabels(data.data);
      }
    } catch { /* ignore */ }
  }, [activeSessionId]);

  useEffect(() => {
    fetchContacts();
    fetchLabels();
  }, [fetchContacts, fetchLabels]);

  const handleSync = async () => {
    if (!activeSessionId) return;
    try {
      setSyncing(true);
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: data.data?.message || 'Contacts synced', variant: 'success' });
        await fetchContacts();
      } else {
        toast({ title: data.error || 'Failed to sync contacts', variant: 'error' });
      }
    } catch {
      toast({ title: 'Failed to sync contacts', variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const handleBlock = async (contact: Contact) => {
    try {
      const action = contact.isBlocked ? 'unblock' : 'block';
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        updateContact(contact.id, { isBlocked: !contact.isBlocked });
        if (selectedContact?.id === contact.id) {
          setSelectedContact({ ...contact, isBlocked: !contact.isBlocked });
        }
        toast({
          title: contact.isBlocked ? 'Contact unblocked' : 'Contact blocked',
          variant: 'success',
        });
      }
    } catch {
      toast({ title: 'Failed to update contact', variant: 'error' });
    }
  };

  const handleUpdateLabels = async (contact: Contact, labels: string[]) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      });
      if (res.ok) {
        updateContact(contact.id, { labels });
        if (selectedContact?.id === contact.id) {
          setSelectedContact({ ...contact, labels });
        }
        toast({ title: 'Labels updated', variant: 'success' });
      }
    } catch {
      toast({ title: 'Failed to update labels', variant: 'error' });
    }
  };

  const handleAddLabel = (contact: Contact) => {
    if (!labelInput.trim()) return;
    const newLabels = [...new Set([...contact.labels, labelInput.trim()])];
    handleUpdateLabels(contact, newLabels);
    setLabelInput('');
    setEditingLabels(false);
  };

  const handleRemoveLabel = (contact: Contact, label: string) => {
    const newLabels = contact.labels.filter((l) => l !== label);
    handleUpdateLabels(contact, newLabels);
  };

  const filteredContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery) ||
          c.pushName?.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [contacts, searchQuery]
  );

  const totalPages = Math.ceil(filteredContacts.length / PAGE_SIZE);
  const paginatedContacts = filteredContacts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const columns: Column<Contact>[] = useMemo(
    () => [
      {
        key: 'avatar',
        header: '',
        className: 'w-12',
        render: (row: Contact) => (
          <Avatar size="sm" name={row.name} src={row.profilePicUrl} />
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: Contact) => (
          <div>
            <p className="font-medium">{row.name}</p>
            {row.pushName && row.pushName !== row.name && (
              <p className="text-xs text-wa-text-muted">{row.pushName}</p>
            )}
          </div>
        ),
      },
      {
        key: 'phone',
        header: 'Phone',
        render: (row: Contact) => (
          <span className="text-wa-text-secondary">{formatPhoneNumber(row.phone)}</span>
        ),
      },
      {
        key: 'labels',
        header: 'Labels',
        render: (row: Contact) => (
          <div className="flex flex-wrap gap-1">
            {row.labels.length > 0 ? (
              row.labels.map((label) => (
                <span
                  key={label}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    labelColors[label] || 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  {label}
                </span>
              ))
            ) : (
              <span className="text-xs text-wa-text-muted">--</span>
            )}
          </div>
        ),
      },
      {
        key: 'isWAContact',
        header: 'WhatsApp',
        className: 'w-20 text-center',
        render: (row: Contact) =>
          row.isWAContact ? (
            <Check className="mx-auto h-4 w-4 text-wa-success" />
          ) : (
            <X className="mx-auto h-4 w-4 text-wa-text-muted" />
          ),
      },
      {
        key: 'lastSeen',
        header: 'Last Seen',
        render: (row: Contact) => (
          <span className="text-xs text-wa-text-muted">
            {row.lastSeen ? formatTimestamp(row.lastSeen) : '--'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        className: 'w-36',
        render: (row: Contact) => (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                // Use phone@c.us format for direct chats, fallback to wppId
                const chatId = row.wppId.includes('@lid')
                  ? `${row.phone}@c.us`
                  : row.wppId;
                window.location.href = `/conversations?chat=${chatId}`;
              }}
              className="rounded-lg p-2 text-wa-text-secondary hover:bg-wa-green/10 hover:text-wa-teal transition-colors"
              title="View Chat"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleBlock(row)}
              className={`rounded-lg p-2 transition-colors ${
                row.isBlocked
                  ? 'text-wa-danger hover:bg-wa-danger/10'
                  : 'text-wa-text-secondary hover:bg-wa-hover hover:text-wa-text'
              }`}
              title={row.isBlocked ? 'Unblock' : 'Block'}
            >
              {row.isBlocked ? <Shield className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>
            <button
              onClick={() => {
                setSelectedContact(row);
                setShowPanel(true);
                setEditingLabels(true);
              }}
              className="rounded-lg p-2 text-wa-text-secondary hover:bg-wa-hover hover:text-wa-text transition-colors"
              title="Edit Labels"
            >
              <Tag className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-wa-text">Contacts</h1>
              <p className="mt-1 text-sm text-wa-text-secondary">
                Manage your WhatsApp contacts ({contacts.length} total)
              </p>
            </div>
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              loading={syncing}
              onClick={handleSync}
            >
              Sync Contacts
            </Button>
          </div>

          {/* Search */}
          <SearchInput
            value={searchQuery}
            onChange={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
            placeholder="Search by name, phone number, or push name..."
            className="max-w-md"
          />

          {/* Table */}
          <div className="rounded-lg border border-wa-border bg-wa-panel">
            <DataTable<Contact>
              columns={columns}
              data={paginatedContacts}
              onRowClick={(row) => {
                setSelectedContact(row);
                setShowPanel(true);
                setEditingLabels(false);
              }}
              emptyMessage="No contacts found"
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-wa-border px-4 py-3">
                <p className="text-sm text-wa-text-muted">
                  Showing {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filteredContacts.length)} of{' '}
                  {filteredContacts.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="rounded-lg p-1.5 text-wa-text-secondary hover:bg-wa-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm text-wa-text">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg p-1.5 text-wa-text-secondary hover:bg-wa-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Contact Detail */}
      {showPanel && selectedContact && (
        <div className="w-[380px] shrink-0 border-l border-wa-border bg-wa-panel overflow-y-auto">
          {/* Panel Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-wa-border bg-wa-header px-4 py-3">
            <h3 className="text-sm font-semibold text-wa-text">Contact Info</h3>
            <button
              onClick={() => {
                setShowPanel(false);
                setSelectedContact(null);
              }}
              className="rounded-lg p-1.5 text-wa-text-muted hover:bg-wa-hover hover:text-wa-text transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Profile Section */}
          <div className="flex flex-col items-center py-8 px-6 border-b border-wa-border">
            <Avatar
              size="lg"
              name={selectedContact.name}
              src={selectedContact.profilePicUrl}
              className="h-24 w-24 text-2xl"
            />
            <h2 className="mt-4 text-lg font-semibold text-wa-text">{selectedContact.name}</h2>
            <p className="mt-1 text-sm text-wa-text-secondary">
              {formatPhoneNumber(selectedContact.phone)}
            </p>
            {selectedContact.pushName && selectedContact.pushName !== selectedContact.name && (
              <p className="mt-0.5 text-xs text-wa-text-muted">
                Push name: {selectedContact.pushName}
              </p>
            )}
            {selectedContact.isBlocked && (
              <Badge variant="danger" className="mt-2">Blocked</Badge>
            )}
          </div>

          {/* Labels Section */}
          <div className="px-6 py-4 border-b border-wa-border">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-wa-text">Labels</h4>
              <button
                onClick={() => setEditingLabels(!editingLabels)}
                className="text-xs text-wa-teal hover:underline"
              >
                {editingLabels ? 'Done' : 'Edit'}
              </button>
            </div>

            {/* Current labels on this contact */}
            <div className="flex flex-wrap gap-1.5">
              {selectedContact.labels.map((label) => {
                const labelData = availableLabels.find((l) => l.name === label);
                return (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: labelData ? labelData.color + '20' : '#f3f4f6',
                      color: labelData ? labelData.color : '#374151',
                      borderColor: labelData ? labelData.color + '40' : '#e5e7eb',
                    }}
                  >
                    {labelData && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: labelData.color }}
                      />
                    )}
                    {label}
                    {editingLabels && (
                      <button
                        onClick={() => handleRemoveLabel(selectedContact, label)}
                        className="ml-0.5 hover:opacity-60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}
              {selectedContact.labels.length === 0 && !editingLabels && (
                <span className="text-xs text-wa-text-muted">No labels</span>
              )}
            </div>

            {editingLabels && (
              <div className="mt-3 space-y-2">
                {/* Available labels to add */}
                {availableLabels.length > 0 && (
                  <div>
                    <p className="text-xs text-wa-text-muted mb-2">Select a label:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {availableLabels
                        .filter((l) => !selectedContact.labels.includes(l.name))
                        .map((label) => (
                          <button
                            key={label.id}
                            onClick={() => {
                              const newLabels = [...selectedContact.labels, label.name];
                              handleUpdateLabels(selectedContact, newLabels);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: label.color + '15',
                              color: label.color,
                              borderColor: label.color + '30',
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: label.color }}
                            />
                            {label.name}
                            <span className="text-[10px] opacity-60">+</span>
                          </button>
                        ))}
                      {availableLabels.filter((l) => !selectedContact.labels.includes(l.name)).length === 0 && (
                        <span className="text-xs text-wa-text-muted">All labels assigned</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Create new label */}
                <div className="pt-2 border-t border-wa-border">
                  <p className="text-xs text-wa-text-muted mb-2">Or create a new label:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddLabel(selectedContact);
                          // Also create in labels table
                          if (labelInput.trim() && activeSessionId) {
                            fetch('/api/labels', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ sessionId: activeSessionId, name: labelInput.trim(), color: '#25D366' }),
                            }).then(() => fetchLabels()).catch(() => {});
                          }
                        }
                      }}
                      placeholder="New label name..."
                      className="h-8 flex-1 rounded-lg border border-wa-border bg-wa-input-bg px-3 text-xs text-wa-text placeholder:text-wa-text-muted focus:border-wa-green focus:outline-none focus:ring-1 focus:ring-wa-green/20"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        handleAddLabel(selectedContact);
                        // Also create in labels table
                        if (labelInput.trim() && activeSessionId) {
                          fetch('/api/labels', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sessionId: activeSessionId, name: labelInput.trim(), color: '#25D366' }),
                          }).then(() => fetchLabels()).catch(() => {});
                        }
                      }}
                      disabled={!labelInput.trim()}
                      className="h-8"
                    >
                      Create
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="px-6 py-4 border-b border-wa-border space-y-3">
            <div>
              <p className="text-xs text-wa-text-muted">WhatsApp User</p>
              <p className="text-sm text-wa-text">
                {selectedContact.isWAContact ? 'Yes' : 'No'}
              </p>
            </div>
            <div>
              <p className="text-xs text-wa-text-muted">Last Seen</p>
              <p className="text-sm text-wa-text">
                {selectedContact.lastSeen
                  ? formatTimestamp(selectedContact.lastSeen)
                  : 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-xs text-wa-text-muted">Added On</p>
              <p className="text-sm text-wa-text">
                {formatTimestamp(selectedContact.createdAt)}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="px-6 py-4 space-y-2">
            <Button
              variant="secondary"
              className="w-full"
              icon={<MessageSquare className="h-4 w-4" />}
              onClick={() => {
                window.location.href = `/conversations?chat=${selectedContact.wppId}`;
              }}
            >
              Send Message
            </Button>
            <Button
              variant={selectedContact.isBlocked ? 'danger' : 'secondary'}
              className="w-full"
              icon={selectedContact.isBlocked ? <Shield className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
              onClick={() => handleBlock(selectedContact)}
            >
              {selectedContact.isBlocked ? 'Unblock Contact' : 'Block Contact'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
