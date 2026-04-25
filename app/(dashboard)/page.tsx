'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wifi,
  Users,
  MessageSquare,
  GitBranch,
  Zap,
  Plus,
  Send,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useDashboardStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatTimestamp, truncate, formatPhoneNumber } from '@/lib/utils';
import type { DashboardStats, Message, MessageType, Flow, ApiResponse } from '@/lib/types';
import Link from 'next/link';

function displaySender(msg: Message): string {
  if (msg.senderName && msg.senderName.trim()) return msg.senderName;
  const phone = (msg.sender || '').replace(/@(c\.us|g\.us|lid|s\.whatsapp\.net|broadcast)$/i, '');
  if (!phone || !/^\d+$/.test(phone)) return msg.sender || 'Unknown';
  return formatPhoneNumber(phone);
}

const MEDIA_LABELS: Partial<Record<MessageType, string>> = {
  image: '📷 Photo',
  video: '🎥 Video',
  audio: '🎵 Audio',
  ptt: '🎤 Voice message',
  document: '📄 Document',
  sticker: '💟 Sticker',
  contact: '👤 Contact',
  location: '📍 Location',
  link: '🔗 Link',
  list: '📋 List',
  poll: '📊 Poll',
  reaction: '👍 Reaction',
  template: '📋 Template',
  order: '🛒 Order',
};

function displayBody(msg: Message): string {
  const label = MEDIA_LABELS[msg.type];
  if (label) {
    const caption = (msg.caption || '').trim();
    return caption ? `${label} — ${caption}` : label;
  }
  return msg.body || '';
}

