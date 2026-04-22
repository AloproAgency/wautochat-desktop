'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Smartphone,
  Wifi,
  Users,
  MessageSquare,
  GitBranch,
  Zap,
  UsersRound,
  Megaphone,
  Plus,
  Send,
  RefreshCw,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { useDashboardStore } from '@/lib/store';
import { useActiveSession } from '@/hooks/use-active-session';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { DashboardStats, Message, Flow, ApiResponse } from '@/lib/types';
import Link from 'next/link';

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

  const statCards = [
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, icon: <Smartphone className="h-5 w-5" /> },
    { label: 'Active Sessions', value: stats?.activeSessions ?? 0, icon: <Wifi className="h-5 w-5" /> },
    { label: 'Total Contacts', value: stats?.totalContacts ?? 0, icon: <Users className="h-5 w-5" /> },
    { label: 'Messages (24h)', value: stats?.messagesLast24h ?? 0, icon: <MessageSquare className="h-5 w-5" /> },
    { label: 'Total Flows', value: stats?.totalFlows ?? 0, icon: <GitBranch className="h-5 w-5" /> },
    { label: 'Active Flows', value: stats?.activeFlows ?? 0, icon: <Zap className="h-5 w-5" /> },
    { label: 'Total Groups', value: stats?.totalGroups ?? 0, icon: <UsersRound className="h-5 w-5" /> },
    { label: 'Total Broadcasts', value: 0, icon: <Megaphone className="h-5 w-5" /> },
  ];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wa-text">Dashboard</h1>
          <p className="mt-1 text-sm text-wa-text-secondary">
            Overview of your WhatsApp automation platform
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={fetchDashboardData}
        >
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
          />
        ))}
      </div>

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
                {recentMessages.map((msg) => (
                  <li key={msg.id} className="flex items-center gap-3 px-6 py-3 hover:bg-wa-hover transition-colors">
                    <Avatar
                      size="sm"
                      name={msg.senderName || msg.sender}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-wa-text truncate">
                          {msg.senderName || msg.sender}
                        </p>
                        <span className="shrink-0 text-xs text-wa-text-muted ml-2">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-wa-text-secondary truncate mt-0.5">
                        {msg.fromMe && <span className="text-wa-text-muted">You: </span>}
                        {truncate(msg.body || `[${msg.type}]`, 50)}
                      </p>
                    </div>
                  </li>
                ))}
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
    </div>
  );
}
