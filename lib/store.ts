import { create } from "zustand";
import type { Session, Chat, Contact, Flow, Label, DashboardStats } from "./types";

// --- Session Store ---
interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (id: string | null) => void;
  updateSession: (id: string, data: Partial<Session>) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  updateSession: (id, data) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...data } : s)),
    })),
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  removeSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    })),
}));

// --- Chat Store ---
interface ChatStore {
  chats: Chat[];
  activeChatId: string | null;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (id: string | null) => void;
  updateChat: (id: string, data: Partial<Chat>) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  chats: [],
  activeChatId: null,
  setChats: (chats) => set({ chats }),
  setActiveChat: (id) => set({ activeChatId: id }),
  updateChat: (id, data) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === id ? { ...c, ...data } : c)),
    })),
}));

// --- Contact Store ---
interface ContactStore {
  contacts: Contact[];
  setContacts: (contacts: Contact[]) => void;
  updateContact: (id: string, data: Partial<Contact>) => void;
}

export const useContactStore = create<ContactStore>((set) => ({
  contacts: [],
  setContacts: (contacts) => set({ contacts }),
  updateContact: (id, data) =>
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === id ? { ...c, ...data } : c)),
    })),
}));

// --- Flow Store ---
interface FlowStore {
  flows: Flow[];
  setFlows: (flows: Flow[]) => void;
  updateFlow: (id: string, data: Partial<Flow>) => void;
  addFlow: (flow: Flow) => void;
  removeFlow: (id: string) => void;
}

export const useFlowStore = create<FlowStore>((set) => ({
  flows: [],
  setFlows: (flows) => set({ flows }),
  updateFlow: (id, data) =>
    set((state) => ({
      flows: state.flows.map((f) => (f.id === id ? { ...f, ...data } : f)),
    })),
  addFlow: (flow) => set((state) => ({ flows: [...state.flows, flow] })),
  removeFlow: (id) => set((state) => ({ flows: state.flows.filter((f) => f.id !== id) })),
}));

// --- Label Store ---
interface LabelStore {
  labels: Label[];
  setLabels: (labels: Label[]) => void;
}

export const useLabelStore = create<LabelStore>((set) => ({
  labels: [],
  setLabels: (labels) => set({ labels }),
}));

// --- Dashboard Store ---
interface DashboardStore {
  stats: DashboardStats | null;
  setStats: (stats: DashboardStats) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}));

// --- UI Store ---
interface UIStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
