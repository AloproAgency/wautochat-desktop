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
  RefreshCw,
  Phone,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { Chat, Message, ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHATSAPP_GREEN = '#25D366';
const WHATSAPP_SENT_BG = '#d9fdd3';
const WHATSAPP_CHAT_BG = '#efeae2';
const WHATSAPP_INPUT_BG = '#f0f2f5';
const WHATSAPP_HEADER_BG = '#ffffff';
const WHATSAPP_TEAL = '#008069';
const WHATSAPP_BLUE_CHECK = '#53bdeb';

// Deterministic avatar colors
const AVATAR_COLORS = [
  '#00a884', '#02735e', '#025144', '#128c7e', '#0d7377',
  '#075e54', '#1fa855', '#25d366', '#34b7f1', '#00bcd4',
  '#009688', '#4caf50', '#607d8b', '#795548', '#ff5722',
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

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

function InlineAvatar({
  name,
  src,
  size = 46,
}: {
  name: string;
  src?: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#ffffff',
        fontWeight: 600,
        fontSize: size * 0.36,
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock style={{ width: 14, height: 14, color: '#8696a0' }} />;
    case 'sent':
      return <Check style={{ width: 14, height: 14, color: '#8696a0' }} />;
    case 'delivered':
      return <CheckCheck style={{ width: 14, height: 14, color: '#8696a0' }} />;
    case 'read':
      return <CheckCheck style={{ width: 14, height: 14, color: WHATSAPP_BLUE_CHECK }} />;
    case 'failed':
      return <AlertCircle style={{ width: 14, height: 14, color: '#ea4335' }} />;
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
              style={{ maxWidth: 280, borderRadius: 6, display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 160,
                backgroundColor: 'rgba(0,0,0,0.06)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ImageIcon style={{ width: 40, height: 40, color: '#8696a0' }} />
            </div>
          )}
          {(message.caption || message.body) && !isBase64(message.body) && (
            <p style={{ marginTop: 4, fontSize: 14, whiteSpace: 'pre-wrap' }}>
              {message.caption || message.body}
            </p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {message.mediaUrl ? (
            <video
              src={message.mediaUrl}
              style={{ maxWidth: 280, borderRadius: 6 }}
              controls
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 160,
                backgroundColor: 'rgba(0,0,0,0.08)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Play style={{ width: 40, height: 40, color: '#ffffff' }} />
            </div>
          )}
          {message.caption && (
            <p style={{ marginTop: 4, fontSize: 14, whiteSpace: 'pre-wrap' }}>
              {message.caption}
            </p>
          )}
        </div>
      );

    case 'audio':
    case 'ptt':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 200 }}>
          <button
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#075E54',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Play style={{ width: 16, height: 16, color: '#ffffff' }} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(134,150,160,0.3)' }}>
              <div style={{ height: 4, width: '33%', borderRadius: 2, backgroundColor: WHATSAPP_TEAL }} />
            </div>
            <p style={{ marginTop: 4, fontSize: 12, color: '#8696a0' }}>0:00</p>
          </div>
        </div>
      );

    case 'document':
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderRadius: 6,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <File style={{ width: 32, height: 32, flexShrink: 0, color: WHATSAPP_TEAL }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.body || 'Document'}
            </p>
            <p style={{ fontSize: 12, color: '#8696a0' }}>{message.mediaType || 'File'}</p>
          </div>
        </div>
      );

    case 'location':
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 6,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <MapPin style={{ width: 24, height: 24, flexShrink: 0, color: '#ea4335' }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Location</p>
            <p style={{ fontSize: 12, color: '#8696a0' }}>{message.body || 'Shared location'}</p>
          </div>
        </div>
      );

    case 'contact':
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 6,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <UserCircle style={{ width: 24, height: 24, flexShrink: 0, color: WHATSAPP_TEAL }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Contact</p>
            <p style={{ fontSize: 12, color: '#8696a0' }}>{message.body || 'Shared contact'}</p>
          </div>
        </div>
      );

    case 'sticker':
      return (
        <div style={{ width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {message.mediaUrl ? (
            <img src={message.mediaUrl} alt="Sticker" style={{ maxWidth: 120, maxHeight: 120 }} />
          ) : (
            <Smile style={{ width: 64, height: 64, color: '#8696a0' }} />
          )}
        </div>
      );

    default: {
      const body = message.body || '';
      if (isBase64(body)) return <p style={{ fontSize: 14, fontStyle: 'italic', color: '#8696a0' }}>Media</p>;
      return <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{body}</p>;
    }
  }
}

function MessageBubble({
  message,
  isGroup,
  isMobile,
}: {
  message: Message;
  isGroup: boolean;
  isMobile: boolean;
}) {
  const isSent = message.fromMe;
  const time = formatMessageTime(message.timestamp);
  const body = message.body || message.caption || '';

  // Skip completely empty text messages
  if (!body && !message.mediaUrl && message.type === 'text') {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
        marginBottom: 2,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: isMobile ? '85%' : '65%',
          backgroundColor: isSent ? WHATSAPP_SENT_BG : '#ffffff',
          borderRadius: isSent ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          padding: '6px 8px',
          boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
        }}
      >
        {/* Sender name in groups for received messages */}
        {!isSent && isGroup && message.senderName && (
          <p style={{ marginBottom: 2, fontSize: 12, fontWeight: 600, color: WHATSAPP_TEAL }}>
            {message.senderName}
          </p>
        )}
        <MessageContent message={message} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 3,
            marginTop: 2,
            marginBottom: -2,
          }}
        >
          <span style={{ fontSize: 11, color: '#8696a0' }}>{time}</span>
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
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        gap: 12,
        paddingTop: 10,
        paddingBottom: 10,
        paddingLeft: isSelected ? 9 : 12,
        paddingRight: 12,
        textAlign: 'left',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
        borderLeft: isSelected ? `3px solid ${WHATSAPP_GREEN}` : '3px solid transparent',
        borderBottom: '1px solid #f0f2f5',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = '#f5f6f6';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <InlineAvatar name={chat.name} src={chat.profilePicUrl} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#111b21',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {chat.name}
          </p>
          <span
            style={{
              flexShrink: 0,
              marginLeft: 8,
              fontSize: 12,
              color: chat.unreadCount > 0 ? WHATSAPP_GREEN : '#8696a0',
              fontWeight: chat.unreadCount > 0 ? 600 : 400,
            }}
          >
            {ts ? formatTimestamp(ts) : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <p
            style={{
              fontSize: 13,
              color: '#667781',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingRight: 8,
            }}
          >
            {lastMessagePreview(chat)}
          </p>
          {chat.unreadCount > 0 && (
            <span
              style={{
                display: 'flex',
                height: 20,
                minWidth: 20,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                paddingLeft: 6,
                paddingRight: 6,
                fontSize: 11,
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: WHATSAPP_GREEN,
                flexShrink: 0,
              }}
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
  const [searchOpen, setSearchOpen] = useState(false);

  // Mobile: track if we are viewing messages (vs chat list)
  const [mobileShowMessages, setMobileShowMessages] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
          const seen = new Map<string, Chat>();
          for (const chat of data.data) {
            const existing = seen.get(chat.wppId);
            if (
              !existing ||
              (chat.lastMessage && !existing.lastMessage) ||
              new Date(chat.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
            ) {
              seen.set(chat.wppId, chat);
            }
          }
          const deduped = Array.from(seen.values());
          const filtered = deduped.filter((c) => c.wppId !== 'status@broadcast');
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
        const res = await fetch(`/api/messages?sessionId=${activeSessionId}&chatId=${chat.id}`);
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
  // Select a chat
  // ---------------------------------------------------------------------------
  const handleSelectChat = useCallback(
    (chat: Chat) => {
      setSelectedChat(chat);
      if (isMobile) {
        setMobileShowMessages(true);
      }
    },
    [isMobile]
  );

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
  const leftPanelWidth = isMobile ? '100%' : isTablet ? 300 : 380;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeSessionId) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: 16, fontSize: 14, color: '#8696a0' }}>Connecting to session...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Chat list panel
  // ---------------------------------------------------------------------------
  const chatListPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: isMobile ? '100%' : leftPanelWidth,
        minWidth: isMobile ? undefined : leftPanelWidth,
        maxWidth: isMobile ? undefined : leftPanelWidth,
        borderRight: isMobile ? 'none' : '1px solid #e9edef',
        backgroundColor: '#ffffff',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px 0 16px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e9edef',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111b21', margin: 0 }}>Messages</h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 22,
                minWidth: 22,
                borderRadius: 11,
                padding: '0 6px',
                fontSize: 12,
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: WHATSAPP_GREEN,
              }}
            >
              {chats.length}
            </span>
          </div>
          <button
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 100);
              } else {
                setSearchQuery('');
              }
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#54656f',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <Search style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Search input */}
        <div
          style={{
            position: 'relative',
            marginBottom: 10,
            display: searchOpen || searchQuery ? 'block' : 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 12,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#8696a0',
            }}
          >
            <Search style={{ width: 16, height: 16 }} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: '100%',
              height: 36,
              borderRadius: 18,
              border: 'none',
              backgroundColor: WHATSAPP_INPUT_BG,
              paddingLeft: 36,
              paddingRight: 12,
              fontSize: 14,
              color: '#111b21',
              outline: 'none',
            }}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
          {(['all', 'unread', 'groups'] as const).map((filter) => {
            const isActive = chatFilter === filter;
            const label = filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : 'Groups';
            return (
              <button
                key={filter}
                onClick={() => setChatFilter(filter)}
                style={{
                  height: 28,
                  borderRadius: 14,
                  padding: '0 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? WHATSAPP_GREEN : WHATSAPP_INPUT_BG,
                  color: isActive ? '#ffffff' : '#54656f',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contact list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredChats.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 16px',
              textAlign: 'center',
            }}
          >
            <MessageSquare style={{ width: 40, height: 40, color: '#8696a0', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: '#8696a0' }}>
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
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0, height: '100%' }}>
      {!selectedChat ? (
        /* Empty state */
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f0f2f5',
          }}
        >
          <MessageSquare style={{ width: 64, height: 64, color: '#d1d5db', marginBottom: 24 }} />
          <h2 style={{ fontSize: 24, fontWeight: 600, color: '#4b5563', margin: 0 }}>WAutoChat</h2>
          <p style={{ marginTop: 12, fontSize: 14, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
            Send and receive messages
          </p>
        </div>
      ) : (
        <>
          {/* Chat Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 56,
              paddingLeft: isMobile ? 8 : 16,
              paddingRight: 8,
              backgroundColor: WHATSAPP_HEADER_BG,
              borderBottom: '1px solid #e9edef',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
              {isMobile && (
                <button
                  onClick={handleBackToList}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#54656f',
                    flexShrink: 0,
                  }}
                >
                  <ArrowLeft style={{ width: 22, height: 22 }} />
                </button>
              )}
              <InlineAvatar name={selectedChat.name} src={selectedChat.profilePicUrl} size={40} />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#111b21',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedChat.name}
                </p>
                <p style={{ fontSize: 12, color: WHATSAPP_GREEN, margin: 0 }}>
                  {selectedChat.isGroup ? 'Group' : 'Online'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {[RefreshCw, Search, Phone, MoreVertical].map((Icon, i) => (
                <button
                  key={i}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#54656f',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <Icon style={{ width: 20, height: 20 }} />
                </button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 16,
              paddingRight: 16,
              backgroundColor: WHATSAPP_CHAT_BG,
            }}
          >
            {messagesLoading ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="md" />
              </div>
            ) : messages.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <p
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: 14,
                    color: '#8696a0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }}
                >
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              <>
                {messageGroups.map((group) => (
                  <div key={group.date}>
                    {/* Date separator */}
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                      <span
                        style={{
                          backgroundColor: '#ffffff',
                          borderRadius: 8,
                          padding: '4px 12px',
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#54656f',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        }}
                      >
                        {group.date}
                      </span>
                    </div>
                    {group.messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isGroup={selectedChat?.isGroup || false}
                        isMobile={isMobile}
                      />
                    ))}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: isMobile ? 6 : 8,
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderTop: '1px solid #e9edef',
              minHeight: 60,
              flexShrink: 0,
            }}
          >
            {/* Paperclip */}
            <button
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                display: isMobile ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#54656f',
                flexShrink: 0,
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Paperclip style={{ width: 22, height: 22 }} />
            </button>

            {/* Emoji */}
            <button
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#54656f',
                flexShrink: 0,
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Smile style={{ width: 22, height: 22 }} />
            </button>

            {/* Text area */}
            <div style={{ flex: 1, minWidth: 0 }}>
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
                style={{
                  width: '100%',
                  resize: 'none',
                  borderRadius: 20,
                  border: 'none',
                  backgroundColor: WHATSAPP_INPUT_BG,
                  padding: '10px 16px',
                  fontSize: 14,
                  color: '#111b21',
                  outline: 'none',
                  maxHeight: 120,
                  lineHeight: '20px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Send or Mic */}
            {messageText.trim() ? (
              <button
                onClick={handleSendMessage}
                disabled={sending}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: WHATSAPP_GREEN,
                  cursor: sending ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  flexShrink: 0,
                  opacity: sending ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <Send style={{ width: 20, height: 20 }} />
              </button>
            ) : (
              <button
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#54656f',
                  flexShrink: 0,
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f2f5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Mic style={{ width: 22, height: 22 }} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  if (isMobile) {
    return (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {mobileShowMessages && selectedChat ? messagesPanel : chatListPanel}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {chatListPanel}
      {messagesPanel}
    </div>
  );
}
