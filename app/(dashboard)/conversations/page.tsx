'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Search,
  Paperclip,
  Send,
  Mic,
  Play,
  File,
  MapPin,
  UserCircle,
  MoreVertical,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Smile,
  ArrowLeft,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { Chat, Message, ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBase64(str: string): boolean {
  if (!str || str.length < 50) return false;
  return /^[A-Za-z0-9+/=]{50,}/.test(str);
}

function lastMessagePreview(chat: Chat & { messageCount?: number }): string {
  if (!chat.lastMessage) {
    if (chat.messageCount && chat.messageCount > 0) return `${chat.messageCount} messages`;
    return 'No messages yet';
  }
  const lm = chat.lastMessage as { body?: string; type?: string; fromMe?: boolean };
  const body = lm.body || '';
  if (!body || body === 'Media' || isBase64(body)) {
    const typeLabel = lm.type && lm.type !== 'text' ? lm.type.charAt(0).toUpperCase() + lm.type.slice(1) : 'Media';
    return lm.fromMe ? `You: ${typeLabel}` : typeLabel;
  }
  const text = truncate(body, 40);
  return lm.fromMe ? `You: ${text}` : text;
}

function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const d = new Date(msg.timestamp);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMsgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.floor((startOfToday.getTime() - startOfMsgDay.getTime()) / (1000 * 60 * 60 * 24));

    let dateLabel: string;
    if (diffDays === 0) dateLabel = 'Today';
    else if (diffDays === 1) dateLabel = 'Yesterday';
    else dateLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    if (dateLabel !== currentDate) {
      currentDate = dateLabel;
      groups.push({ date: dateLabel, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }

  return groups;
}

function formatMessageTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3 w-3 text-wa-text-muted" />;
    case 'sent':
      return <Check className="h-3 w-3 text-wa-text-muted" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-wa-text-muted" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-wa-blue" />;
    case 'failed':
      return <AlertCircle className="h-3 w-3 text-wa-danger" />;
    default:
      return null;
  }
}

