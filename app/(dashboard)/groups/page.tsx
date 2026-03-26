'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreVertical,
  Shield,
  ShieldCheck,
  Copy,
  LogOut,
  Pencil,
  UserPlus,
  UserMinus,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  X,
  Settings,
  Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useSessionStore } from '@/lib/store';
import type { Group, GroupParticipant, Contact } from '@/lib/types';

// ---- Modal Component (inline since not all UI components exist as files) ----
function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-wa-border bg-wa-panel shadow-xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-wa-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-wa-text">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-wa-text-secondary">{description}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-wa-hover">
            <X className="h-5 w-5 text-wa-text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---- Dropdown Menu ----
function DropdownMenu({
  trigger,
  items,
}: {
  trigger: React.ReactNode;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{trigger}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-wa-border bg-wa-panel py-1 shadow-lg">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-wa-hover ${
                  item.danger ? 'text-wa-danger' : 'text-wa-text'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Empty State ----
function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-wa-bg p-4 text-wa-text-muted">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-wa-text">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-wa-text-secondary">{description}</p>
      {action}
    </div>
  );
}

// ---- Search Input ----
function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || 'Search...'}
      prefix={<Search className="h-4 w-4" />}
      suffix={
        value ? (
          <button onClick={() => onChange('')} className="hover:text-wa-text">
            <X className="h-4 w-4" />
          </button>
        ) : undefined
      }
    />
  );
}

// ---- Toggle ----
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-wa-teal' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label && <span className="text-sm text-wa-text">{label}</span>}
    </label>
  );
}

