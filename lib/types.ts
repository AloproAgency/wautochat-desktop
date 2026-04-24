// ============================================================
// Core Types for WAutoChat
// ============================================================

// --- Session Types ---
export type SessionStatus = "disconnected" | "connecting" | "qr_ready" | "connected" | "failed";

export interface Session {
  id: string;
  name: string;
  phone?: string;
  status: SessionStatus;
  qrCode?: string;
  createdAt: string;
  updatedAt: string;
  deviceName?: string;
  batteryLevel?: number;
  isOnline?: boolean;
}

// --- Contact Types ---
export interface Contact {
  id: string;
  sessionId: string;
  wppId: string;
  name: string;
  pushName?: string;
  phone: string;
  profilePicUrl?: string;
  isMyContact: boolean;
  isWAContact: boolean;
  isBlocked: boolean;
  labels: string[];
  lastSeen?: string;
  createdAt: string;
}

// --- Chat Types ---
export interface Chat {
  id: string;
  sessionId: string;
  wppId: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: Message;
  profilePicUrl?: string;
  isArchived: boolean;
  isPinned: boolean;
  isMuted: boolean;
  updatedAt: string;
}

// --- Message Types ---
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "ptt"
  | "document"
  | "sticker"
  | "contact"
  | "location"
  | "link"
  | "list"
  | "poll"
  | "order"
  | "reaction"
  | "template";

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  sessionId: string;
  chatId: string;
  wppId: string;
  type: MessageType;
  body: string;
  sender: string;
  senderName?: string;
  fromMe: boolean;
  timestamp: string;
  status: MessageStatus;
  quotedMsgId?: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
  isForwarded: boolean;
  labels: string[];
}

// --- Group Types ---
export interface Group {
  id: string;
  sessionId: string;
  wppId: string;
  name: string;
  description?: string;
  profilePicUrl?: string;
  participantCount: number;
  admins: string[];
  isAdmin: boolean;
  inviteLink?: string;
  createdAt: string;
}

export interface GroupParticipant {
  id: string;
  name: string;
  phone: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  profilePicUrl?: string;
}

// --- Label Types ---
export interface Label {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  count: number;
}

// --- Broadcast Types ---
export interface Broadcast {
  id: string;
  sessionId: string;
  name: string;
  recipients: string[];
  messageTemplate: string;
  messageType: MessageType;
  status: "draft" | "sending" | "sent" | "failed";
  sentCount: number;
  failedCount: number;
  totalCount: number;
  scheduledAt?: string;
  createdAt: string;
}

// --- Business Types ---
export interface Product {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  price: number;
  salePrice?: number;
  currency: string;
  imageUrl?: string;
  isVisible: boolean;
  url?: string;
}

export interface Collection {
  id: string;
  sessionId: string;
  name: string;
  productIds: string[];
}

// --- Flow Builder Types ---
export type FlowNodeType =
  | "trigger"
  | "send-message"
  | "send-image"
  | "send-file"
  | "send-audio"
  | "send-video"
  | "send-location"
  | "send-contact"
  | "send-sticker"
  | "send-list"
  | "send-poll"
  | "send-buttons"
  | "send-reaction"
  | "wait-for-reply"
  | "condition"
  | "delay"
  | "set-variable"
  | "http-request"
  | "ai-response"
  | "ai-agent"
  | "ai-classifier"
  | "ai-extractor"
  | "ai-summarizer"
  | "ai-sentiment"
  | "ai-translator"
  | "ai-vision"
  | "llm-claude"
  | "llm-openai"
  | "llm-gemini"
  | "llm-ollama"
  | "memory-buffer"
  | "memory-vector"
  | "memory-window"
  | "tool-code"
  | "tool-http"
  | "tool-search"
  | "tool-mcp"
  | "wppconnect-all"
  | "assign-label"
  | "remove-label"
  | "add-to-group"
  | "remove-from-group"
  | "block-contact"
  | "unblock-contact"
  | "forward-message"
  | "mark-as-read"
  | "typing-indicator"
  | "go-to-flow"
  | "end";

export interface FlowNodeData {
  label: string;
  type: FlowNodeType;
  config: Record<string, unknown>;
  description?: string;
}

export interface Flow {
  id: string;
  sessionId: string;
  name: string;
  description?: string;
  isActive: boolean;
  trigger: FlowTrigger;
  nodes: FlowNodeSerialized[];
  edges: FlowEdgeSerialized[];
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface FlowNodeSerialized {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdgeSerialized {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string;
}

export type FlowTriggerType =
  | "message_received"
  | "keyword"
  | "regex"
  | "contact_message"
  | "group_message"
  | "media_received"
  | "new_contact"
  | "added_to_group"
  | "webhook"
  | "schedule";

export interface FlowTrigger {
  type: FlowTriggerType;
  config: Record<string, unknown>;
}

// --- Dashboard Stats ---
export interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  totalContacts: number;
  totalMessages: number;
  totalFlows: number;
  activeFlows: number;
  totalGroups: number;
  messagesLast24h: number;
}

// --- API Response ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// --- Flow Execution Events (real-time) ---
export type FlowExecutionEventType =
  | 'execution:start'
  | 'node:executing'
  | 'node:completed'
  | 'node:error'
  | 'execution:end';

export interface FlowExecutionEvent {
  type: FlowExecutionEventType;
  flowId: string;
  executionId: string;
  nodeId?: string;
  nodeType?: FlowNodeType;
  nodeLabel?: string;
  timestamp: string;
  data?: {
    status?: 'success' | 'error' | 'skipped';
    result?: unknown;
    error?: string;
    durationMs?: number;
    inputData?: unknown;
  };
}
