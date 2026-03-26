'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  User,
  Bell,
  Webhook,
  Workflow,
  AlertTriangle,
  Save,
  Upload,
  Trash2,
  RotateCcw,
  Download,
  Zap,
  Monitor,
  Volume2,
  Timer,
  RefreshCw,
  FileText,
  MessageSquare,
  Users,
  Activity,
  Send as SendIcon,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useSessionStore } from '@/lib/store';

// ---- Toggle ----
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {label && <span className="text-sm font-medium text-wa-text">{label}</span>}
        {description && (
          <p className="mt-0.5 text-xs text-wa-text-muted">{description}</p>
        )}
      </div>
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
    </div>
  );
}

interface AppSettings {
  // Profile
  profilePicUrl: string;
  displayName: string;
  statusMessage: string;

  // Session
  defaultDeviceName: string;
  autoReconnect: boolean;
  messageLogging: boolean;

  // Notifications
  enableNotifications: boolean;
  notificationSound: boolean;
  desktopNotifications: boolean;

  // Webhook
  webhookUrl: string;
  webhookEvents: {
    messages: boolean;
    statusChanges: boolean;
    groupEvents: boolean;
    contactEvents: boolean;
    connectionEvents: boolean;
  };

  // Flow Engine
  defaultMessageDelay: number;
  maxRetries: number;
  typingIndicator: boolean;
  typingDuration: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  profilePicUrl: '',
  displayName: '',
  statusMessage: '',
  defaultDeviceName: 'WAutoChat',
  autoReconnect: true,
  messageLogging: true,
  enableNotifications: true,
  notificationSound: true,
  desktopNotifications: false,
  webhookUrl: '',
  webhookEvents: {
    messages: true,
    statusChanges: true,
    groupEvents: false,
    contactEvents: false,
    connectionEvents: true,
  },
  defaultMessageDelay: 1000,
  maxRetries: 3,
  typingIndicator: true,
  typingDuration: 2000,
};