export default function GroupsPage() {
  const { activeSessionId } = useSessionStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [detailPanel, setDetailPanel] = useState(false);

  // Create modal state
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // Detail panel state
  const [members, setMembers] = useState<GroupParticipant[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [addMemberPhone, setAddMemberPhone] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [restrictMessages, setRestrictMessages] = useState(false);

  const fetchGroups = useCallback(async () => {
    if (!activeSessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/groups?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setGroups(data.data);
      }
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [activeSessionId]);

  const fetchContacts = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/contacts?sessionId=${activeSessionId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setContacts(data.data);
      }
    } catch {
      // handle silently
    }
  }, [activeSessionId]);

  useEffect(() => {
    fetchGroups();
    fetchContacts();
  }, [fetchGroups, fetchContacts]);

  const filteredGroups = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const filteredContacts = contacts.filter(
    (c) =>
      !selectedParticipants.includes(c.id) &&
      (c.name.toLowerCase().includes(participantSearch.toLowerCase()) ||
        c.phone.includes(participantSearch))
  );

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !activeSessionId) return;
    setCreating(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: newGroupName,
          participants: selectedParticipants,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        setNewGroupName('');
        setSelectedParticipants([]);
        fetchGroups();
      }
    } catch {
      // handle silently
    } finally {
      setCreating(false);
    }
  };

  const handleCopyInviteLink = async (group: Group) => {
    const link = group.inviteLink || `https://chat.whatsapp.com/${group.wppId}`;
    await navigator.clipboard.writeText(link);
  };

  const handleLeaveGroup = async (group: Group) => {
    if (!confirm(`Are you sure you want to leave "${group.name}"?`)) return;
    try {
      await fetch(`/api/groups/${group.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      fetchGroups();
    } catch {
      // handle silently
    }
  };

  const openDetailPanel = async (group: Group) => {
    setSelectedGroup(group);
    setDetailPanel(true);
    setEditName(group.name);
    setEditDescription(group.description || '');
    setInviteLink(group.inviteLink || '');
    setLoadingMembers(true);
    try {
      const res = await fetch(
        `/api/groups/${group.id}/members?sessionId=${activeSessionId}`
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMembers(data.data);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleUpdateGroupName = async () => {
    if (!selectedGroup || !editName.trim()) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          name: editName,
        }),
      });
      setEditingName(false);
      setGroups((prev) =>
        prev.map((g) => (g.id === selectedGroup.id ? { ...g, name: editName } : g))
      );
      setSelectedGroup((prev) => (prev ? { ...prev, name: editName } : prev));
    } catch {
      // handle silently
    }
  };

  const handleUpdateGroupDescription = async () => {
    if (!selectedGroup) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          description: editDescription,
        }),
      });
      setEditingDescription(false);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selectedGroup.id ? { ...g, description: editDescription } : g
        )
      );
      setSelectedGroup((prev) =>
        prev ? { ...prev, description: editDescription } : prev
      );
    } catch {
      // handle silently
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addMemberPhone.trim()) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          phone: addMemberPhone,
        }),
      });
      setAddMemberPhone('');
      openDetailPanel(selectedGroup);
    } catch {
      // handle silently
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedGroup) return;
    if (!confirm('Remove this member from the group?')) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // handle silently
    }
  };

  const handlePromoteMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}/members/${memberId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, isAdmin: true } : m))
      );
    } catch {
      // handle silently
    }
  };

  const handleDemoteMember = async (memberId: string) => {
    if (!selectedGroup) return;
    try {
      await fetch(`/api/groups/${selectedGroup.id}/members/${memberId}/demote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, isAdmin: false } : m))
      );
    } catch {
      // handle silently
    }
  };

  const handleCopyDetailInviteLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
    }
  };

  const handleToggleRestrictMessages = async (val: boolean) => {
    if (!selectedGroup) return;
    setRestrictMessages(val);
    try {
      await fetch(`/api/groups/${selectedGroup.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          restrictMessages: val,
        }),
      });
    } catch {
      // handle silently
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={`flex-1 overflow-y-auto p-6 ${detailPanel ? 'mr-[420px]' : ''}`}>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-wa-text">Groups</h1>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Manage your WhatsApp groups
            </p>
          </div>
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Create Group
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6 max-w-md">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search groups..."
          />
        </div>

        {/* Groups Grid */}
        {filteredGroups.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No groups found"
            description={
              search
                ? 'No groups match your search. Try a different query.'
                : 'You have no groups yet. Create one to get started.'
            }
            action={
              !search ? (
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() => setShowCreateModal(true)}
                >
                  Create Group
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map((group) => (
              <Card
                key={group.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => openDetailPanel(group)}
              >
                <CardBody>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={group.profilePicUrl}
                        name={group.name}
                        size="lg"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-wa-text">
                          {group.name}
                        </h3>
                        {group.description && (
                          <p className="mt-0.5 truncate text-sm text-wa-text-secondary">
                            {group.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu
                      trigger={
                        <button className="rounded-lg p-1.5 hover:bg-wa-hover">
                          <MoreVertical className="h-4 w-4 text-wa-text-muted" />
                        </button>
                      }
                      items={[
                        {
                          label: 'View Members',
                          icon: <Users className="h-4 w-4" />,
                          onClick: () => openDetailPanel(group),
                        },
                        {
                          label: 'Copy Invite Link',
                          icon: <Copy className="h-4 w-4" />,
                          onClick: () => handleCopyInviteLink(group),
                        },
                        {
                          label: 'Edit Group',
                          icon: <Pencil className="h-4 w-4" />,
                          onClick: () => openDetailPanel(group),
                        },
                        {
                          label: 'Leave Group',
                          icon: <LogOut className="h-4 w-4" />,
                          onClick: () => handleLeaveGroup(group),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-wa-text-secondary">
                      <Users className="h-3.5 w-3.5" />
                      <span>{group.participantCount} members</span>
                    </div>
                    {group.isAdmin && (
                      <Badge variant="success">Admin</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-wa-text-muted">
                    Created {new Date(group.createdAt).toLocaleDateString()}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {detailPanel && selectedGroup && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-[420px] flex-col border-l border-wa-border bg-wa-panel shadow-lg">
          {/* Panel Header */}
          <div className="flex items-center justify-between border-b border-wa-border bg-wa-header px-4 py-3">
            <h2 className="font-semibold text-wa-text">Group Info</h2>
            <button
              onClick={() => {
                setDetailPanel(false);
                setSelectedGroup(null);
              }}
              className="rounded-lg p-1 hover:bg-wa-hover"
            >
              <X className="h-5 w-5 text-wa-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Group Profile */}
            <div className="flex flex-col items-center border-b border-wa-border px-6 py-6">
              <Avatar
                src={selectedGroup.profilePicUrl}
                name={selectedGroup.name}
                size="lg"
                className="!h-20 !w-20 !text-2xl"
              />
              {editingName ? (
                <div className="mt-3 flex w-full items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="text-center"
                  />
                  <Button size="sm" onClick={handleUpdateGroupName}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingName(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-wa-text">
                    {selectedGroup.name}
                  </h3>
                  {selectedGroup.isAdmin && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="rounded p-1 hover:bg-wa-hover"
                    >
                      <Pencil className="h-3.5 w-3.5 text-wa-text-muted" />
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 text-sm text-wa-text-secondary">
                Group - {selectedGroup.participantCount} participants
              </p>
            </div>

            {/* Description */}
            <div className="border-b border-wa-border px-6 py-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                  Description
                </h4>
                {selectedGroup.isAdmin && !editingDescription && (
                  <button
                    onClick={() => setEditingDescription(true)}
                    className="rounded p-1 hover:bg-wa-hover"
                  >
                    <Pencil className="h-3.5 w-3.5 text-wa-text-muted" />
                  </button>
                )}
              </div>
              {editingDescription ? (
                <div className="mt-2">
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={512}
                    showCount
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={handleUpdateGroupDescription}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingDescription(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-wa-text-secondary">
                  {selectedGroup.description || 'No description'}
                </p>
              )}
            </div>

            {/* Invite Link */}
            <div className="border-b border-wa-border px-6 py-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                Invite Link
              </h4>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 truncate rounded-lg bg-wa-input-bg px-3 py-2 text-sm text-wa-text-secondary">
                  {inviteLink || selectedGroup.inviteLink || 'No invite link available'}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-3.5 w-3.5" />}
                  onClick={handleCopyDetailInviteLink}
                >
                  Copy
                </Button>
              </div>
            </div>

            {/* Group Settings */}
            {selectedGroup.isAdmin && (
              <div className="border-b border-wa-border px-6 py-4">
                <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                  Settings
                </h4>
                <Toggle
                  checked={restrictMessages}
                  onChange={handleToggleRestrictMessages}
                  label="Only admins can send messages"
                />
              </div>
            )}

            {/* Members */}
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-wa-text-muted">
                  Members ({members.length})
                </h4>
              </div>

              {/* Add Member */}
              {selectedGroup.isAdmin && (
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    value={addMemberPhone}
                    onChange={(e) => setAddMemberPhone(e.target.value)}
                    placeholder="Phone number to add..."
                  />
                  <Button
                    size="sm"
                    icon={<UserPlus className="h-3.5 w-3.5" />}
                    onClick={handleAddMember}
                    disabled={!addMemberPhone.trim()}
                  >
                    Add
                  </Button>
                </div>
              )}

              {/* Members List */}
              {loadingMembers ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : (
                <div className="mt-3 space-y-1">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-wa-hover"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={member.profilePicUrl}
                          name={member.name}
                          size="sm"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-wa-text">
                              {member.name}
                            </span>
                            {member.isSuperAdmin && (
                              <Badge variant="warning">
                                <Crown className="mr-1 h-3 w-3" />
                                Creator
                              </Badge>
                            )}
                            {member.isAdmin && !member.isSuperAdmin && (
                              <Badge variant="success">
                                <Shield className="mr-1 h-3 w-3" />
                                Admin
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-wa-text-muted">
                            {member.phone}
                          </span>
                        </div>
                      </div>
                      {selectedGroup.isAdmin && !member.isSuperAdmin && (
                        <DropdownMenu
                          trigger={
                            <button className="rounded p-1 hover:bg-gray-200">
                              <MoreVertical className="h-3.5 w-3.5 text-wa-text-muted" />
                            </button>
                          }
                          items={[
                            ...(member.isAdmin
                              ? [
                                  {
                                    label: 'Demote from Admin',
                                    icon: <ShieldCheck className="h-4 w-4" />,
                                    onClick: () => handleDemoteMember(member.id),
                                  },
                                ]
                              : [
                                  {
                                    label: 'Promote to Admin',
                                    icon: <Shield className="h-4 w-4" />,
                                    onClick: () => handlePromoteMember(member.id),
                                  },
                                ]),
                            {
                              label: 'Remove',
                              icon: <UserMinus className="h-4 w-4" />,
                              onClick: () => handleRemoveMember(member.id),
                              danger: true,
                            },
                          ]}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewGroupName('');
          setSelectedParticipants([]);
          setParticipantSearch('');
        }}
        title="Create Group"
        description="Create a new WhatsApp group"
      >
        <div className="space-y-4">
          <Input
            label="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Enter group name..."
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-wa-text">
              Participants
            </label>

            {/* Selected Participants Chips */}
            {selectedParticipants.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedParticipants.map((pid) => {
                  const contact = contacts.find((c) => c.id === pid);
                  return (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-1 rounded-full bg-wa-light-green px-2.5 py-1 text-xs font-medium text-wa-teal-dark"
                    >
                      {contact?.name || pid}
                      <button
                        onClick={() =>
                          setSelectedParticipants((prev) =>
                            prev.filter((id) => id !== pid)
                          )
                        }
                        className="hover:text-wa-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Search Contacts */}
            <SearchInput
              value={participantSearch}
              onChange={setParticipantSearch}
              placeholder="Search contacts..."
            />

            {/* Contact List */}
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-wa-border">
              {filteredContacts.length === 0 ? (
                <p className="px-4 py-3 text-center text-sm text-wa-text-muted">
                  No contacts found
                </p>
              ) : (
                filteredContacts.slice(0, 50).map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() =>
                      setSelectedParticipants((prev) => [...prev, contact.id])
                    }
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-wa-hover"
                  >
                    <Avatar src={contact.profilePicUrl} name={contact.name} size="sm" />
                    <div>
                      <span className="text-sm font-medium text-wa-text">
                        {contact.name}
                      </span>
                      <span className="ml-2 text-xs text-wa-text-muted">
                        {contact.phone}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
            <p className="mt-1 text-xs text-wa-text-muted">
              {selectedParticipants.length} participant
              {selectedParticipants.length !== 1 ? 's' : ''} selected
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                setNewGroupName('');
                setSelectedParticipants([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateGroup}
              loading={creating}
              disabled={!newGroupName.trim()}
            >
              Create Group
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
