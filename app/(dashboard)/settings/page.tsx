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
  BrainCircuit,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useActiveSession } from '@/hooks/use-active-session';

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
  const activeSessionId = useActiveSession();
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

        {/* AI Provider Settings */}
        <AiProviderCard />

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

// ---- AI Provider Card ----

type AiProvider = 'groq' | 'openai' | 'anthropic' | 'gemini';

const AI_PROVIDERS: Array<{ value: AiProvider; label: string; docs: string }> = [
  { value: 'groq', label: 'Groq (gratuit, très rapide)', docs: 'https://console.groq.com/keys' },
  { value: 'gemini', label: 'Google Gemini (free tier généreux)', docs: 'https://aistudio.google.com/apikey' },
  { value: 'openai', label: 'OpenAI (payant)', docs: 'https://platform.openai.com/api-keys' },
  { value: 'anthropic', label: 'Anthropic Claude (payant)', docs: 'https://console.anthropic.com/settings/keys' },
];

const AI_MODELS: Record<AiProvider, { value: string; label: string }[]> = {
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (rapide, défaut)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (ultra-rapide)' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
};

function AiProviderCard() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [provider, setProvider] = useState<AiProvider>('groq');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<string>(AI_MODELS.groq[0].value);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load current settings on mount
  useEffect(() => {
    fetch('/api/settings/ai')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setConfigured(true);
          setProvider(json.data.provider);
          setModel(json.data.model);
          setApiKeyMasked(json.data.apiKeyMasked);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When provider changes, reset model to the first one for that provider
  useEffect(() => {
    if (!AI_MODELS[provider].some((m) => m.value === model)) {
      setModel(AI_MODELS[provider][0].value);
    }
  }, [provider, model]);

  async function handleSave() {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, msg: 'Entre une clé API avant de sauvegarder.' });
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      const json = await res.json();
      if (!json.success) {
        setTestResult({ ok: false, msg: json.error || 'Erreur à la sauvegarde' });
        return;
      }
      setConfigured(true);
      setApiKey('');
      setTestResult({ ok: true, msg: 'Configuration sauvegardée !' });
      // Refresh masked key preview
      const gr = await fetch('/api/settings/ai').then((r) => r.json());
      if (gr.success && gr.data) setApiKeyMasked(gr.data.apiKeyMasked);
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      setTestResult({ ok: false, msg: 'Entre une clé API à tester.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      const json = await res.json();
      if (json.success) {
        setTestResult({ ok: true, msg: `✅ Connexion OK. Réponse : ${json.data.sample}` });
      } else {
        setTestResult({ ok: false, msg: `❌ ${json.error}` });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : 'Erreur réseau' });
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    if (!confirm('Supprimer la configuration IA ? Les nodes AI Response ne fonctionneront plus.')) return;
    try {
      await fetch('/api/settings/ai', { method: 'DELETE' });
      setConfigured(false);
      setApiKeyMasked('');
      setApiKey('');
      setTestResult(null);
    } catch {
      // ignore
    }
  }

  const providerMeta = AI_PROVIDERS.find((p) => p.value === provider);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-wa-teal" />
          <h2 className="text-lg font-semibold text-wa-text">AI Provider</h2>
        </div>
        <p className="mt-1 text-sm text-wa-text-secondary">
          Configure un provider pour activer le nœud <span className="font-medium">AI Response</span> dans tes flows.
        </p>
      </CardHeader>
      <CardBody className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <>
            {configured && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-xs text-emerald-700 flex-1">
                  Provider configuré : <span className="font-semibold">{AI_PROVIDERS.find((p) => p.value === provider)?.label}</span>
                  {' · clé '}<span className="font-mono">{apiKeyMasked}</span>
                </p>
                <button
                  onClick={handleClear}
                  className="text-xs text-red-600 hover:underline"
                  type="button"
                >
                  Supprimer
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-wa-text mb-1.5">Provider</label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setProvider(p.value)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      provider === p.value
                        ? 'border-wa-teal bg-wa-teal/5 text-wa-text ring-1 ring-wa-teal/30'
                        : 'border-wa-border bg-white text-wa-text hover:bg-gray-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {providerMeta && (
                <p className="mt-1.5 text-xs text-wa-text-muted">
                  Obtenir une clé :{' '}
                  <a
                    href={providerMeta.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-wa-teal hover:underline"
                  >
                    {providerMeta.docs.replace(/^https?:\/\//, '')}
                  </a>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-wa-text mb-1.5">API Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={configured ? `Remplacer (actuel : ${apiKeyMasked})` : 'sk-... / gsk_... / ...'}
                    className="w-full rounded-lg border border-wa-border bg-white px-3 py-2 pr-9 text-sm text-wa-text placeholder:text-wa-text-muted focus:border-wa-teal focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-wa-text-muted hover:text-wa-text"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-wa-text-muted flex items-center gap-1">
                <KeyRound className="h-3 w-3" />
                La clé est stockée localement dans la base SQLite, jamais envoyée au navigateur.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-wa-text mb-1.5">Modèle par défaut</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-wa-border bg-white px-3 py-2 text-sm text-wa-text focus:border-wa-teal focus:outline-none"
              >
                {AI_MODELS[provider].map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-wa-text-muted">
                Tu pourras toujours override ce modèle dans chaque nœud AI Response.
              </p>
            </div>

            {testResult && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  testResult.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {testResult.msg}
              </div>
            )}
          </>
        )}
      </CardBody>
      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={handleTest}
          loading={testing}
          disabled={!apiKey.trim() || saving}
          icon={<Zap className="h-4 w-4" />}
        >
          Tester la clé
        </Button>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!apiKey.trim() || testing}
          icon={<Save className="h-4 w-4" />}
        >
          Sauvegarder
        </Button>
      </CardFooter>
    </Card>
  );
}