export default function SettingsPage() {
  const { activeSessionId } = useSessionStore();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<
    'success' | 'error' | null
  >(null);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('wautochat-settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // use defaults
    }
    setLoaded(true);
  }, []);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem('wautochat-settings', JSON.stringify(settings));
    } catch {
      // handle silently
    }
  }, [settings, loaded]);

  const updateSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const updateWebhookEvent = useCallback(
    (event: keyof AppSettings['webhookEvents'], value: boolean) => {
      setSettings((prev) => ({
        ...prev,
        webhookEvents: { ...prev.webhookEvents, [event]: value },
      }));
    },
    []
  );

  const handleSaveProfile = async () => {
    if (!activeSessionId) return;
    setSavingProfile(true);
    try {
      await fetch('/api/sessions/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          displayName: settings.displayName,
          statusMessage: settings.statusMessage,
          profilePicUrl: settings.profilePicUrl,
        }),
      });
    } catch {
      // handle silently
    } finally {
      setSavingProfile(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!settings.webhookUrl) return;
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: settings.webhookUrl }),
      });
      const data = await res.json();
      setWebhookTestResult(data.success ? 'success' : 'error');
    } catch {
      setWebhookTestResult('error');
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await fetch('/api/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          url: settings.webhookUrl,
          events: settings.webhookEvents,
        }),
      });
    } catch {
      // handle silently
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteAllData = async () => {
    const firstConfirm = confirm(
      'Are you sure you want to delete ALL data? This action cannot be undone.'
    );
    if (!firstConfirm) return;
    const secondConfirm = confirm(
      'This is your FINAL warning. All sessions, messages, contacts, and settings will be permanently deleted. Type OK to proceed.'
    );
    if (!secondConfirm) return;

    try {
      await fetch('/api/data', { method: 'DELETE' });
      localStorage.removeItem('wautochat-settings');
      setSettings(DEFAULT_SETTINGS);
    } catch {
      // handle silently
    }
  };

  const handleResetSettings = () => {
    if (!confirm('Reset all settings to defaults?')) return;
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem('wautochat-settings');
  };

  const handleExportData = async () => {
    try {
      const res = await fetch('/api/data/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wautochat-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // If API fails, export local settings
      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wautochat-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-wa-text">Settings</h1>
        <p className="mt-1 text-sm text-wa-text-secondary">
          Configure your WAutoChat preferences
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-wa-teal" />
              <h2 className="text-lg font-semibold text-wa-text">Profile</h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Update your WhatsApp profile information
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Profile Picture */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-wa-text">
                Profile Picture
              </label>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gray-100">
                  {settings.profilePicUrl ? (
                    <img
                      src={settings.profilePicUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <Input
                    value={settings.profilePicUrl}
                    onChange={(e) =>
                      updateSettings({ profilePicUrl: e.target.value })
                    }
                    placeholder="https://example.com/photo.jpg"
                    prefix={<Upload className="h-4 w-4" />}
                  />
                  <p className="mt-1 text-xs text-wa-text-muted">
                    Enter a URL for your profile picture
                  </p>
                </div>
              </div>
            </div>

            <Input
              label="Display Name"
              value={settings.displayName}
              onChange={(e) => updateSettings({ displayName: e.target.value })}
              placeholder="Your display name"
            />

            <Textarea
              label="Status Message"
              value={settings.statusMessage}
              onChange={(e) =>
                updateSettings({ statusMessage: e.target.value })
              }
              placeholder="Hey there! I am using WAutoChat"
              maxLength={139}
              showCount
            />
          </CardBody>
          <CardFooter className="flex justify-end">
            <Button
              icon={<Save className="h-4 w-4" />}
              onClick={handleSaveProfile}
              loading={savingProfile}
            >
              Save Profile
            </Button>
          </CardFooter>
        </Card>

        {/* Session Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-wa-teal" />
              <h2 className="text-lg font-semibold text-wa-text">
                Session Settings
              </h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Configure session behavior
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <Input
              label="Default Device Name"
              value={settings.defaultDeviceName}
              onChange={(e) =>
                updateSettings({ defaultDeviceName: e.target.value })
              }
              placeholder="WAutoChat"
            />
            <Toggle
              checked={settings.autoReconnect}
              onChange={(val) => updateSettings({ autoReconnect: val })}
              label="Auto-reconnect"
              description="Automatically reconnect disconnected sessions"
            />
            <Toggle
              checked={settings.messageLogging}
              onChange={(val) => updateSettings({ messageLogging: val })}
              label="Message Logging"
              description="Log all incoming and outgoing messages"
            />
          </CardBody>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-wa-teal" />
              <h2 className="text-lg font-semibold text-wa-text">
                Notifications
              </h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Manage notification preferences
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <Toggle
              checked={settings.enableNotifications}
              onChange={(val) =>
                updateSettings({ enableNotifications: val })
              }
              label="Enable Notifications"
              description="Receive notifications for new messages and events"
            />
            <Toggle
              checked={settings.notificationSound}
              onChange={(val) =>
                updateSettings({ notificationSound: val })
              }
              label="Notification Sound"
              description="Play a sound when notifications arrive"
            />
            <Toggle
              checked={settings.desktopNotifications}
              onChange={(val) =>
                updateSettings({ desktopNotifications: val })
              }
              label="Desktop Notifications"
              description="Show browser desktop notifications"
            />
          </CardBody>
        </Card>

        {/* Webhook Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5 text-wa-teal" />
              <h2 className="text-lg font-semibold text-wa-text">Webhooks</h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Forward events to an external URL
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <Input
                label="Webhook URL"
                value={settings.webhookUrl}
                onChange={(e) =>
                  updateSettings({ webhookUrl: e.target.value })
                }
                placeholder="https://example.com/webhook"
                prefix={<Zap className="h-4 w-4" />}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-wa-text">
                Events to Forward
              </label>
              <div className="space-y-3 rounded-lg border border-wa-border p-4">
                <WebhookEventCheckbox
                  checked={settings.webhookEvents.messages}
                  onChange={(val) => updateWebhookEvent('messages', val)}
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Messages"
                  description="New messages received and sent"
                />
                <WebhookEventCheckbox
                  checked={settings.webhookEvents.statusChanges}
                  onChange={(val) => updateWebhookEvent('statusChanges', val)}
                  icon={<Activity className="h-4 w-4" />}
                  label="Status Changes"
                  description="Message delivery and read receipts"
                />
                <WebhookEventCheckbox
                  checked={settings.webhookEvents.groupEvents}
                  onChange={(val) => updateWebhookEvent('groupEvents', val)}
                  icon={<Users className="h-4 w-4" />}
                  label="Group Events"
                  description="Member joins, leaves, and group updates"
                />
                <WebhookEventCheckbox
                  checked={settings.webhookEvents.contactEvents}
                  onChange={(val) => updateWebhookEvent('contactEvents', val)}
                  icon={<User className="h-4 w-4" />}
                  label="Contact Events"
                  description="New contacts and profile updates"
                />
                <WebhookEventCheckbox
                  checked={settings.webhookEvents.connectionEvents}
                  onChange={(val) =>
                    updateWebhookEvent('connectionEvents', val)
                  }
                  icon={<RefreshCw className="h-4 w-4" />}
                  label="Connection Events"
                  description="Session connect, disconnect, and QR events"
                />
              </div>
            </div>

            {/* Test Result */}
            {webhookTestResult && (
              <div
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm ${
                  webhookTestResult === 'success'
                    ? 'bg-wa-success/10 text-green-700'
                    : 'bg-wa-danger/10 text-red-700'
                }`}
              >
                {webhookTestResult === 'success' ? (
                  <>
                    <Check className="h-4 w-4" />
                    Webhook test successful
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    Webhook test failed. Check the URL and try again.
                  </>
                )}
              </div>
            )}
          </CardBody>
          <CardFooter className="flex justify-end gap-2">
            <Button
              variant="secondary"
              icon={<SendIcon className="h-4 w-4" />}
              onClick={handleTestWebhook}
              loading={testingWebhook}
              disabled={!settings.webhookUrl}
            >
              Test Webhook
            </Button>
            <Button
              icon={<Save className="h-4 w-4" />}
              onClick={handleSaveWebhook}
              loading={savingWebhook}
            >
              Save Webhook
            </Button>
          </CardFooter>
        </Card>

        {/* Flow Engine Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5 text-wa-teal" />
              <h2 className="text-lg font-semibold text-wa-text">
                Flow Engine
              </h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Configure automation behavior
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Default Delay (ms)"
                type="number"
                value={settings.defaultMessageDelay.toString()}
                onChange={(e) =>
                  updateSettings({
                    defaultMessageDelay:
                      parseInt(e.target.value) || 0,
                  })
                }
                prefix={<Timer className="h-4 w-4" />}
                helperText="Delay between consecutive messages"
              />
              <Input
                label="Max Retries"
                type="number"
                value={settings.maxRetries.toString()}
                onChange={(e) =>
                  updateSettings({
                    maxRetries: parseInt(e.target.value) || 0,
                  })
                }
                helperText="Retry count for failed messages"
              />
            </div>
            <Toggle
              checked={settings.typingIndicator}
              onChange={(val) => updateSettings({ typingIndicator: val })}
              label="Typing Indicator"
              description="Show typing indicator before sending messages"
            />
            {settings.typingIndicator && (
              <Input
                label="Typing Duration (ms)"
                type="number"
                value={settings.typingDuration.toString()}
                onChange={(e) =>
                  updateSettings({
                    typingDuration: parseInt(e.target.value) || 0,
                  })
                }
                prefix={<Timer className="h-4 w-4" />}
                helperText="How long to show the typing indicator"
              />
            )}
          </CardBody>
        </Card>

        {/* Danger Zone */}
        <Card className="border-wa-danger/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-wa-danger" />
              <h2 className="text-lg font-semibold text-wa-danger">
                Danger Zone
              </h2>
            </div>
            <p className="mt-1 text-sm text-wa-text-secondary">
              Irreversible and destructive actions
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-wa-border p-4">
              <div>
                <h3 className="font-medium text-wa-text">Export Data</h3>
                <p className="text-sm text-wa-text-secondary">
                  Download all your data as JSON
                </p>
              </div>
              <Button
                variant="secondary"
                icon={<Download className="h-4 w-4" />}
                onClick={handleExportData}
              >
                Export
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-wa-border p-4">
              <div>
                <h3 className="font-medium text-wa-text">Reset Settings</h3>
                <p className="text-sm text-wa-text-secondary">
                  Reset all settings to their default values
                </p>
              </div>
              <Button
                variant="secondary"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={handleResetSettings}
              >
                Reset
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-wa-danger/30 bg-wa-danger/5 p-4">
              <div>
                <h3 className="font-medium text-wa-danger">Delete All Data</h3>
                <p className="text-sm text-wa-text-secondary">
                  Permanently delete all sessions, messages, and settings
                </p>
              </div>
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={handleDeleteAllData}
              >
                Delete All
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ---- Webhook Event Checkbox ----
function WebhookEventCheckbox({
  checked,
  onChange,
  icon,
  label,
  description,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-wa-border text-wa-teal accent-wa-teal"
      />
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-wa-text-muted">{icon}</span>
        <div>
          <span className="text-sm font-medium text-wa-text">{label}</span>
          <p className="text-xs text-wa-text-muted">{description}</p>
        </div>
      </div>
    </label>
  );
}
