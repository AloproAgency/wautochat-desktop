'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  GitBranch,
  Plus,
  Search,
  Pencil,
  Copy,
  Trash2,
  Calendar,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Toggle } from '@/components/ui/toggle';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useFlowStore, useSessionStore } from '@/lib/store';
import { formatTimestamp, truncate } from '@/lib/utils';
import type { Flow, Session, FlowTriggerType, ApiResponse } from '@/lib/types';

const triggerTypes: { value: FlowTriggerType; label: string }[] = [
  { value: 'message_received', label: 'Message Received' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'regex', label: 'Regex Pattern' },
  { value: 'contact_message', label: 'Contact Message' },
  { value: 'group_message', label: 'Group Message' },
  { value: 'media_received', label: 'Media Received' },
  { value: 'new_contact', label: 'New Contact' },
  { value: 'added_to_group', label: 'Added to Group' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'schedule', label: 'Schedule' },
];

const triggerBadgeVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  message_received: 'info',
  keyword: 'success',
  regex: 'warning',
  contact_message: 'info',
  group_message: 'default',
  media_received: 'warning',
  new_contact: 'success',
  added_to_group: 'default',
  webhook: 'danger',
  schedule: 'warning',
};

export default function FlowsPage() {
  const router = useRouter();
  const { flows, setFlows, addFlow, updateFlow, removeFlow } = useFlowStore();
  const { sessions, setSessions } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New flow form
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [newFlowSessionId, setNewFlowSessionId] = useState('');
  const [newFlowTriggerType, setNewFlowTriggerType] = useState<FlowTriggerType>('message_received');

  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [flowsRes, sessionsRes] = await Promise.all([
        fetch('/api/flows'),
        fetch('/api/sessions'),
      ]);

      if (flowsRes.ok) {
        const data: ApiResponse<Flow[]> = await flowsRes.json();
        if (data.success && data.data) setFlows(data.data);
      }

      if (sessionsRes.ok) {
        const data: ApiResponse<Session[]> = await sessionsRes.json();
        if (data.success && data.data) setSessions(data.data);
      }
    } catch {
      toast({ title: 'Failed to load flows', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setFlows, setSessions, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredFlows = flows.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFlow = async () => {
    if (!newFlowName.trim() || !newFlowSessionId) return;
    try {
      setCreating(true);
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFlowName.trim(),
          description: newFlowDescription.trim() || undefined,
          sessionId: newFlowSessionId,
          trigger: { type: newFlowTriggerType, config: {} },
        }),
      });
      if (res.ok) {
        const data: ApiResponse<Flow> = await res.json();
        if (data.success && data.data) {
          addFlow(data.data);
          toast({ title: 'Flow created', variant: 'success' });
          setShowNewModal(false);
          resetNewFlowForm();
          router.push(`/flows/${data.data.id}`);
        }
      } else {
        const err = await res.json();
        toast({ title: err.error || 'Failed to create flow', variant: 'error' });
      }
    } catch {
      toast({ title: 'Failed to create flow', variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleFlow = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/flows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (res.ok) {
        updateFlow(id, { isActive });
        toast({ title: isActive ? 'Flow activated' : 'Flow deactivated', variant: 'success' });
      }
    } catch {
      toast({ title: 'Failed to update flow', variant: 'error' });
    }
  };

  const handleDuplicate = async (flow: Flow) => {
    try {
      setActionLoading(flow.id);
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${flow.name} (Copy)`,
          description: flow.description,
          sessionId: flow.sessionId,
          trigger: flow.trigger,
          nodes: flow.nodes,
          edges: flow.edges,
          variables: flow.variables,
        }),
      });
      if (res.ok) {
        const data: ApiResponse<Flow> = await res.json();
        if (data.success && data.data) {
          addFlow(data.data);
          toast({ title: 'Flow duplicated', variant: 'success' });
        }
      }
    } catch {
      toast({ title: 'Failed to duplicate flow', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setActionLoading(id);
      const res = await fetch(`/api/flows/${id}`, { method: 'DELETE' });
      if (res.ok) {
        removeFlow(id);
        toast({ title: 'Flow deleted', variant: 'success' });
        setShowDeleteModal(null);
      }
    } catch {
      toast({ title: 'Failed to delete flow', variant: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const resetNewFlowForm = () => {
    setNewFlowName('');
    setNewFlowDescription('');
    setNewFlowSessionId('');
    setNewFlowTriggerType('message_received');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wa-text">Flow Builder</h1>
          <p className="mt-1 text-sm text-wa-text-secondary">
            Create and manage your automated conversation flows
          </p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
          New Flow
        </Button>
      </div>

      {/* Search */}
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search flows..."
        className="max-w-md"
      />

      {/* Flows Grid */}
      {filteredFlows.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-8 w-8" />}
          title={searchQuery ? 'No matching flows' : 'No flows yet'}
          description={
            searchQuery
              ? 'Try adjusting your search query.'
              : 'Create your first automation flow to get started.'
          }
          action={
            !searchQuery ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowNewModal(true)}>
                Create Flow
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map((flow) => (
            <Card key={flow.id} className="hover:shadow-md transition-shadow">
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-wa-text truncate">{flow.name}</h3>
                    {flow.description && (
                      <p className="mt-1 text-xs text-wa-text-secondary">
                        {truncate(flow.description, 80)}
                      </p>
                    )}
                  </div>
                  <Toggle
                    checked={flow.isActive}
                    onChange={(val) => handleToggleFlow(flow.id, val)}
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={triggerBadgeVariant[flow.trigger.type] || 'default'}>
                    {flow.trigger.type.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs text-wa-text-muted">
                  <span className="flex items-center gap-1">
                    <Workflow className="h-3.5 w-3.5" />
                    {flow.nodes.length} nodes
                  </span>
                  <span>{flow.edges.length} edges</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatTimestamp(flow.updatedAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-wa-border">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => router.push(`/flows/${flow.id}`)}
                    className="flex-1"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Copy className="h-3.5 w-3.5" />}
                    loading={actionLoading === flow.id}
                    onClick={() => handleDuplicate(flow)}
                    title="Duplicate"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setShowDeleteModal(flow.id)}
                    className="text-wa-danger hover:bg-wa-danger/10"
                    title="Delete"
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* New Flow Modal */}
      <Modal
        open={showNewModal}
        onClose={() => {
          setShowNewModal(false);
          resetNewFlowForm();
        }}
        title="New Flow"
        description="Create a new automation flow."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowNewModal(false);
                resetNewFlowForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFlow}
              loading={creating}
              disabled={!newFlowName.trim() || !newFlowSessionId}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Flow Name"
            placeholder="e.g., Welcome Flow"
            value={newFlowName}
            onChange={(e) => setNewFlowName(e.target.value)}
          />
          <Textarea
            label="Description"
            placeholder="Describe what this flow does..."
            value={newFlowDescription}
            onChange={(e) => setNewFlowDescription(e.target.value)}
            rows={3}
          />
          <Select
            label="Session"
            value={newFlowSessionId}
            onChange={(e) => setNewFlowSessionId(e.target.value)}
            options={[
              { value: '', label: 'Select a session', disabled: true },
              ...sessions.map((s) => ({ value: s.id, label: `${s.name} ${s.status === 'connected' ? '(Connected)' : ''}` })),
            ]}
          />
          <Select
            label="Trigger Type"
            value={newFlowTriggerType}
            onChange={(e) => setNewFlowTriggerType(e.target.value as FlowTriggerType)}
            options={triggerTypes}
          />
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!showDeleteModal}
        onClose={() => setShowDeleteModal(null)}
        title="Delete Flow"
        description="Are you sure you want to delete this flow? This action cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteModal(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actionLoading === showDeleteModal}
              onClick={() => showDeleteModal && handleDelete(showDeleteModal)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-wa-text-secondary">
          This will permanently remove the flow and all its nodes and configurations.
        </p>
      </Modal>
    </div>
  );
}
