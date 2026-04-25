'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  X,
  Ban,
  MessageSquare,
  Tag,
  Shield,
  Search,
  Plus,
  Check,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { NoSessionState } from '@/components/ui/no-session-state';
import { useContactStore, useSessionStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatPhoneNumber, formatTimestamp } from '@/lib/utils';
import type { Contact, ApiResponse } from '@/lib/types';

const labelColors: Record<string, string> = {
  VIP: 'bg-purple-50 text-purple-700 border-purple-200',
  Customer: 'bg-blue-50 text-blue-700 border-blue-200',
  Lead: 'bg-amber-50 text-amber-700 border-amber-200',
  Support: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Blocked: 'bg-red-50 text-red-700 border-red-200',
};

type FilterKey = 'all' | 'whatsapp' | 'blocked' | 'labeled';

export default function ContactsPage() {
  const activeSessionId = useActiveSession();
  const sessions = useSessionStore((s) => s.sessions);
  const { contacts, setContacts, updateContact } = useContactStore();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [editingLabels, setEditingLabels] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [availableLabels, setAvailableLabels] = useState<
    { id: string; name: string; color: string }[]
  >([]);
  const [blockConfirm, setBlockConfirm] = useState<Contact | null>(null);
  const [blocking, setBlocking] = useState(false);
  // Real online presence keyed by wppId. We refuse to fall back to
  // `isWAContact` (which only means "has a WhatsApp account") so the dot
  // truly reflects current connection state.
  const [presenceMap, setPresenceMap] = useState<Record<string, { isOnline: boolean; lastSeen: number | null }>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Cmd/Ctrl+K focuses the search input, Esc closes modals/panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (blockConfirm) {
          setBlockConfirm(null);
        } else if (showPanel) {
          setShowPanel(false);
          setSelectedContact(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPanel, blockConfirm]);

  const fetchContacts = useCallback(async () => {
    if (!activeSessionId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/contacts?sessionId=${activeSessionId}`);
      if (res.ok) {
        const data: ApiResponse<Contact[]> = await res.json();
        if (data.success && data.data) setContacts(data.data);
      }
    } catch {
      toast({ title: 'Failed to load contacts', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeSessionId, setContacts, toast]);

  const fetchLabels = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/labels?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) setAvailableLabels(data.data);
    } catch {
      /* ignore */
    }
  }, [activeSessionId]);

  useEffect(() => {
    fetchContacts();
    fetchLabels();
  }, [fetchContacts, fetchLabels]);

  // Real online presence — batch every 30s so the green dot is honest.
  useEffect(() => {
    if (!activeSessionId || contacts.length === 0) return;
    let cancelled = false;
    const fetchPresence = async () => {
      const ids = contacts
        .filter((c) => c.isWAContact && !c.isBlocked && c.wppId)
        .slice(0, 200)
        .map((c) => c.wppId);
      if (ids.length === 0) return;
      try {
        const res = await fetch('/api/presence/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSessionId, chatIds: ids }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success && data.data) {
          setPresenceMap(data.data);
        }
      } catch {
        // silently keep previous state
      }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSessionId, contacts]);

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
      setBlocking(true);
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
    } finally {
      setBlocking(false);
      setBlockConfirm(null);
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

  const filteredContacts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    // Strip everything but digits so "+229 57 22 27" still matches "229572227".
    const qDigits = searchQuery.replace(/\D/g, '');
    return contacts.filter((c) => {
      if (q) {
        const matches =
          c.name.toLowerCase().includes(q) ||
          c.pushName?.toLowerCase().includes(q) ||
          (qDigits && c.phone.replace(/\D/g, '').includes(qDigits));
        if (!matches) return false;
      }
      if (filter === 'whatsapp' && !c.isWAContact) return false;
      if (filter === 'blocked' && !c.isBlocked) return false;
      if (filter === 'labeled' && (!c.labels || c.labels.length === 0)) return false;
      return true;
    });
  }, [contacts, searchQuery, filter]);

  const groupedContacts = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    for (const c of filteredContacts) {
      const letter = (c.name?.trim()?.[0] || '#').toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return Object.keys(groups)
      .sort()
      .map((k) => ({ letter: k, items: groups[k] }));
  }, [filteredContacts]);

  const counts = useMemo(
    () => ({
      all: contacts.length,
      whatsapp: contacts.filter((c) => c.isWAContact).length,
      blocked: contacts.filter((c) => c.isBlocked).length,
      labeled: contacts.filter((c) => c.labels && c.labels.length > 0).length,
    }),
    [contacts]
  );

  const avatarUrl = (c: Contact) =>
    c.phone
      ? `/api/contacts/avatar/${c.phone}${
          activeSessionId ? `?sessionId=${activeSessionId}` : ''
        }`
      : c.profilePicUrl;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'whatsapp', label: 'WhatsApp', count: counts.whatsapp },
    { key: 'labeled', label: 'Labeled', count: counts.labeled },
    { key: 'blocked', label: 'Blocked', count: counts.blocked },
  ];

  function openContact(c: Contact, editLabels = false) {
    setSelectedContact(c);
    setShowPanel(true);
    setEditingLabels(editLabels);
  }

  const currentSession = sessions.find((s) => s.id === activeSessionId);
  const sessionConnected = currentSession?.status === 'connected';
  if (!activeSessionId || !sessionConnected) {
    return (
      <div className="flex -m-4 md:-m-6 lg:max-w-none bg-slate-50 dark:bg-zinc-900 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
        <NoSessionState feature="les contacts" />
      </div>
    );
  }

  return (
    // Negative margins compensate the parent layout's padding so this page is
    // edge-to-edge. The `lg:max-w-none` overrides the parent's `max-w-7xl`.
    <div className="flex -m-4 md:-m-6 lg:max-w-none bg-slate-50 dark:bg-zinc-900 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
      {/* ===== Main column ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* --- Sticky header: single compact row, edge-to-edge --- */}
        <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
          <div className="flex items-center gap-4 px-5 h-14">
            {/* Title + count */}
            <div className="flex items-baseline gap-2 shrink-0">
              <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
                Contacts
              </h1>
              <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 tabular-nums">
                {contacts.length}
              </span>
              {filteredContacts.length !== contacts.length && (
                <span className="text-xs text-slate-400 dark:text-zinc-500">
                  · {filteredContacts.length} shown
                </span>
              )}
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-zinc-700" />

            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, phone…"
                className="w-full rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-8 pr-14 h-8 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-zinc-700 transition"
              />
              <kbd className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                ⌘K
              </kbd>
            </div>

            {/* Filter pills */}
            <div className="hidden md:flex items-center gap-0.5">
              {filters.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`inline-flex items-center gap-1.5 rounded-md h-8 px-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-slate-900 text-white dark:bg-zinc-700'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`rounded px-1 text-[10px] font-mono tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'text-slate-400 dark:text-zinc-500'
                      }`}
                    >
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sync — ml-auto to stick to the right edge */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 h-8 px-2.5 text-[13px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Syncing…' : 'Sync'}</span>
            </button>
          </div>
        </header>

        {/* --- List --- */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <ContactListSkeleton />
          ) : filteredContacts.length === 0 ? (
            <EmptyState
              hasQuery={searchQuery.length > 0 || filter !== 'all'}
              onSync={handleSync}
              syncing={syncing}
            />
          ) : (
            <div className="px-3 py-3">
              {groupedContacts.map((group) => (
                <section key={group.letter} className="mb-4">
                  <h2 className="sticky top-0 z-[5] px-3 py-1 text-[11px] font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase bg-slate-50/95 dark:bg-zinc-900/95 backdrop-blur">
                    {group.letter}
                    <span className="ml-2 text-slate-300 dark:text-zinc-600 font-normal">
                      {group.items.length}
                    </span>
                  </h2>
                  <ul className="space-y-0.5 mt-0.5">
                    {group.items.map((c, idx) => {
                      const isSelected = selectedContact?.id === c.id && showPanel;
                      return (
                        <li
                          key={c.id}
                          className="animate-in-row"
                          style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => openContact(c)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openContact(c);
                              }
                            }}
                            className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer hover:bg-white dark:hover:bg-zinc-800 hover:shadow-sm focus:outline-none focus:bg-white dark:focus:bg-zinc-800 focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-zinc-600/30 ${
                              isSelected
                                ? 'bg-white dark:bg-zinc-800 shadow-sm ring-1 ring-slate-900/5 dark:ring-gray-700'
                                : ''
                            }`}
                          >
                            {/* Avatar */}
                            <div className="relative shrink-0">
                              <Avatar
                                size="md"
                                name={c.name}
                                src={avatarUrl(c)}
                                className="ring-1 ring-slate-200 dark:ring-gray-700"
                              />
                              {presenceMap[c.wppId]?.isOnline && !c.isBlocked && (
                                <span
                                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-900 bg-emerald-500"
                                  title="Online now"
                                />
                              )}
                              {c.isBlocked && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-red-500 text-white">
                                  <Ban className="h-2 w-2" strokeWidth={3} />
                                </span>
                              )}
                            </div>

                            {/* Name + push name */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                                  {c.name}
                                </p>
                                {c.labels?.slice(0, 2).map((label) => (
                                  <span
                                    key={label}
                                    className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium ${
                                      labelColors[label] ||
                                      'bg-slate-50 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                                    }`}
                                  >
                                    {label}
                                  </span>
                                ))}
                                {c.labels && c.labels.length > 2 && (
                                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                                    +{c.labels.length - 2}
                                  </span>
                                )}
                              </div>
                              {c.pushName && c.pushName !== c.name && (
                                <p className="truncate text-xs text-slate-400 dark:text-zinc-500">
                                  {c.pushName}
                                </p>
                              )}
                            </div>

                            {/* Phone (mono) */}
                            <p className="hidden md:block shrink-0 text-xs font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                              {formatPhoneNumber(c.phone)}
                            </p>

                            {/* Hover actions */}
                            <div
                              className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconBtn
                                title="Open conversation"
                                onClick={() => {
                                  window.location.href = `/conversations?contact=${encodeURIComponent(c.id)}`;
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title="Edit labels"
                                onClick={() => openContact(c, true)}
                              >
                                <Tag className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                title={c.isBlocked ? 'Unblock' : 'Block'}
                                danger={c.isBlocked}
                                onClick={() => setBlockConfirm(c)}
                              >
                                {c.isBlocked ? (
                                  <Shield className="h-3.5 w-3.5" />
                                ) : (
                                  <Ban className="h-3.5 w-3.5" />
                                )}
                              </IconBtn>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Side panel ===== */}
      {showPanel && selectedContact && (
        <>
          {/* Backdrop for mobile */}
          <div
            className="lg:hidden fixed inset-0 z-30 bg-slate-900/20 animate-fade-in"
            onClick={() => setShowPanel(false)}
          />
          <aside
            className="fixed lg:static right-0 top-0 z-40 h-full w-full sm:w-[400px] shrink-0 border-l border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-y-auto animate-slide-in-right"
            key={selectedContact.id}
          >
            {/* Sticky top bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-5 py-3.5">
              <h3 className="text-[11px] font-semibold tracking-widest text-slate-500 dark:text-zinc-400 uppercase">
                Contact
              </h3>
              <button
                onClick={() => {
                  setShowPanel(false);
                  setSelectedContact(null);
                }}
                className="rounded-lg p-1.5 text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-gray-300 transition"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Identity block — clean, no gradient, strong hierarchy */}
            <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center border-b border-slate-100 dark:border-zinc-700">
              <div className="relative">
                <Avatar
                  size="lg"
                  name={selectedContact.name}
                  src={avatarUrl(selectedContact)}
                  className="h-24 w-24 text-2xl ring-1 ring-slate-200 dark:ring-gray-700"
                />
                {presenceMap[selectedContact.wppId]?.isOnline && !selectedContact.isBlocked && (
                  <span
                    className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-white dark:border-zinc-800 bg-emerald-500"
                    title="Online now"
                  />
                )}
                {selectedContact.isBlocked && (
                  <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white dark:border-zinc-800 bg-red-500 text-white">
                    <Ban className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </div>

              <h2 className="mt-5 text-xl font-semibold text-slate-900 dark:text-zinc-100">
                {selectedContact.name}
              </h2>
              <p className="mt-1 text-sm font-mono text-slate-500 dark:text-zinc-400 tabular-nums">
                {formatPhoneNumber(selectedContact.phone)}
              </p>
              {selectedContact.pushName &&
                selectedContact.pushName !== selectedContact.name && (
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-zinc-500">
                    @{selectedContact.pushName}
                  </p>
                )}

              {/* Status badges */}
              <div className="mt-3 flex items-center gap-1.5">
                {selectedContact.isBlocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-400">
                    <Ban className="h-3 w-3" />
                    Blocked
                  </span>
                ) : selectedContact.isWAContact ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    On WhatsApp
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-zinc-700 border border-slate-200 dark:border-zinc-600 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                    Not on WhatsApp
                  </span>
                )}
              </div>

              {/* Primary actions — equal width, sober */}
              <div className="mt-6 grid grid-cols-2 gap-2 w-full">
                <button
                  onClick={() => {
                    window.location.href = `/conversations?contact=${encodeURIComponent(selectedContact.id)}`;
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 dark:bg-zinc-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-zinc-600 active:scale-[0.98] transition"
                >
                  <MessageSquare className="h-4 w-4" />
                  Message
                </button>
                <button
                  onClick={() => setBlockConfirm(selectedContact)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border transition active:scale-[0.98] ${
                    selectedContact.isBlocked
                      ? 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                      : 'border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700'
                  }`}
                >
                  {selectedContact.isBlocked ? (
                    <>
                      <Shield className="h-4 w-4" />
                      Unblock
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
                      Block
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Labels — inline editor */}
            <section className="px-6 py-5 border-b border-slate-100 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-semibold tracking-widest text-slate-500 dark:text-zinc-400 uppercase">
                  Labels
                </h4>
                <button
                  onClick={() => setEditingLabels(!editingLabels)}
                  className="text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition"
                >
                  {editingLabels ? 'Done' : selectedContact.labels.length ? 'Edit' : '+ Add'}
                </button>
              </div>
              {selectedContact.labels.length === 0 && !editingLabels ? (
                <p className="text-xs text-slate-400 dark:text-zinc-500">No labels assigned.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedContact.labels.map((label) => (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                        labelColors[label] ||
                        'bg-slate-50 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-600'
                      }`}
                    >
                      {label}
                      {editingLabels && (
                        <button
                          onClick={() => handleRemoveLabel(selectedContact, label)}
                          className="hover:text-red-600 transition"
                          aria-label={`Remove ${label}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {editingLabels && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddLabel(selectedContact);
                    }}
                    placeholder="Label name…"
                    list="label-suggestions"
                    className="flex-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-slate-200 dark:focus:ring-zinc-700"
                  />
                  <datalist id="label-suggestions">
                    {availableLabels.map((l) => (
                      <option key={l.id} value={l.name} />
                    ))}
                  </datalist>
                  <button
                    onClick={() => handleAddLabel(selectedContact)}
                    disabled={!labelInput.trim()}
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-900 dark:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition active:scale-[0.98]"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                </div>
              )}
            </section>

            {/* Details — clean two-column list */}
            <section className="px-6 py-5 border-b border-slate-100 dark:border-zinc-700">
              <h4 className="text-[11px] font-semibold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-3">
                Details
              </h4>
              <dl className="space-y-3 text-sm">
                <InfoRow
                  label="Phone"
                  value={
                    <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                      {formatPhoneNumber(selectedContact.phone)}
                    </span>
                  }
                />
                <InfoRow
                  label="Status"
                  value={
                    selectedContact.isWAContact ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-zinc-500">Inactive</span>
                    )
                  }
                />
                <InfoRow
                  label="Last seen"
                  value={
                    selectedContact.lastSeen ? (
                      <span className="text-slate-700 dark:text-zinc-300">
                        {formatTimestamp(selectedContact.lastSeen)}
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-zinc-500">Unknown</span>
                    )
                  }
                />
                <InfoRow
                  label="Added"
                  value={
                    <span className="text-slate-700 dark:text-zinc-300">
                      {formatTimestamp(selectedContact.createdAt)}
                    </span>
                  }
                />
              </dl>
            </section>

            {/* Technical footer — mono ID in a subtle box */}
            <section className="px-6 py-5">
              <h4 className="text-[11px] font-semibold tracking-widest text-slate-500 dark:text-zinc-400 uppercase mb-2">
                Technical
              </h4>
              <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3 py-2">
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">Chat ID</p>
                <p className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 break-all">
                  {selectedContact.wppId}
                </p>
              </div>
            </section>
          </aside>
        </>
      )}

      {/* ===== Block / Unblock confirmation dialog ===== */}
      {blockConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-confirm-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => !blocking && setBlockConfirm(null)}
          />

          {/* Dialog */}
          <div
            className="relative w-full max-w-sm rounded-xl bg-white dark:bg-zinc-800 shadow-xl ring-1 ring-slate-900/5 dark:ring-gray-700 animate-dialog-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: avatar + name */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                  blockConfirm.isBlocked
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                }`}
              >
                {blockConfirm.isBlocked ? (
                  <Shield className="h-5 w-5" />
                ) : (
                  <Ban className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="block-confirm-title"
                  className="text-base font-semibold text-slate-900 dark:text-zinc-100"
                >
                  {blockConfirm.isBlocked ? 'Unblock contact?' : 'Block contact?'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400 truncate">
                  {blockConfirm.name} · {formatPhoneNumber(blockConfirm.phone)}
                </p>
              </div>
            </div>

            {/* Body: explain what's going to happen */}
            <div className="px-5 pb-5">
              {blockConfirm.isBlocked ? (
                <div className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 p-3 text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                  Ce contact sera de nouveau autorisé à t&apos;envoyer des messages WhatsApp, et tu pourras lui écrire normalement.
                </div>
              ) : (
                <ul className="rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 p-3 space-y-1.5 text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-slate-400 dark:text-zinc-500">•</span>
                    Ne pourra plus t&apos;envoyer de messages ni t&apos;appeler sur WhatsApp.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-slate-400 dark:text-zinc-500">•</span>
                    Ne verra plus ton statut, ta photo de profil ni ta dernière connexion.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-slate-400 dark:text-zinc-500">•</span>
                    Tu pourras le débloquer à tout moment.
                  </li>
                </ul>
              )}
            </div>

            {/* Footer: cancel + primary */}
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button
                onClick={() => setBlockConfirm(null)}
                disabled={blocking}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 disabled:opacity-50 transition active:scale-[0.98]"
              >
                Annuler
              </button>
              <button
                onClick={() => handleBlock(blockConfirm)}
                disabled={blocking}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${
                  blockConfirm.isBlocked
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {blocking ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : blockConfirm.isBlocked ? (
                  <Shield className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4" />
                )}
                {blocking
                  ? 'En cours…'
                  : blockConfirm.isBlocked
                    ? 'Débloquer'
                    : 'Bloquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations (scoped via JSX style tag) */}
      <style jsx global>{`
        @keyframes row-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-in-row {
          animation: row-in 240ms ease-out both;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 150ms ease-out;
        }
        @keyframes slide-in-right {
          from {
            transform: translateX(16px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 200ms ease-out;
        }
        @keyframes dialog-in {
          from {
            transform: translateY(8px) scale(0.98);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        .animate-dialog-in {
          animation: dialog-in 180ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small local components (kept here because they are only used by   */
/*  this page and have no reusable value elsewhere).                  */
/* ------------------------------------------------------------------ */

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg p-1.5 transition-colors ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-slate-400 dark:text-zinc-500 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function ActionChip({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'success';
}) {
  const colors: Record<string, string> = {
    default:
      'bg-slate-900 dark:bg-zinc-700 text-white hover:bg-slate-800 dark:hover:bg-zinc-600',
    danger:
      'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50',
    success:
      'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${colors[variant]}`}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[11px] font-semibold tracking-widest text-slate-400 dark:text-zinc-500 uppercase shrink-0 pt-0.5">
        {label}
      </dt>
      <dd className="text-right text-sm text-slate-700 dark:text-zinc-300">{value}</dd>
    </div>
  );
}

function ContactListSkeleton() {
  return (
    <div className="px-8 py-6 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ opacity: 1 - i * 0.08 }}
        >
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-zinc-700 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-slate-200 dark:bg-zinc-700 rounded animate-pulse" />
            <div className="h-2.5 w-20 bg-slate-100 dark:bg-zinc-700 rounded animate-pulse" />
          </div>
          <div className="h-3 w-24 bg-slate-100 dark:bg-zinc-700 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasQuery,
  onSync,
  syncing,
}: {
  hasQuery: boolean;
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-zinc-800">
        <Search className="h-7 w-7 text-slate-400 dark:text-zinc-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
        {hasQuery ? 'No contacts match' : 'No contacts yet'}
      </h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-zinc-400">
        {hasQuery
          ? 'Try adjusting your search or filter.'
          : 'Sync your WhatsApp session to import the contacts saved in your phone.'}
      </p>
      {!hasQuery && (
        <button
          onClick={onSync}
          disabled={syncing}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-zinc-600 disabled:opacity-60 transition-all active:scale-[0.98]"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync contacts'}
        </button>
      )}
    </div>
  );
}