export default function DashboardPage() {
  const { stats, setStats } = useDashboardStore();
  const activeSessionId = useActiveSession();
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [activeFlows, setActiveFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, messagesRes, flowsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/messages?limit=10'),
        fetch('/api/flows?active=true'),
      ]);

      if (statusRes.ok) {
        const statusData: ApiResponse<DashboardStats> = await statusRes.json();
        if (statusData.success && statusData.data) {
          setStats(statusData.data);
        }
      }

      if (messagesRes.ok) {
        const messagesData: ApiResponse<Message[]> = await messagesRes.json();
        if (messagesData.success && messagesData.data) {
          setRecentMessages(messagesData.data);
        }
      }

      if (flowsRes.ok) {
        const flowsData: ApiResponse<Flow[]> = await flowsRes.json();
        if (flowsData.success && flowsData.data) {
          setActiveFlows(flowsData.data);
        }
      }
    } catch {
      toast({
        title: 'Failed to load dashboard data',
        description: 'Could not connect to the server.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setStats, toast]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleToggleFlow = async (flowId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        setActiveFlows((prev) =>
          isActive
            ? prev
            : prev.filter((f) => f.id !== flowId)
        );
        toast({
          title: isActive ? 'Flow activated' : 'Flow deactivated',
          variant: 'success',
        });
      }
    } catch {
      toast({ title: 'Failed to update flow', variant: 'error' });
    }
  };

  const heroStats = [
    {
      label: 'Sessions actives',
      value: stats?.activeSessions ?? 0,
      sub: `${stats?.totalSessions ?? 0} au total`,
      icon: Wifi,
      gradient: 'from-slate-800 to-slate-600',
      iconBg: 'bg-white/10',
      ratio: stats?.totalSessions ? (stats.activeSessions / stats.totalSessions) : 0,
    },
    {
      label: 'Messages (24h)',
      value: stats?.messagesLast24h ?? 0,
      sub: 'dernières 24 heures',
      icon: MessageSquare,
      gradient: 'from-orange-500 to-orange-700',
      iconBg: 'bg-white/10',
      ratio: null,
    },
    {
      label: 'Contacts',
      value: stats?.totalContacts ?? 0,
      sub: 'dans la base',
      icon: Users,
      gradient: 'from-zinc-800 to-zinc-900',
      iconBg: 'bg-white/10',
      ratio: null,
    },
    {
      label: 'Flows actifs',
      value: stats?.activeFlows ?? 0,
      sub: `${stats?.totalFlows ?? 0} configurés`,
      icon: Zap,
      gradient: 'from-emerald-600 to-teal-700',
      iconBg: 'bg-white/10',
      ratio: stats?.totalFlows ? (stats.activeFlows / stats.totalFlows) : 0,
    },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col -m-4 md:-m-6 lg:max-w-none bg-slate-50 dark:bg-zinc-900 min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
        <div className="flex items-center gap-3 px-5 h-14">
          <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-100">Dashboard</h1>
          <button
            onClick={fetchDashboardData}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 h-8 px-3 text-[13px] font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 active:scale-[0.98] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      <div className="p-5 space-y-5">
      {/* Hero stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {heroStats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`relative overflow-hidden rounded-xl bg-linear-to-br ${s.gradient} px-4 py-3.5 text-white shadow-sm`}
            >
              <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/5" />

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white/75 truncate uppercase tracking-wide">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight leading-none">
                    {s.value.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-white/65">{s.sub}</p>
                </div>
                <div className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg ${s.iconBg}`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
              </div>

              {s.ratio !== null && (
                <div className="mt-3 h-0.5 w-full rounded-full bg-white/15">
                  <div
                    className="h-0.5 rounded-full bg-white/60 transition-all"
                    style={{ width: `${Math.round((s.ratio ?? 0) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-wa-text">Quick Actions</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            <Link href="/sessions">
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />}>
                New Session
              </Button>
            </Link>
            <Link href="/flows">
              <Button variant="secondary" icon={<GitBranch className="h-4 w-4" />}>
                Create Flow
              </Button>
            </Link>
            <Link href="/broadcasts">
              <Button variant="secondary" icon={<Send className="h-4 w-4" />}>
                Send Broadcast
              </Button>
            </Link>
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={async () => {
                if (!activeSessionId) {
                  toast({ title: 'Select a session first', variant: 'error' });
                  return;
                }
                try {
                  const res = await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: activeSessionId }),
                  });
                  if (res.ok) {
                    toast({ title: 'Contacts sync started', variant: 'success' });
                  } else {
                    const data = await res.json().catch(() => null);
                    toast({ title: data?.error || 'Failed to sync contacts', variant: 'error' });
                  }
                } catch {
                  toast({ title: 'Failed to sync contacts', variant: 'error' });
                }
              }}
            >
              Sync Contacts
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Messages */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-wa-text">Recent Messages</h2>
              <Link href="/conversations">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {recentMessages.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-wa-text-muted">
                No recent messages
              </div>
            ) : (
              <ul className="divide-y divide-wa-border">
                {recentMessages.map((msg) => {
                  const sender = displaySender(msg);
                  const preview = displayBody(msg);
                  return (
                    <li key={msg.id} className="flex items-center gap-3 px-6 py-3 hover:bg-wa-hover transition-colors">
                      <Avatar size="sm" name={sender} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-wa-text truncate">
                            {sender}
                          </p>
                          <span className="shrink-0 text-xs text-wa-text-muted ml-2">
                            {formatTimestamp(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-wa-text-secondary truncate mt-0.5">
                          {msg.fromMe && <span className="text-wa-text-muted">You: </span>}
                          {truncate(preview || `[${msg.type}]`, 60)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Active Flows */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-wa-text">Active Flows</h2>
              <Link href="/flows">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {activeFlows.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-wa-text-muted">
                No active flows
              </div>
            ) : (
              <ul className="divide-y divide-wa-border">
                {activeFlows.map((flow) => (
                  <li key={flow.id} className="flex items-center justify-between px-6 py-3 hover:bg-wa-hover transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-wa-text truncate">{flow.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="info">{flow.trigger.type.replace(/_/g, ' ')}</Badge>
                        <span className="text-xs text-wa-text-muted">
                          {flow.nodes.length} nodes
                        </span>
                      </div>
                    </div>
                    <Toggle
                      checked={flow.isActive}
                      onChange={(val) => handleToggleFlow(flow.id, val)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      </div>
    </div>
  );
}