function MessageContent({ message }: { message: Message }) {
  switch (message.type) {
    case 'image':
      return (
        <div>
          {message.mediaUrl ? (
            <img
              src={message.mediaUrl}
              alt={message.caption || 'Image'}
              className="max-w-full rounded-md"
              style={{ maxWidth: 280 }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 280, height: 160, backgroundColor: 'rgba(0,0,0,0.06)' }}
            >
              <ImageIcon className="h-10 w-10 text-wa-text-muted" />
            </div>
          )}
          {(message.caption || message.body) && !isBase64(message.body) && (
            <p className="mt-1 text-sm whitespace-pre-wrap">{message.caption || message.body}</p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {message.mediaUrl ? (
            <video src={message.mediaUrl} className="max-w-full rounded-md" style={{ maxWidth: 280 }} controls />
          ) : (
            <div
              className="flex items-center justify-center rounded-md"
              style={{ width: 280, height: 160, backgroundColor: 'rgba(0,0,0,0.08)' }}
            >
              <Play className="h-10 w-10 text-white" />
            </div>
          )}
          {message.caption && <p className="mt-1 text-sm whitespace-pre-wrap">{message.caption}</p>}
        </div>
      );

    case 'audio':
    case 'ptt':
      return (
        <div className="flex items-center gap-3" style={{ minWidth: 200 }}>
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: '#075E54' }}
          >
            <Play className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <div className="h-1 rounded-full" style={{ backgroundColor: 'rgba(134,150,160,0.3)' }}>
              <div className="h-1 w-1/3 rounded-full bg-wa-teal" />
            </div>
            <p className="mt-1 text-xs text-wa-text-muted">0:00</p>
          </div>
        </div>
      );

    case 'document':
      return (
        <div
          className="flex items-center gap-3 rounded-md p-3"
          style={{ minWidth: 200, backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <File className="h-8 w-8 shrink-0 text-wa-teal" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{message.body || 'Document'}</p>
            <p className="text-xs text-wa-text-muted">{message.mediaType || 'File'}</p>
          </div>
        </div>
      );

    case 'location':
      return (
        <div
          className="flex items-center gap-2 rounded-md p-3"
          style={{ minWidth: 200, backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <MapPin className="h-6 w-6 shrink-0 text-wa-danger" />
          <div>
            <p className="text-sm font-medium">Location</p>
            <p className="text-xs text-wa-text-muted">{message.body || 'Shared location'}</p>
          </div>
        </div>
      );

    case 'contact':
      return (
        <div
          className="flex items-center gap-2 rounded-md p-3"
          style={{ minWidth: 200, backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <UserCircle className="h-6 w-6 shrink-0 text-wa-teal" />
          <div>
            <p className="text-sm font-medium">Contact</p>
            <p className="text-xs text-wa-text-muted">{message.body || 'Shared contact'}</p>
          </div>
        </div>
      );

    case 'sticker':
      return (
        <div className="flex items-center justify-center" style={{ width: 120, height: 120 }}>
          {message.mediaUrl ? (
            <img src={message.mediaUrl} alt="Sticker" style={{ maxWidth: 120, maxHeight: 120 }} />
          ) : (
            <Smile className="h-16 w-16 text-wa-text-muted" />
          )}
        </div>
      );

    default: {
      const body = message.body || '';
      if (isBase64(body)) return <p className="text-sm italic text-wa-text-muted">Media</p>;
      return <p className="text-sm whitespace-pre-wrap wrap-break-word">{body}</p>;
    }
  }
}

function MessageBubble({ message, isGroup, isMobile }: { message: Message; isGroup: boolean; isMobile: boolean }) {
  const isSent = message.fromMe;
  const time = formatMessageTime(message.timestamp);
  const body = message.body || message.caption || '';

  // Skip completely empty messages that have no content
  if (!body && !message.mediaUrl && message.type === 'text') {
    return null;
  }

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1 px-2`}>
      <div
        className="relative rounded-lg px-3 py-1.5 shadow-sm"
        style={{
          maxWidth: isMobile ? '85%' : '65%',
          backgroundColor: isSent ? '#DCF8C6' : '#ffffff',
        }}
      >
        {/* Show sender name only in groups, for received messages */}
        {!isSent && isGroup && message.senderName && (
          <p className="mb-0.5 text-xs font-semibold text-wa-teal">{message.senderName}</p>
        )}
        <MessageContent message={message} />
        <div className="flex items-center justify-end gap-1 mt-0.5" style={{ marginBottom: -2 }}>
          <span className="text-wa-text-muted" style={{ fontSize: 11 }}>{time}</span>
          {isSent && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

function ChatListItem({
  chat,
  isSelected,
  onSelect,
}: {
  chat: Chat;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const ts = chat.lastMessage?.timestamp || chat.updatedAt;

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-wa-hover"
      style={isSelected ? { backgroundColor: '#f0f2f0' } : undefined}
    >
      <Avatar size="md" name={chat.name} src={chat.profilePicUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-wa-text truncate">{chat.name}</p>
          <span
            className="shrink-0 ml-2"
            style={{
              fontSize: 12,
              color: chat.unreadCount > 0 ? '#25D366' : '#8696a0',
              fontWeight: chat.unreadCount > 0 ? 600 : 400,
            }}
          >
            {ts ? formatTimestamp(ts) : ''}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-wa-text-secondary truncate pr-2">
            {lastMessagePreview(chat)}
          </p>
          {chat.unreadCount > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white"
              style={{ backgroundColor: '#25D366', fontSize: 11 }}
            >
              {chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ConversationsPage() {
  const activeSessionId = useActiveSession();
  const { toast } = useToast();

  // Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // State
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups'>('all');

  // Mobile: track if we are viewing messages (vs chat list)
  const [mobileShowMessages, setMobileShowMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch chats
  // ---------------------------------------------------------------------------
  const fetchChats = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/chats?sessionId=${activeSessionId}`);
      if (res.ok) {
        const data: ApiResponse<Chat[]> = await res.json();
        if (data.success && data.data) {
          // Deduplicate by wppId (keep the one with most messages/latest update)
          const seen = new Map<string, Chat>();
          for (const chat of data.data) {
            const existing = seen.get(chat.wppId);
            if (!existing || (chat.lastMessage && !existing.lastMessage) ||
                new Date(chat.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
              seen.set(chat.wppId, chat);
            }
          }
          const deduped = Array.from(seen.values());
          // Filter out status@broadcast
          const filtered = deduped.filter(c => c.wppId !== 'status@broadcast');
          const sorted = filtered.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          setChats(sorted);
        }
      }
    } catch {
      toast({ title: 'Failed to load conversations', variant: 'error' });
    }
  }, [activeSessionId, toast]);

  useEffect(() => {
    if (!activeSessionId) return;
    setLoading(true);
    fetchChats().finally(() => setLoading(false));
  }, [activeSessionId, fetchChats]);

  // ---------------------------------------------------------------------------
  // Fetch messages for selected chat
  // ---------------------------------------------------------------------------
  const fetchMessages = useCallback(
    async (chat: Chat, opts?: { silent?: boolean }) => {
      if (!activeSessionId) return;
      try {
        if (!opts?.silent) setMessagesLoading(true);
        const res = await fetch(
          `/api/messages?sessionId=${activeSessionId}&chatId=${chat.id}`
        );
        if (res.ok) {
          const data: ApiResponse<Message[]> = await res.json();
          if (data.success && data.data) {
            setMessages([...data.data].reverse());
          }
        }
      } catch {
        if (!opts?.silent) {
          toast({ title: 'Failed to load messages', variant: 'error' });
        }
      } finally {
        if (!opts?.silent) setMessagesLoading(false);
      }
    },
    [activeSessionId, toast]
  );

  // When a chat is selected, fetch messages and start polling
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    fetchMessages(selectedChat);

    pollIntervalRef.current = setInterval(() => {
      fetchMessages(selectedChat, { silent: true });
    }, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [selectedChat, fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------
  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedChat || !activeSessionId) return;

    const text = messageText.trim();

    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      sessionId: activeSessionId,
      chatId: selectedChat.id,
      wppId: '',
      type: 'text',
      body: text,
      sender: 'me',
      senderName: 'You',
      fromMe: true,
      timestamp: new Date().toISOString(),
      status: 'pending',
      isForwarded: false,
      labels: [],
    };

    setMessages((prev) => [...prev, tempMsg]);
    setMessageText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      setSending(true);
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          chatId: selectedChat.wppId,
          type: 'text',
          content: text,
        }),
      });

      if (res.ok) {
        const data: ApiResponse<{ id: string; status: string }> = await res.json();
        if (data.success && data.data) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId ? { ...m, id: data.data!.id, status: 'sent' as const } : m
            )
          );
        }
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
        );
        toast({ title: 'Failed to send message', variant: 'error' });
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
      );
      toast({ title: 'Failed to send message', variant: 'error' });
    } finally {
      setSending(false);
    }
  }, [messageText, selectedChat, activeSessionId, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleTextareaInput = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Select a chat (handles mobile view switch)
  // ---------------------------------------------------------------------------
  const handleSelectChat = useCallback((chat: Chat) => {
    setSelectedChat(chat);
    if (isMobile) {
      setMobileShowMessages(true);
    }
  }, [isMobile]);

  const handleBackToList = useCallback(() => {
    setMobileShowMessages(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------
  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        chat.name.toLowerCase().includes(q) ||
        (chat.lastMessage as { body?: string } | undefined)?.body?.toLowerCase().includes(q);

      if (chatFilter === 'unread') return matchesSearch && chat.unreadCount > 0;
      if (chatFilter === 'groups') return matchesSearch && chat.isGroup;
      return matchesSearch;
    });
  }, [chats, searchQuery, chatFilter]);

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  // Compute left panel width
  const leftPanelWidth = isMobile ? '100%' : isTablet ? 280 : 380;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeSessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-wa-text-muted">Connecting to session...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Chat list panel
  // ---------------------------------------------------------------------------
  const chatListPanel = (
    <div
      className="flex flex-col border-r border-wa-border bg-white"
      style={isMobile ? { width: '100%' } : { width: leftPanelWidth, minWidth: leftPanelWidth }}
    >
      {/* Search & Filters */}
      <div className="border-b border-wa-border p-3">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search or start a new chat"
        />
        <div className="mt-2 flex gap-1.5">
          {(['all', 'unread', 'groups'] as const).map((filter) => {
            const isActiveFilter = chatFilter === filter;
            const label = filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : 'Groups';
            return (
              <button
                key={filter}
                onClick={() => setChatFilter(filter)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: isActiveFilter ? '#075E54' : '#f0f2f5',
                  color: isActiveFilter ? '#ffffff' : '#667781',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <MessageSquare className="h-10 w-10 text-wa-text-muted mb-3" />
            <p className="text-sm text-wa-text-muted">
              {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          filteredChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={selectedChat?.id === chat.id}
              onSelect={() => handleSelectChat(chat)}
            />
          ))
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Messages panel
  // ---------------------------------------------------------------------------
  const messagesPanel = (
    <div className="flex flex-1 flex-col min-w-0">
      {!selectedChat ? (
        /* Empty state */
        <div
          className="flex flex-1 flex-col items-center justify-center"
          style={{ backgroundColor: '#f0f2f5' }}
        >
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full mb-6"
            style={{ backgroundColor: 'rgba(7,94,84,0.08)' }}
          >
            <MessageSquare className="h-10 w-10 text-wa-teal" />
          </div>
          <h2 className="text-xl font-light text-wa-text">WAutoChat Web</h2>
          <p className="mt-3 max-w-sm text-center text-sm text-wa-text-secondary leading-relaxed">
            Select a conversation to start messaging.
            <br />
            Send and receive messages in real time.
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-wa-text-muted">
            <span style={{ fontSize: 11 }}>End-to-end encrypted</span>
          </div>
        </div>
      ) : (
        <>
          {/* ------- Chat Header ------- */}
          <div
            className="flex items-center justify-between border-b border-wa-border px-3 md:px-4 py-2"
            style={{ backgroundColor: '#f0f2f5' }}
          >
            <div className="flex items-center gap-2 md:gap-3">
              {/* Back button on mobile */}
              {isMobile && (
                <button
                  onClick={handleBackToList}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-wa-text-secondary hover:bg-wa-hover transition-colors shrink-0"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              <Avatar size="md" name={selectedChat.name} src={selectedChat.profilePicUrl} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-wa-text truncate">{selectedChat.name}</p>
                <p className="text-xs text-wa-text-muted">
                  {selectedChat.isGroup ? 'Group' : 'online'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button className="rounded-full p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors">
                <Search className="h-5 w-5" />
              </button>
              <button className="rounded-full p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* ------- Messages Area ------- */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto py-4 px-2 md:px-4"
            style={{
              backgroundColor: '#e5ddd5',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='a' patternUnits='userSpaceOnUse' width='40' height='40'%3E%3Cpath d='M0 20h40M20 0v40' fill='none' stroke='%23c8c3ba' stroke-width='.5' opacity='.15'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='200' height='200' fill='%23e5ddd5'/%3E%3Crect width='200' height='200' fill='url(%23a)'/%3E%3C/svg%3E")`,
              backgroundSize: '200px 200px',
            }}
          >
            {messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <Spinner size="md" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p
                  className="rounded-lg px-4 py-2 text-sm text-wa-text-muted shadow-sm"
                  style={{ backgroundColor: 'rgba(255,255,255,0.85)' }}
                >
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              <>
                {messageGroups.map((group) => (
                  <div key={group.date}>
                    <div className="my-3 flex justify-center">
                      <span
                        className="rounded-lg px-3 py-1 text-xs font-medium shadow-sm"
                        style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#667781' }}
                      >
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} isGroup={selectedChat?.isGroup || false} isMobile={isMobile} />
                    ))}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* ------- Input Area ------- */}
          <div className="border-t border-wa-border px-2 md:px-3 py-2" style={{ backgroundColor: '#f0f2f5' }}>
            <div className="flex items-end gap-1.5 md:gap-2">
              {/* Paperclip */}
              <button className="rounded-full p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors mb-0.5 hidden md:flex">
                <Paperclip className="h-5 w-5" />
              </button>

              {/* Text input */}
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    handleTextareaInput();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message"
                  rows={1}
                  className="w-full resize-none rounded-lg border-0 px-3 md:px-4 py-2.5 text-sm text-wa-text placeholder:text-wa-text-muted focus:outline-none"
                  style={{
                    maxHeight: 120,
                    backgroundColor: '#ffffff',
                    borderRadius: 8,
                  }}
                />
              </div>

              {/* Send or Mic */}
              {messageText.trim() ? (
                <button
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-50 mb-0.5"
                  style={{ backgroundColor: '#075E54' }}
                >
                  <Send className="h-5 w-5" />
                </button>
              ) : (
                <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-text-secondary hover:bg-wa-hover transition-colors mb-0.5">
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Layout: Mobile uses view switching, tablet/desktop uses side-by-side
  // ---------------------------------------------------------------------------

  if (isMobile) {
    return (
      <div className="flex h-full overflow-hidden">
        {mobileShowMessages && selectedChat ? messagesPanel : chatListPanel}
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {chatListPanel}
      {messagesPanel}
    </div>
  );
}
