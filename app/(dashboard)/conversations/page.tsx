'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Search,
  Paperclip,
  Send,
  Mic,
  Image as ImageIcon,
  Video,
  FileText,
  UserCircle,
  MapPin,
  MoreVertical,
  Phone,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ChevronDown,
  File,
  Play,
  X,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useChatStore, useSessionStore } from '@/lib/store';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { Chat, Message, Session, ApiResponse } from '@/lib/types';

function MessageStatusIcon({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-3.5 w-3.5 text-wa-text-muted" />;
    case 'sent':
      return <Check className="h-3.5 w-3.5 text-wa-text-muted" />;
    case 'delivered':
      return <CheckCheck className="h-3.5 w-3.5 text-wa-text-muted" />;
    case 'read':
      return <CheckCheck className="h-3.5 w-3.5 text-wa-blue" />;
    case 'failed':
      return <AlertCircle className="h-3.5 w-3.5 text-wa-danger" />;
    default:
      return null;
  }
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const d = new Date(msg.timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    let dateLabel: string;

    if (diff === 0) dateLabel = 'Today';
    else if (diff === 1) dateLabel = 'Yesterday';
    else dateLabel = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

    if (dateLabel !== currentDate) {
      currentDate = dateLabel;
      groups.push({ date: dateLabel, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }

  return groups;
}

function MessageBubble({ message }: { message: Message }) {
  const isSent = message.fromMe;
  const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const renderContent = () => {
    switch (message.type) {
      case 'image':
        return (
          <div>
            {message.mediaUrl && (
              <img
                src={message.mediaUrl}
                alt={message.caption || 'Image'}
                className="max-w-[280px] rounded-lg"
              />
            )}
            {(message.caption || message.body) && (
              <p className="mt-1 text-sm whitespace-pre-wrap">{message.caption || message.body}</p>
            )}
          </div>
        );
      case 'video':
        return (
          <div className="relative">
            {message.mediaUrl ? (
              <video src={message.mediaUrl} className="max-w-[280px] rounded-lg" controls />
            ) : (
              <div className="flex h-40 w-[280px] items-center justify-center rounded-lg bg-black/10">
                <Play className="h-10 w-10 text-white/80" />
              </div>
            )}
            {message.caption && (
              <p className="mt-1 text-sm whitespace-pre-wrap">{message.caption}</p>
            )}
          </div>
        );
      case 'audio':
      case 'ptt':
        return (
          <div className="flex items-center gap-3 min-w-[200px]">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wa-teal text-white">
              <Play className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <div className="h-1 rounded-full bg-wa-text-muted/30">
                <div className="h-1 w-1/3 rounded-full bg-wa-teal" />
              </div>
              <p className="mt-1 text-xs text-wa-text-muted">0:00</p>
            </div>
          </div>
        );
      case 'document':
        return (
          <div className="flex items-center gap-3 min-w-[200px] rounded-lg bg-black/5 p-3">
            <File className="h-8 w-8 shrink-0 text-wa-teal" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.body || 'Document'}</p>
              <p className="text-xs text-wa-text-muted">
                {message.mediaType || 'File'}
              </p>
            </div>
          </div>
        );
      case 'location':
        return (
          <div className="flex items-center gap-2 min-w-[200px] rounded-lg bg-black/5 p-3">
            <MapPin className="h-6 w-6 shrink-0 text-wa-danger" />
            <div>
              <p className="text-sm font-medium">Location</p>
              <p className="text-xs text-wa-text-muted">{message.body || 'Shared location'}</p>
            </div>
          </div>
        );
      case 'contact':
        return (
          <div className="flex items-center gap-2 min-w-[200px] rounded-lg bg-black/5 p-3">
            <UserCircle className="h-6 w-6 shrink-0 text-wa-teal" />
            <div>
              <p className="text-sm font-medium">Contact</p>
              <p className="text-xs text-wa-text-muted">{message.body || 'Shared contact'}</p>
            </div>
          </div>
        );
      default:
        return <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>;
    }
  };

  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`relative max-w-[65%] rounded-lg px-3 py-2 shadow-sm ${
          isSent
            ? 'bg-wa-light-green text-wa-text'
            : 'bg-white text-wa-text'
        }`}
      >
        {!isSent && message.senderName && (
          <p className="mb-1 text-xs font-medium text-wa-teal">{message.senderName}</p>
        )}
        {renderContent()}
        <div className={`mt-1 flex items-center justify-end gap-1 ${isSent ? '' : ''}`}>
          <span className="text-[11px] text-wa-text-muted">{time}</span>
          {isSent && <MessageStatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const { chats, setChats, activeChatId, setActiveChat } = useChatStore();
  const { sessions, setSessions } = useSessionStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId),
    [chats, activeChatId]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'connected'),
    [sessions]
  );

  const fetchChats = useCallback(async () => {
    try {
      setLoading(true);
      const [chatsRes, sessionsRes] = await Promise.all([
        fetch('/api/chats'),
        fetch('/api/sessions'),
      ]);

      if (chatsRes.ok) {
        const data: ApiResponse<Chat[]> = await chatsRes.json();
        if (data.success && data.data) setChats(data.data);
      }

      if (sessionsRes.ok) {
        const data: ApiResponse<Session[]> = await sessionsRes.json();
        if (data.success && data.data) setSessions(data.data);
      }
    } catch {
      toast({ title: 'Failed to load conversations', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setChats, setSessions, toast]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const fetchMessages = useCallback(
    async (chatId: string) => {
      try {
        setMessagesLoading(true);
        const chat = chats.find((c) => c.id === chatId);
        if (!chat) return;

        const res = await fetch(
          `/api/messages?sessionId=${chat.sessionId}&chatId=${chat.wppId}`
        );
        if (res.ok) {
          const data: ApiResponse<Message[]> = await res.json();
          if (data.success && data.data) {
            setMessages(data.data);
          }
        }
      } catch {
        toast({ title: 'Failed to load messages', variant: 'error' });
      } finally {
        setMessagesLoading(false);
      }
    },
    [chats, toast]
  );

  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
    }
  }, [activeChatId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChat || !activeSession) return;

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sessionId: activeChat.sessionId,
      chatId: activeChat.wppId,
      wppId: '',
      type: 'text',
      body: messageText.trim(),
      sender: 'me',
      senderName: 'You',
      fromMe: true,
      timestamp: new Date().toISOString(),
      status: 'pending',
      isForwarded: false,
      labels: [],
    };

    setMessages((prev) => [...prev, tempMsg]);
    const text = messageText.trim();
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
          sessionId: activeChat.sessionId,
          chatId: activeChat.wppId,
          type: 'text',
          body: text,
        }),
      });

      if (res.ok) {
        const data: ApiResponse<Message> = await res.json();
        if (data.success && data.data) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempMsg.id ? data.data! : m))
          );
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsg.id ? { ...m, status: 'failed' as const } : m
          )
        );
        toast({ title: 'Failed to send message', variant: 'error' });
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMsg.id ? { ...m, status: 'failed' as const } : m
        )
      );
      toast({ title: 'Failed to send message', variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const filteredChats = chats.filter((chat) => {
    const matchesSearch =
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.lastMessage?.body?.toLowerCase().includes(searchQuery.toLowerCase());

    if (chatFilter === 'unread') return matchesSearch && chat.unreadCount > 0;
    if (chatFilter === 'groups') return matchesSearch && chat.isGroup;
    return matchesSearch;
  });

  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left Panel - Chat List */}
      <div className="flex w-[350px] shrink-0 flex-col border-r border-wa-border bg-wa-panel">
        {/* Chat List Header */}
        <div className="border-b border-wa-border p-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search conversations..."
          />
          <div className="mt-2 flex gap-1">
            {(['all', 'unread', 'groups'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setChatFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  chatFilter === filter
                    ? 'bg-wa-teal text-white'
                    : 'bg-wa-hover text-wa-text-secondary hover:bg-gray-200'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'unread' ? 'Unread' : 'Groups'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageSquare className="h-10 w-10 text-wa-text-muted mb-3" />
              <p className="text-sm text-wa-text-muted">No conversations found</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setActiveChat(chat.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-wa-hover ${
                  activeChatId === chat.id ? 'bg-wa-hover' : ''
                }`}
              >
                <Avatar
                  size="md"
                  name={chat.name}
                  src={chat.profilePicUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-wa-text truncate">{chat.name}</p>
                    <span
                      className={`shrink-0 text-xs ml-2 ${
                        chat.unreadCount > 0 ? 'text-wa-green font-medium' : 'text-wa-text-muted'
                      }`}
                    >
                      {chat.lastMessage ? formatTimestamp(chat.lastMessage.timestamp) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-wa-text-secondary truncate pr-2">
                      {chat.lastMessage
                        ? chat.lastMessage.fromMe
                          ? `You: ${truncate(chat.lastMessage.body || `[${chat.lastMessage.type}]`, 35)}`
                          : truncate(chat.lastMessage.body || `[${chat.lastMessage.type}]`, 40)
                        : 'No messages'}
                    </p>
                    {chat.unreadCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wa-green px-1.5 text-xs font-medium text-white">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Active Conversation */}
      <div className="flex flex-1 flex-col">
        {!activeChat ? (
          /* Empty State */
          <div className="flex flex-1 flex-col items-center justify-center bg-wa-bg-chat/30">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-wa-teal/10 mb-4">
              <MessageSquare className="h-10 w-10 text-wa-teal" />
            </div>
            <h2 className="text-xl font-semibold text-wa-text">WAutoChat Web</h2>
            <p className="mt-2 max-w-sm text-center text-sm text-wa-text-secondary">
              Select a conversation to start messaging. Send and receive messages in real time.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between border-b border-wa-border bg-wa-header px-4 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar
                  size="md"
                  name={activeChat.name}
                  src={activeChat.profilePicUrl}
                />
                <div>
                  <p className="text-sm font-semibold text-wa-text">{activeChat.name}</p>
                  <p className="text-xs text-wa-text-muted">
                    {activeChat.isGroup ? `Group` : 'Online'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="rounded-lg p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors">
                  <Phone className="h-5 w-5" />
                </button>
                <button className="rounded-lg p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors">
                  <Search className="h-5 w-5" />
                </button>
                <button className="rounded-lg p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div
              className="flex-1 overflow-y-auto px-6 py-4"
              style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'a\' patternUnits=\'userSpaceOnUse\' width=\'40\' height=\'40\'%3E%3Cpath d=\'M0 20h40M20 0v40\' fill=\'none\' stroke=\'%23e5ddd5\' stroke-width=\'.5\' opacity=\'.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'%23efeae2\' /%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23a)\' /%3E%3C/svg%3E")',
                backgroundSize: '200px 200px',
              }}
            >
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner size="md" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="rounded-lg bg-white/80 px-4 py-2 text-sm text-wa-text-muted shadow-sm">
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                <>
                  {messageGroups.map((group) => (
                    <div key={group.date}>
                      <div className="my-3 flex justify-center">
                        <span className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-wa-text-muted shadow-sm">
                          {group.date}
                        </span>
                      </div>
                      {group.messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-wa-border bg-wa-header px-4 py-3">
              <div className="flex items-end gap-2">
                {/* Attachment Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className="rounded-full p-2 text-wa-text-secondary hover:bg-wa-hover transition-colors"
                  >
                    {showAttachMenu ? (
                      <X className="h-5 w-5" />
                    ) : (
                      <Paperclip className="h-5 w-5" />
                    )}
                  </button>
                  {showAttachMenu && (
                    <div className="absolute bottom-12 left-0 z-10 flex flex-col gap-1 rounded-lg border border-wa-border bg-wa-panel p-2 shadow-lg">
                      {[
                        { icon: ImageIcon, label: 'Image', color: 'text-purple-500' },
                        { icon: Video, label: 'Video', color: 'text-red-500' },
                        { icon: FileText, label: 'Document', color: 'text-blue-500' },
                        { icon: UserCircle, label: 'Contact', color: 'text-wa-teal' },
                        { icon: MapPin, label: 'Location', color: 'text-wa-green' },
                      ].map((item) => (
                        <button
                          key={item.label}
                          onClick={() => {
                            setShowAttachMenu(false);
                            toast({ title: `${item.label} attachment`, description: 'Feature coming soon', variant: 'info' });
                          }}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-wa-text hover:bg-wa-hover transition-colors whitespace-nowrap"
                        >
                          <item.icon className={`h-5 w-5 ${item.color}`} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Text Input */}
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
                    className="w-full resize-none rounded-lg border border-wa-border bg-white px-4 py-2.5 text-sm text-wa-text placeholder:text-wa-text-muted focus:border-wa-green focus:outline-none focus:ring-1 focus:ring-wa-green/20"
                    style={{ maxHeight: '120px' }}
                  />
                </div>

                {/* Send / Voice Button */}
                {messageText.trim() ? (
                  <button
                    onClick={handleSendMessage}
                    disabled={sending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wa-teal text-white transition-colors hover:bg-wa-teal-dark disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-text-secondary hover:bg-wa-hover transition-colors"
                    onClick={() => toast({ title: 'Voice recording', description: 'Feature coming soon', variant: 'info' })}
                  >
                    <Mic className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
