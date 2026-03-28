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
  Video,
  Info,
  Camera,
  Images,
  Copy,
  PhoneCall,
  Share2 as Share2Icon,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useActiveSession } from '@/hooks/use-active-session';
import { useSessionStore } from '@/lib/store';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { Chat, Message, ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants & Theme
// ---------------------------------------------------------------------------

const THEME = {
  primary: '#075E54',
  primaryDark: '#054640',
  sent: '#DCF8C6',
  received: '#ffffff',
  chatBg: '#efeae2',
  inputBg: '#f0f2f5',
  headerBg: '#ffffff',
  teal: '#075E54',
  green: '#25D366',
  blueCheck: '#53bdeb',
  textPrimary: '#111b21',
  textSecondary: '#667781',
  textMuted: '#8696a0',
  border: '#e9edef',
  hoverBg: '#f5f6f6',
  selectedBg: '#eef5f3',
};

const CHAT_PATTERN = `url("data:image/svg+xml,%3Csvg width='400' height='400' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' width='80' height='80' patternUnits='userSpaceOnUse'%3E%3Cpath d='M10 10c2-2 5-1 6 1s0 5-2 6-5 0-6-2 0-4 2-5zm50 20c1.5-1 4 0 4 2s-2 4-4 3.5-2.5-3-1.5-4.5zm-30 35c2 0 3 2 2.5 4s-3 3-4.5 1.5 0-5 2-5.5zm55 10c1 1 1 3-.5 4s-4 .5-4-1.5 3-4 4.5-2.5zM25 65c1.5.5 2 3 .5 4.5s-4 1-4.5-.5 2.5-4.5 4-4z' fill='%23d4cfc6' fill-opacity='.35'/%3E%3Ccircle cx='60' cy='12' r='1.5' fill='%23d4cfc6' fill-opacity='.3'/%3E%3Ccircle cx='15' cy='50' r='1' fill='%23d4cfc6' fill-opacity='.25'/%3E%3Ccircle cx='70' cy='55' r='1.2' fill='%23d4cfc6' fill-opacity='.3'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='400' height='400' fill='%23efeae2'/%3E%3Crect width='400' height='400' fill='url(%23p)'/%3E%3C/svg%3E")`;

const AVATAR_COLORS = [
  '#00a884', '#02735e', '#025144', '#128c7e', '#0d7377',
  '#075e54', '#1fa855', '#25d366', '#34b7f1', '#00bcd4',
  '#009688', '#4caf50', '#607d8b', '#795548', '#ff5722',
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InlineAvatar({
  name,
  src,
  size = 46,
  online,
}: {
  name: string;
  src?: string;
  size?: number;
  online?: boolean;
}) {
  const content = src ? (
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
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: getAvatarColor(name),
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
      {getInitials(name)}
    </div>
  );

  if (online === undefined) return content;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {content}
      {online && (
        <span
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: '50%',
            backgroundColor: THEME.primary,
            border: '2px solid #ffffff',
          }}
        />
      )}
    </div>
  );
}

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock style={{ width: 14, height: 14, color: THEME.textMuted }} />;
    case 'sent':
      return <Check style={{ width: 14, height: 14, color: THEME.textMuted }} />;
    case 'delivered':
      return <CheckCheck style={{ width: 14, height: 14, color: THEME.textMuted }} />;
    case 'read':
      return <CheckCheck style={{ width: 14, height: 14, color: THEME.blueCheck }} />;
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
              style={{ maxWidth: 280, borderRadius: 8, display: 'block', width: '100%' }}
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 160,
                backgroundColor: 'rgba(0,0,0,0.06)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ImageIcon style={{ width: 40, height: 40, color: THEME.textMuted }} />
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
              style={{ maxWidth: 280, borderRadius: 8 }}
              controls
            />
          ) : (
            <div
              style={{
                width: 280,
                height: 160,
                backgroundColor: 'rgba(0,0,0,0.08)',
                borderRadius: 8,
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
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: THEME.primary,
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
              <div style={{ height: 4, width: '33%', borderRadius: 2, backgroundColor: THEME.primary }} />
            </div>
            <p style={{ marginTop: 4, fontSize: 12, color: THEME.textMuted }}>0:00</p>
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
            borderRadius: 8,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              backgroundColor: '#ff5252',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <File style={{ width: 20, height: 20, color: '#ffffff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.body || 'Document'}
            </p>
            <p style={{ fontSize: 12, color: THEME.textMuted }}>{message.mediaType || 'File'}</p>
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
            borderRadius: 8,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <MapPin style={{ width: 24, height: 24, flexShrink: 0, color: '#ea4335' }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Location</p>
            <p style={{ fontSize: 12, color: THEME.textMuted }}>{message.body || 'Shared location'}</p>
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
            borderRadius: 8,
            padding: 12,
            minWidth: 200,
            backgroundColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <UserCircle style={{ width: 24, height: 24, flexShrink: 0, color: THEME.primary }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 500 }}>Contact</p>
            <p style={{ fontSize: 12, color: THEME.textMuted }}>{message.body || 'Shared contact'}</p>
          </div>
        </div>
      );

    case 'sticker':
      return (
        <div style={{ width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {message.mediaUrl ? (
            <img src={message.mediaUrl} alt="Sticker" style={{ maxWidth: 120, maxHeight: 120 }} />
          ) : (
            <Smile style={{ width: 64, height: 64, color: THEME.textMuted }} />
          )}
        </div>
      );

    default: {
      const body = message.body || '';
      if (isBase64(body)) return <p style={{ fontSize: 14, fontStyle: 'italic', color: THEME.textMuted }}>Media</p>;
      return <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', margin: 0 }}>{body}</p>;
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

  if (!body && !message.mediaUrl && message.type === 'text') {
    return null;
  }

  const hasMedia = message.type === 'image' || message.type === 'video' || message.type === 'sticker';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isSent ? 'flex-end' : 'flex-start',
        marginBottom: 3,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: isMobile ? '85%' : '60%',
          backgroundColor: isSent ? THEME.sent : THEME.received,
          borderRadius: isSent ? '10px 0px 10px 10px' : '0px 10px 10px 10px',
          padding: hasMedia ? '4px 4px 6px 4px' : '7px 10px 6px 10px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        {/* Bubble tail */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            width: 0,
            height: 0,
            ...(isSent
              ? { right: -8, borderLeft: `8px solid ${THEME.sent}`, borderBottom: '8px solid transparent' }
              : { left: -8, borderRight: `8px solid ${THEME.received}`, borderBottom: '8px solid transparent' }),
          }}
        />

        {/* Sender name in groups */}
        {!isSent && isGroup && message.senderName && (
          <p style={{ marginBottom: 2, fontSize: 12, fontWeight: 600, color: THEME.primary, padding: hasMedia ? '0 4px' : 0 }}>
            {message.senderName}
          </p>
        )}

        <MessageContent message={message} />

        {/* Time & status */}
        {hasMedia && message.mediaUrl ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 3,
              marginTop: -22,
              marginBottom: 2,
              paddingRight: 6,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span style={{ fontSize: 11, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{time}</span>
            {isSent && (
              <span style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                <MessageStatusIcon status={message.status} />
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 3,
              marginTop: 2,
            }}
          >
            <span style={{ fontSize: 11, color: THEME.textMuted }}>{time}</span>
            {isSent && <MessageStatusIcon status={message.status} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon Button helper
// ---------------------------------------------------------------------------

function IconBtn({
  children,
  onClick,
  size = 36,
  color = THEME.textSecondary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  size?: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: 'none',
        backgroundColor: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.inputBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chat List Item
// ---------------------------------------------------------------------------

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
        backgroundColor: isSelected ? THEME.selectedBg : 'transparent',
        borderLeft: isSelected ? `3px solid ${THEME.primary}` : '3px solid transparent',
        borderBottom: `1px solid ${THEME.border}`,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = THEME.hoverBg;
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
              color: THEME.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
            }}
          >
            {chat.name}
          </p>
          <span
            style={{
              flexShrink: 0,
              marginLeft: 8,
              fontSize: 12,
              color: chat.unreadCount > 0 ? THEME.primary : THEME.textMuted,
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
              color: THEME.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingRight: 8,
              margin: 0,
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
                backgroundColor: THEME.primary,
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
// Main Page
// ---------------------------------------------------------------------------

export default function ConversationsPage() {
  const activeSessionId = useActiveSession();
  const { sessions, setActiveSession } = useSessionStore();
  const { toast } = useToast();
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);

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
  const [chatFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [contactFilter, setContactFilter] = useState<'all' | 'direct' | 'group'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileShowMessages, setMobileShowMessages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [chatPresence, setChatPresence] = useState<{ isOnline: boolean; lastSeen: string | null }>({ isOnline: false, lastSeen: null });
  const [statusContacts, setStatusContacts] = useState<{ id: string; name: string; profilePicUrl: string; totalCount: number }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  // Sync chats from WhatsApp then fetch from DB
  const syncAndFetchChats = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      // Sync chats from WhatsApp first
      await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
    } catch {
      // Sync failed (session not connected), still show DB chats
    }
    await fetchChats();
  }, [activeSessionId, fetchChats]);

  useEffect(() => {
    if (!activeSessionId) return;
    setLoading(true);
    syncAndFetchChats().finally(() => setLoading(false));

    // Fetch WhatsApp statuses
    fetch(`/api/whatsapp-status?sessionId=${activeSessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setStatusContacts(data.data);
        }
      })
      .catch(() => {});
  }, [activeSessionId, syncAndFetchChats]);

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

  // Check online presence for selected chat
  useEffect(() => {
    if (!selectedChat || !activeSessionId || selectedChat.isGroup) {
      setChatPresence({ isOnline: false, lastSeen: null });
      return;
    }

    let cancelled = false;
    const checkPresence = async () => {
      try {
        const res = await fetch(`/api/presence?sessionId=${activeSessionId}&chatId=${selectedChat.wppId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.success && data.data) {
            setChatPresence(data.data);
          }
        }
      } catch {
        // ignore
      }
    };

    checkPresence();
    const interval = setInterval(checkPresence, 15000); // Check every 15s

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedChat, activeSessionId]);

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
  // Send file (image, video, document)
  // ---------------------------------------------------------------------------
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, mode: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat || !activeSessionId) return;

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;

      // Determine type
      let type: string = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      // Add temp message
      const tempId = `temp-${Date.now()}`;
      const tempMsg: Message = {
        id: tempId,
        sessionId: activeSessionId,
        chatId: selectedChat.id,
        wppId: '',
        type: type as Message['type'],
        body: file.name,
        sender: 'me',
        senderName: 'You',
        fromMe: true,
        timestamp: new Date().toISOString(),
        status: 'pending',
        isForwarded: false,
        labels: [],
        mediaUrl: type === 'image' ? base64 : undefined,
      };
      setMessages((prev) => [...prev, tempMsg]);

      try {
        setSending(true);
        const content = type === 'image'
          ? { url: base64, caption: '' }
          : type === 'document'
          ? { url: base64, fileName: file.name }
          : { url: base64 };

        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSessionId,
            chatId: selectedChat.wppId,
            type,
            content,
          }),
        });

        if (res.ok) {
          const data: ApiResponse<{ id: string; status: string }> = await res.json();
          if (data.success && data.data) {
            setMessages((prev) =>
              prev.map((m) => m.id === tempId ? { ...m, id: data.data!.id, status: 'sent' as const } : m)
            );
          }
        } else {
          setMessages((prev) =>
            prev.map((m) => m.id === tempId ? { ...m, status: 'failed' as const } : m)
          );
          toast({ title: 'Failed to send file', variant: 'error' });
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, status: 'failed' as const } : m)
        );
        toast({ title: 'Failed to send file', variant: 'error' });
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  }, [selectedChat, activeSessionId, toast]);

  // Emoji list
  const EMOJI_LIST = [
    '😀', '😂', '🥰', '😍', '😘', '😊', '🤗', '🤔', '😎', '🥳',
    '😭', '😤', '😱', '🤯', '😴', '🤮', '👍', '👎', '👏', '🙏',
    '❤️', '🔥', '💯', '✅', '⭐', '🎉', '💪', '👀', '🤝', '💔',
    '😈', '👻', '💀', '🤡', '🙈', '🙉', '🙊', '🐶', '🦁', '🌹',
  ];

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

      // Apply contact filter (Direct = all non-group, Group = groups only)
      if (contactFilter === 'group' && !chat.isGroup) return false;
      if (contactFilter === 'direct' && chat.isGroup) return false;

      if (chatFilter === 'unread') return matchesSearch && chat.unreadCount > 0;
      if (chatFilter === 'groups') return matchesSearch && chat.isGroup;
      return matchesSearch;
    });
  }, [chats, searchQuery, chatFilter, contactFilter]);

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  const leftPanelWidth = isMobile ? '100%' : isTablet ? 320 : 380;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeSessionId) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Spinner size="lg" />
          <p style={{ marginTop: 16, fontSize: 14, color: THEME.textMuted }}>Connecting to session...</p>
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
  // LEFT PANEL
  // ---------------------------------------------------------------------------
  const chatListPanel = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: isMobile ? '100%' : leftPanelWidth,
        minWidth: isMobile ? undefined : leftPanelWidth,
        maxWidth: isMobile ? undefined : leftPanelWidth,
        borderRight: isMobile ? 'none' : `1px solid ${THEME.border}`,
        backgroundColor: '#ffffff',
        height: '100%',
      }}
    >
      {/* Session selector header */}
      <div
        style={{
          position: 'relative',
          padding: '12px 16px',
          borderBottom: `1px solid ${THEME.border}`,
        }}
      >
        <button
          onClick={() => setSessionDropdownOpen(!sessionDropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '8px 12px',
            borderRadius: 10,
            border: `1px solid ${THEME.border}`,
            backgroundColor: '#ffffff',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = THEME.primary; }}
          onMouseLeave={(e) => { if (!sessionDropdownOpen) e.currentTarget.style.borderColor = THEME.border; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: THEME.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {(() => {
                const activeSession = sessions.find((s) => s.id === activeSessionId);
                return activeSession ? activeSession.name.charAt(0).toUpperCase() : 'W';
              })()}
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>
                {sessions.find((s) => s.id === activeSessionId)?.name || 'WAutoChat'}
              </p>
              <p style={{
                fontSize: 11,
                margin: 0,
                color: sessions.find((s) => s.id === activeSessionId)?.status === 'connected' ? '#25D366' : THEME.textMuted,
              }}>
                {sessions.find((s) => s.id === activeSessionId)?.status === 'connected' ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: sessionDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <path d="M4 6L8 10L12 6" stroke={THEME.textSecondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown */}
        {sessionDropdownOpen && (
          <>
            {/* Overlay to close dropdown */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 10 }}
              onClick={() => setSessionDropdownOpen(false)}
            />
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 16,
                right: 16,
                zIndex: 20,
                backgroundColor: '#ffffff',
                borderRadius: 10,
                border: `1px solid ${THEME.border}`,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {sessions.length === 0 ? (
                <p style={{ padding: 16, fontSize: 13, color: THEME.textMuted, margin: 0, textAlign: 'center' }}>
                  No sessions available
                </p>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isConnected = session.status === 'connected';
                  return (
                    <button
                      key={session.id}
                      onClick={() => {
                        setActiveSession(session.id);
                        setSessionDropdownOpen(false);
                        setSelectedChat(null);
                        setMessages([]);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: isActive ? THEME.selectedBg : 'transparent',
                        borderBottom: `1px solid ${THEME.border}`,
                        textAlign: 'left',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = THEME.hoverBg; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: isConnected ? THEME.primary : THEME.textMuted,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: 13,
                          flexShrink: 0,
                        }}
                      >
                        {session.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: THEME.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.name}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              backgroundColor: isConnected ? '#25D366' : '#ef4444',
                            }}
                          />
                          <span style={{ fontSize: 11, color: isConnected ? '#25D366' : THEME.textMuted }}>
                            {session.status === 'connected' ? 'Connected' : session.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                          </span>
                        </div>
                      </div>
                      {isActive && (
                        <Check style={{ width: 16, height: 16, color: THEME.primary, flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* WhatsApp Status - only contacts who posted a status */}
      {statusContacts.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${THEME.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: THEME.textPrimary, margin: 0 }}>Status</p>
            <button
              onClick={() => setShowAllRecent(!showAllRecent)}
              style={{ fontSize: 12, color: THEME.primary, cursor: 'pointer', fontWeight: 500, border: 'none', backgroundColor: 'transparent', padding: 0 }}
            >
              {showAllRecent ? 'Show Less' : 'View All'}
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: showAllRecent ? 'visible' : 'auto',
              flexWrap: showAllRecent ? 'wrap' : 'nowrap',
              paddingBottom: 4,
            }}
          >
            {(showAllRecent ? statusContacts : statusContacts.slice(0, 8)).map((sc) => {
              // Find matching chat to open conversation
              const matchingChat = chats.find((c) => c.wppId === sc.id);
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    if (matchingChat) handleSelectChat(matchingChat);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 52,
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: matchingChat ? 'pointer' : 'default',
                    padding: 2,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      padding: 2,
                      background: `conic-gradient(#25D366 0deg, #25D366 360deg)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', backgroundColor: '#ffffff', padding: 1 }}>
                      <InlineAvatar name={sc.name || sc.id} src={sc.profilePicUrl || undefined} size={40} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: THEME.textSecondary,
                      maxWidth: 52,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                      display: 'block',
                      width: '100%',
                    }}
                  >
                    {(sc.name || sc.id).split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Message count + search */}
      <div style={{ padding: '12px 16px 0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: THEME.textPrimary, margin: 0 }}>
              Chat ({chats.length})
            </p>
          </div>
          <IconBtn
            onClick={() => {
              setSearchOpen(!searchOpen);
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
              else setSearchQuery('');
            }}
          >
            <Search style={{ width: 18, height: 18 }} />
          </IconBtn>
        </div>

        {/* Search input */}
        {(searchOpen || searchQuery) && (
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 12,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: THEME.textMuted,
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
                backgroundColor: THEME.inputBg,
                paddingLeft: 36,
                paddingRight: 12,
                fontSize: 14,
                color: THEME.textPrimary,
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Filters: All / Direct / Group */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['all', 'direct', 'group'] as const).map((filter) => {
            const isActive = contactFilter === filter;
            const label = filter === 'all' ? 'All' : filter === 'direct' ? 'Direct' : 'Group';
            return (
              <button
                key={filter}
                onClick={() => setContactFilter(filter)}
                style={{
                  flex: 1,
                  height: 30,
                  borderRadius: 15,
                  border: isActive ? 'none' : `1px solid ${THEME.border}`,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? THEME.primary : 'transparent',
                  color: isActive ? '#ffffff' : THEME.textSecondary,
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
              padding: '48px 16px',
              textAlign: 'center',
            }}
          >
            <MessageSquare style={{ width: 40, height: 40, color: THEME.textMuted, marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: THEME.textMuted, margin: 0 }}>
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
  // RIGHT PANEL (Messages)
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
            backgroundImage: CHAT_PATTERN,
            backgroundSize: '400px 400px',
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              backgroundColor: THEME.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}
          >
            <MessageSquare style={{ width: 36, height: 36, color: '#ffffff' }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: '#4b5563', margin: 0 }}>WAutoChat</h2>
          <p style={{ marginTop: 12, fontSize: 14, color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
            Select a conversation to start messaging
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
              height: 60,
              paddingLeft: isMobile ? 8 : 16,
              paddingRight: 12,
              backgroundColor: THEME.headerBg,
              borderBottom: `1px solid ${THEME.border}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, minWidth: 0 }}>
              {isMobile && (
                <IconBtn onClick={handleBackToList}>
                  <ArrowLeft style={{ width: 22, height: 22 }} />
                </IconBtn>
              )}
              <InlineAvatar
                name={selectedChat.name}
                src={selectedChat.profilePicUrl}
                size={42}
                online={!selectedChat.isGroup && chatPresence.isOnline}
              />
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: THEME.textPrimary,
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedChat.name}
                </p>
                <p style={{ fontSize: 12, color: chatPresence.isOnline ? '#25D366' : THEME.textMuted, margin: 0 }}>
                  {selectedChat.isGroup
                    ? 'Group'
                    : chatPresence.isOnline
                    ? 'Online'
                    : chatPresence.lastSeen
                    ? `Last seen ${new Date(chatPresence.lastSeen).toLocaleString()}`
                    : `${messages.length} messages`}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconBtn onClick={() => fetchMessages(selectedChat)}>
                <RefreshCw style={{ width: 18, height: 18 }} />
              </IconBtn>
              <IconBtn>
                <Search style={{ width: 18, height: 18 }} />
              </IconBtn>
              <IconBtn>
                <Video style={{ width: 18, height: 18 }} />
              </IconBtn>
              <IconBtn>
                <Phone style={{ width: 18, height: 18 }} />
              </IconBtn>
              <IconBtn>
                <MoreVertical style={{ width: 18, height: 18 }} />
              </IconBtn>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              paddingTop: 12,
              paddingBottom: 12,
              backgroundImage: CHAT_PATTERN,
              backgroundSize: '400px 400px',
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
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    borderRadius: 10,
                    padding: '10px 20px',
                    fontSize: 14,
                    color: THEME.textMuted,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
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
                          padding: '5px 14px',
                          fontSize: 12,
                          fontWeight: 500,
                          color: THEME.textSecondary,
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
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              padding: '10px 14px',
              backgroundColor: '#ffffff',
              borderTop: `1px solid ${THEME.border}`,
              minHeight: 60,
              flexShrink: 0,
            }}
          >
            {/* Hidden file inputs */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelected(e, 'image')}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelected(e, 'file')}
            />

            {/* Camera button - opens camera/image capture */}
            {!isMobile && (
              <>
                <IconBtn size={38} onClick={() => imageInputRef.current?.click()}>
                  <Camera style={{ width: 20, height: 20 }} />
                </IconBtn>
                {/* Gallery button - opens file picker */}
                <IconBtn size={38} onClick={() => fileInputRef.current?.click()}>
                  <Images style={{ width: 20, height: 20 }} />
                </IconBtn>
              </>
            )}

            {/* Emoji button */}
            <div style={{ position: 'relative' }}>
              <IconBtn size={38} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                <Smile style={{ width: 20, height: 20 }} />
              </IconBtn>

              {/* Emoji picker */}
              {showEmojiPicker && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                    onClick={() => setShowEmojiPicker(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 46,
                      left: 0,
                      zIndex: 20,
                      width: 280,
                      backgroundColor: '#ffffff',
                      borderRadius: 12,
                      border: `1px solid ${THEME.border}`,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      padding: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
                      {EMOJI_LIST.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setMessageText((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                            textareaRef.current?.focus();
                          }}
                          style={{
                            width: 32,
                            height: 32,
                            border: 'none',
                            backgroundColor: 'transparent',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = THEME.inputBg; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

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
                placeholder="Write your message..."
                rows={1}
                style={{
                  width: '100%',
                  resize: 'none',
                  borderRadius: 22,
                  border: `1px solid ${THEME.border}`,
                  backgroundColor: '#ffffff',
                  padding: '10px 18px',
                  fontSize: 14,
                  color: THEME.textPrimary,
                  outline: 'none',
                  maxHeight: 120,
                  lineHeight: '20px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Send or Mic (attach on mobile) */}
            {messageText.trim() ? (
              <button
                onClick={handleSendMessage}
                disabled={sending}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: THEME.primary,
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
                <Send style={{ width: 18, height: 18 }} />
              </button>
            ) : (
              <IconBtn size={40} onClick={() => fileInputRef.current?.click()}>
                <Paperclip style={{ width: 20, height: 20 }} />
              </IconBtn>
            )}
          </div>
        </>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // RIGHT SIDEBAR (Action buttons)
  // ---------------------------------------------------------------------------
  const rightSidebar = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 56,
        minWidth: 56,
        backgroundColor: '#ffffff',
        borderLeft: `1px solid ${THEME.border}`,
        padding: '16px 0',
        height: '100%',
      }}
    >
      {/* Top: user avatar with online indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <InlineAvatar name="User" size={38} online />

        {/* Action buttons */}
        {[
          { icon: RefreshCw, color: THEME.primary, bg: '#e8faf4', tooltip: 'Refresh' },
          { icon: Share2Icon, color: THEME.primary, bg: '#e8faf4', tooltip: 'Share' },
          { icon: Copy, color: THEME.primary, bg: '#e8faf4', tooltip: 'Copy' },
          { icon: Paperclip, color: THEME.primary, bg: '#e8faf4', tooltip: 'Attach' },
        ].map((item, i) => (
          <button
            key={i}
            title={item.tooltip}
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              border: 'none',
              backgroundColor: item.bg,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: item.color,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <item.icon style={{ width: 18, height: 18 }} />
          </button>
        ))}
      </div>

      {/* Bottom: colored action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* RTL button */}
        <button
          title="RTL"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#3b82f6',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 700,
            boxShadow: '0 2px 6px rgba(59,130,246,0.4)',
          }}
        >
          RTL
        </button>
        {/* Green circle */}
        <button
          title="New chat"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: THEME.primary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: `0 2px 6px rgba(44,222,168,0.4)`,
          }}
        >
          <MessageSquare style={{ width: 18, height: 18 }} />
        </button>
        {/* Red circle */}
        <button
          title="Close"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ef4444',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18, transform: 'rotate(-90deg)' }} />
        </button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  // Full-bleed wrapper to break out of the parent padding/max-width
  const fullBleedStyle: React.CSSProperties = {
    margin: isMobile ? '-16px' : '-24px',
    height: isMobile ? 'calc(100vh - 56px)' : '100vh',
    display: 'flex',
    overflow: 'hidden',
  };

  if (isMobile) {
    return (
      <div style={fullBleedStyle}>
        {mobileShowMessages && selectedChat ? messagesPanel : chatListPanel}
      </div>
    );
  }

  return (
    <div style={fullBleedStyle}>
      {chatListPanel}
      {messagesPanel}
      {rightSidebar}
    </div>
  );
}
