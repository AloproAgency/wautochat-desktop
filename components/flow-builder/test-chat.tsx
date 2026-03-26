'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Mic,
  Paperclip,
  Bot,
  Lock,
  Check,
  CheckCheck,
  Trash2,
} from 'lucide-react';

interface TestChatProps {
  flowId: string;
  sessionId: string;
}

interface ChatMessage {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === date.getDate()) return 'Today';
  if (diff < dayMs * 2) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function shouldShowDateSeparator(
  messages: ChatMessage[],
  index: number
): boolean {
  if (index === 0) return true;
  const curr = messages[index].timestamp;
  const prev = messages[index - 1].timestamp;
  return curr.toDateString() !== prev.toDateString();
}

// Typing dots animation via CSS keyframes
const typingDotsStyle = `
@keyframes typingDot {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-4px); }
}
`;

export default function TestChat({ flowId, sessionId }: TestChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Clear unread when opening
  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      fromMe: true,
      timestamp: new Date(),
      status: 'sent',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    // Mark as delivered after a moment
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'delivered' } : m))
      );
    }, 500);

    try {
      const res = await fetch(`/api/flows/${flowId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });

      const json = await res.json();

      // Mark user message as read
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'read' } : m))
      );

      setIsTyping(false);

      if (json.success) {
        // Add bot text responses
        if (json.data?.responses?.length > 0) {
          const botMessages: ChatMessage[] = json.data.responses.map(
            (r: string, i: number) => ({
              id: `bot_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
              text: r,
              fromMe: false,
              timestamp: new Date(Date.now() + i * 100),
              status: 'read' as const,
            })
          );

          for (let i = 0; i < botMessages.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, i === 0 ? 0 : 400));
            setMessages((prev) => [...prev, botMessages[i]]);
            if (!isOpen) {
              setUnreadCount((c) => c + 1);
            }
          }
        }

        // Show waiting indicator when flow is paused at wait-for-reply
        if (json.data?.paused) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          setMessages((prev) => [...prev, {
            id: `wait_${Date.now()}`,
            text: 'Waiting for your reply...',
            fromMe: false,
            timestamp: new Date(),
            status: 'read' as const,
          }]);
        }
      } else if (!json.success) {
        const errorMsg: ChatMessage = {
          id: `err_${Date.now()}`,
          text: `Error: ${json.error || 'Something went wrong'}`,
          fromMe: false,
          timestamp: new Date(),
          status: 'read',
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      setIsTyping(false);
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        text: 'Failed to connect to the test endpoint.',
        fromMe: false,
        timestamp: new Date(),
        status: 'read',
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }, [inputText, flowId, sessionId, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setUnreadCount(0);
  }, []);

  return (
    <>
      {/* Inject typing animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: typingDotsStyle }} />

      {/* Floating bubble button (when chat is closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{
            bottom: isMobile ? 16 : 24,
            right: isMobile ? 16 : 24,
            width: isMobile ? 48 : 56,
            height: isMobile ? 48 : 56,
            backgroundColor: '#25D366',
          }}
          title="Test Flow Chat"
        >
          <MessageCircle className="w-6 h-6 text-white" />
          {unreadCount > 0 && (
            <span
              className="absolute flex items-center justify-center rounded-full text-white text-xs font-bold"
              style={{
                top: -4,
                right: -4,
                minWidth: 20,
                height: 20,
                padding: '0 6px',
                backgroundColor: '#ef4444',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden shadow-2xl"
          style={{
            bottom: isMobile ? 0 : 24,
            right: isMobile ? 0 : 24,
            left: isMobile ? 0 : undefined,
            top: isMobile ? 0 : undefined,
            width: isMobile ? '100%' : 400,
            height: isMobile ? '100%' : 600,
            borderRadius: isMobile ? 0 : 16,
            animation: 'testChatOpen 0.25s ease-out',
            transformOrigin: 'bottom right',
          }}
        >
          {/* Entrance animation */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @keyframes testChatOpen {
                  0% { opacity: 0; transform: scale(0.6); }
                  100% { opacity: 1; transform: scale(1); }
                }
              `,
            }}
          />

          {/* Header */}
          <div
            className="flex items-center shrink-0 px-4"
            style={{
              backgroundColor: '#075E54',
              height: 60,
            }}
          >
            {/* Avatar */}
            <img
              src="/wautochat_logo.png"
              alt="WAutoChat"
              className="rounded-full shrink-0"
              style={{ width: 40, height: 40 }}
            />

            {/* Title */}
            <div className="ml-3 flex-1 min-w-0">
              <div className="text-white text-sm font-semibold truncate">
                Flow Test
              </div>
              <div className="text-xs" style={{ color: '#25D366' }}>
                Online
              </div>
            </div>

            {/* Clear chat button */}
            <button
              onClick={handleClearChat}
              className="flex items-center justify-center rounded-full transition-colors mr-1"
              style={{
                width: 32,
                height: 32,
              }}
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4 text-white opacity-70 hover:opacity-100" />
            </button>

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center rounded-full transition-colors"
              style={{
                width: 32,
                height: 32,
              }}
              title="Close"
            >
              <X className="w-5 h-5 text-white opacity-70 hover:opacity-100" />
            </button>
          </div>

          {/* Messages area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-3 py-2"
            style={{
              backgroundColor: '#e5ddd5',
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1\' fill=\'%23d4cfc4\' opacity=\'0.5\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill=\'url(%23p)\' width=\'200\' height=\'200\'/%3E%3C/svg%3E")',
            }}
          >
            {/* Empty state */}
            {messages.length === 0 && !isTyping && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div
                  className="flex items-center justify-center rounded-full mb-4"
                  style={{
                    width: 56,
                    height: 56,
                    backgroundColor: 'rgba(0,0,0,0.06)',
                  }}
                >
                  <Lock className="w-6 h-6" style={{ color: '#8696a0' }} />
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: '#8696a0' }}
                >
                  Messages are end-to-end encrypted. Send a message to test
                  your flow. Bot responses will appear here in real-time.
                </p>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => (
              <div key={msg.id}>
                {/* Date separator */}
                {shouldShowDateSeparator(messages, index) && (
                  <div className="flex justify-center my-3">
                    <span
                      className="text-xs font-medium px-3 py-1 rounded-lg shadow-sm"
                      style={{
                        backgroundColor: '#e1f2fb',
                        color: '#54656f',
                      }}
                    >
                      {formatDateSeparator(msg.timestamp)}
                    </span>
                  </div>
                )}

                {/* Message bubble */}
                <div
                  className={`flex mb-1 ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="relative shadow-sm"
                    style={{
                      maxWidth: '80%',
                      padding: '6px 12px 4px',
                      fontSize: 14,
                      lineHeight: '19px',
                      backgroundColor: msg.fromMe ? '#DCF8C6' : '#ffffff',
                      borderRadius: msg.fromMe
                        ? '8px 2px 8px 8px'
                        : '2px 8px 8px 8px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {/* Tail */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        width: 0,
                        height: 0,
                        ...(msg.fromMe
                          ? {
                              right: -6,
                              borderLeft: '6px solid #DCF8C6',
                              borderBottom: '6px solid transparent',
                            }
                          : {
                              left: -6,
                              borderRight: '6px solid #ffffff',
                              borderBottom: '6px solid transparent',
                            }),
                      }}
                    />

                    {/* Text + timestamp inline */}
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>

                    {/* Timestamp + checkmarks */}
                    <span
                      className="float-right ml-2 relative"
                      style={{
                        fontSize: 11,
                        color: '#667781',
                        top: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                    >
                      {formatTime(msg.timestamp)}
                      {msg.fromMe && (
                        <span
                          className="inline-flex"
                          style={{
                            color:
                              msg.status === 'read'
                                ? '#53bdeb'
                                : '#667781',
                          }}
                        >
                          {msg.status === 'sent' ? (
                            <Check
                              className="w-3.5 h-3.5"
                              strokeWidth={2.5}
                            />
                          ) : (
                            <CheckCheck
                              className="w-3.5 h-3.5"
                              strokeWidth={2.5}
                            />
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start mb-1">
                <div
                  className="relative shadow-sm flex items-center"
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#ffffff',
                    borderRadius: '2px 8px 8px 8px',
                  }}
                >
                  {/* Tail */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: -6,
                      width: 0,
                      height: 0,
                      borderRight: '6px solid #ffffff',
                      borderBottom: '6px solid transparent',
                    }}
                  />
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="inline-block rounded-full"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: '#8696a0',
                          animation: `typingDot 1.4s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            className="flex items-center shrink-0 px-2 gap-1"
            style={{
              backgroundColor: '#f0f2f5',
              height: 56,
            }}
          >
            {/* Attachment icon (decorative) */}
            <button
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 40, height: 40 }}
              title="Attach (decorative)"
            >
              <Paperclip
                className="w-5 h-5 rotate-45"
                style={{ color: '#54656f' }}
              />
            </button>

            {/* Input field */}
            <div className="flex-1">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                className="w-full border-none outline-none text-sm"
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 24,
                  padding: '10px 16px',
                  fontSize: 14,
                  color: '#111b21',
                }}
              />
            </div>

            {/* Send / Mic button */}
            <button
              onClick={inputText.trim() ? handleSend : undefined}
              className="flex items-center justify-center rounded-full shrink-0 transition-colors"
              style={{ width: 40, height: 40 }}
              title={inputText.trim() ? 'Send message' : 'Voice message (decorative)'}
            >
              {inputText.trim() ? (
                <Send
                  className="w-5 h-5"
                  style={{ color: '#25D366' }}
                />
              ) : (
                <Mic
                  className="w-5 h-5"
                  style={{ color: '#54656f' }}
                />
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
