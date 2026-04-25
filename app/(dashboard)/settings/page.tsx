'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  Palette,
  Settings,
  Database,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Zap,
  Save,
  Trash2,
  RotateCcw,
  Download,
  Sun,
  Moon,
  Monitor,
  Star,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Timer,
  Bell,
} from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

type AiProvider = 'groq' | 'openai' | 'anthropic' | 'gemini';
type Theme = 'light' | 'dark' | 'system';
type Tab = 'appearance' | 'ai' | 'general' | 'data';

// ── Provider metadata ─────────────────────────────────────────────────────────

const PROVIDER_INFO: Record<AiProvider, {
  label: string;
  description: string;
  docsUrl: string;
  keyPlaceholder: string;
  color: string;
  bgColor: string;
}> = {
  groq: {
    label: 'Groq',
    description: 'Ultra-fast inference, generous free tier',
    docsUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    color: '#F55036',
    bgColor: '#FEF2F0',
  },
  openai: {
    label: 'OpenAI',
    description: 'GPT-4o and family, industry standard',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    color: '#10a37f',
    bgColor: '#F0FFF9',
  },
  anthropic: {
    label: 'Anthropic Claude',
    description: 'Claude models, best for complex reasoning',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    color: '#D97706',
    bgColor: '#FFFBEB',
  },
  gemini: {
    label: 'Google Gemini',
    description: 'Gemini 2.0 Flash is fast and free',
    docsUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    color: '#4285F4',
    bgColor: '#EFF6FF',
  },
};

const AI_MODELS: Record<AiProvider, { value: string; label: string }[]> = {
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (default)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
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

// ── Theme hook ────────────────────────────────────────────────────────────────

function useTheme() {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('wautochat-theme') as Theme) || 'light';
    setThemeState(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('wautochat-theme', t);
    const isDark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, []);

  return { theme, setTheme };
}

// ── Shared components ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        {label && <span className="text-sm font-medium text-slate-800 dark:text-zinc-100">{label}</span>}
        {description && <p className="mt-0.5 text-xs text-slate-400 dark:text-zinc-500">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-slate-900 dark:bg-zinc-600' : 'bg-slate-200 dark:bg-zinc-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-zinc-300">{title}</h2>
      {description && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{description}</p>}
    </div>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
    { value: 'light', label: 'Light', description: 'Clean white interface', icon: Sun },
    { value: 'dark', label: 'Dark', description: 'Easy on the eyes at night', icon: Moon },
    { value: 'system', label: 'System', description: "Follows your OS settings", icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <div>
        <SectionHeader title="Theme" description="Choose how WAutoChat looks on your device" />
        <div className="grid grid-cols-3 gap-3">
          {options.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all ${
                theme === value
                  ? 'border-slate-900 bg-slate-50 dark:border-zinc-500 dark:bg-zinc-700'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-gray-500'
              }`}
            >
              {theme === value && (
                <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-slate-900 dark:bg-zinc-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
              <Icon className={`w-6 h-6 ${theme === value ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-500'}`} />
              <div>
                <div className={`text-sm font-semibold ${theme === value ? 'text-slate-900 dark:text-zinc-100' : 'text-slate-600 dark:text-zinc-400'}`}>
                  {label}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AI Providers tab ──────────────────────────────────────────────────────────

interface ProviderConfig {
  model: string;
  apiKeyMasked: string;
}

function AiProvidersTab() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<Record<AiProvider, ProviderConfig | null>>({
    groq: null,
    openai: null,
    anthropic: null,
    gemini: null,
  });
  const [defaultProvider, setDefaultProvider] = useState<AiProvider | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<AiProvider | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/ai');
      const j = await r.json();
      if (j.success && j.data) {
        setConfigs(j.data.providers);
        setDefaultProvider(j.data.defaultProvider);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const providers: AiProvider[] = ['groq', 'openai', 'anthropic', 'gemini'];
  const configuredCount = providers.filter((p) => configs[p]).length;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="AI Providers"
        description={
          configuredCount > 0
            ? `${configuredCount} provider${configuredCount > 1 ? 's' : ''} configured — keys are stored securely in the local SQLite database`
            : 'Add at least one provider to enable AI nodes in your flows'
        }
      />

      <div className="space-y-2">
        {providers.map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            config={configs[provider]}
            isDefault={defaultProvider === provider}
            isExpanded={expandedProvider === provider}
            onToggleExpand={() =>
              setExpandedProvider((prev) => (prev === provider ? null : provider))
            }
            onSaved={loadAll}
            onRemoved={loadAll}
            onSetDefault={async () => {
              await fetch('/api/settings/ai', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, setDefaultOnly: true }),
              });
              setDefaultProvider(provider);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  config,
  isDefault,
  isExpanded,
  onToggleExpand,
  onSaved,
  onRemoved,
  onSetDefault,
}: {
  provider: AiProvider;
  config: ProviderConfig | null;
  isDefault: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSaved: () => void;
  onRemoved: () => void;
  onSetDefault: () => void;
}) {
  const info = PROVIDER_INFO[provider];
  const models = AI_MODELS[provider];

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(config?.model || models[0].value);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (isExpanded) {
      setApiKey('');
      setModel(config?.model || models[0].value);
      setResult(null);
      setShowKey(false);
    }
  }, [isExpanded, config, models]);

  async function handleSave() {
    if (!apiKey.trim()) {
      setResult({ ok: false, msg: 'API key is required' });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const r = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      const j = await r.json();
      if (!j.success) {
        setResult({ ok: false, msg: j.error || 'Save failed' });
        return;
      }
      setResult({ ok: true, msg: 'Saved successfully' });
      setApiKey('');
      onSaved();
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) {
      setResult({ ok: false, msg: 'Enter an API key to test' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model }),
      });
      const j = await r.json();
      if (j.success) {
        setResult({ ok: true, msg: `Connected — ${j.data.sample}` });
      } else {
        setResult({ ok: false, msg: j.error || 'Test failed' });
      }
    } catch (err) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${info.label} configuration?`)) return;
    try {
      await fetch(`/api/settings/ai?provider=${provider}`, { method: 'DELETE' });
      onRemoved();
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
        onClick={onToggleExpand}
      >
        {/* Provider color dot */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: info.bgColor }}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: info.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{info.label}</span>
            {isDefault && config && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 dark:bg-zinc-700 text-white">
                <Star className="w-2.5 h-2.5" />
                DEFAULT
              </span>
            )}
            {config && !isDefault && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                <Check className="w-2.5 h-2.5" />
                Configured
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5 truncate">
            {config
              ? `${config.apiKeyMasked} · ${config.model}`
              : info.description}
          </p>
        </div>

        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
        )}
      </button>

      {/* Expanded form */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-900/40 p-4 space-y-4">
          {/* API Key field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  config
                    ? `Replace current (${config.apiKeyMasked})`
                    : info.keyPlaceholder
                }
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 pr-9 text-sm text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:border-slate-400 dark:focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-100 dark:focus:ring-zinc-700 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1">
              <KeyRound className="w-3 h-3 shrink-0" />
              Stored in local SQLite, never sent to the browser.{' '}
              <a
                href={info.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 dark:text-zinc-400 underline underline-offset-2 hover:text-slate-800 dark:hover:text-zinc-200"
              >
                Get API key ↗
              </a>
            </p>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">
              Default model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-zinc-100 focus:border-slate-400 dark:focus:border-zinc-500 focus:outline-none transition-all"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result banner */}
          {result && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                result.ok
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400'
                  : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400'
              }`}
            >
              {result.ok ? (
                <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              )}
              <span>{result.msg}</span>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {config && !isDefault && (
                <button
                  onClick={onSetDefault}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                >
                  <Star className="w-3.5 h-3.5" />
                  Set as default
                </button>
              )}
              {config && (
                <button
                  onClick={handleRemove}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={!apiKey.trim() || testing || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                {testing ? <Spinner size="sm" /> : <Zap className="w-3.5 h-3.5" />}
                Test
              </button>
              <button
                onClick={handleSave}
                disabled={!apiKey.trim() || saving || testing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-zinc-700 text-white text-xs font-semibold hover:bg-slate-700 dark:hover:bg-zinc-600 disabled:opacity-40 transition-colors"
              >
                {saving ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── General tab ───────────────────────────────────────────────────────────────

interface GeneralSettings {
  defaultMessageDelay: number;
  typingIndicator: boolean;
  typingDuration: number;
  maxRetries: number;
  enableNotifications: boolean;
  notificationSound: boolean;
}

const DEFAULT_GENERAL: GeneralSettings = {
  defaultMessageDelay: 1000,
  typingIndicator: true,
  typingDuration: 2000,
  maxRetries: 3,
  enableNotifications: true,
  notificationSound: true,
};

function GeneralTab() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULT_GENERAL);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('wautochat-settings');
      if (stored) setSettings((prev) => ({ ...prev, ...JSON.parse(stored) }));
    } catch {
      // ignore
    }
  }, []);

  const update = useCallback((updates: Partial<GeneralSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem('wautochat-settings', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  return (
    <div className="space-y-6">
      {/* Flow Engine */}
      <div>
        <SectionHeader
          title="Flow Engine"
          description="Default behavior applied to all automation flows"
        />
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-gray-700">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <Timer className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">Message delay</div>
              <div className="text-xs text-slate-400 dark:text-zinc-500">Pause between consecutive messages (ms)</div>
            </div>
            <input
              type="number"
              value={settings.defaultMessageDelay}
              onChange={(e) => update({ defaultMessageDelay: parseInt(e.target.value) || 0 })}
              className="w-24 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 px-3 py-1.5 text-sm text-right focus:border-slate-400 dark:focus:border-zinc-500 focus:outline-none"
              min={0}
              step={100}
            />
          </div>

          <div className="px-4 py-3.5">
            <Toggle
              checked={settings.typingIndicator}
              onChange={(v) => update({ typingIndicator: v })}
              label="Typing indicator"
              description="Show typing status before sending messages"
            />
          </div>

          {settings.typingIndicator && (
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">Typing duration</div>
                <div className="text-xs text-slate-400 dark:text-zinc-500">How long to show typing (ms)</div>
              </div>
              <input
                type="number"
                value={settings.typingDuration}
                onChange={(e) => update({ typingDuration: parseInt(e.target.value) || 0 })}
                className="w-24 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 px-3 py-1.5 text-sm text-right focus:border-slate-400 dark:focus:border-zinc-500 focus:outline-none"
                min={0}
                step={500}
              />
            </div>
          )}

          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">Max retries</div>
              <div className="text-xs text-slate-400 dark:text-zinc-500">Retry count for failed message sends</div>
            </div>
            <input
              type="number"
              value={settings.maxRetries}
              onChange={(e) => update({ maxRetries: parseInt(e.target.value) || 0 })}
              className="w-24 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 px-3 py-1.5 text-sm text-right focus:border-slate-400 dark:focus:border-zinc-500 focus:outline-none"
              min={0}
              max={10}
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div>
        <SectionHeader title="Notifications" description="How you receive alerts from the app" />
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-gray-700">
          <div className="flex items-center gap-4 px-4 py-3.5">
            <Bell className="w-4 h-4 text-slate-400 dark:text-zinc-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <Toggle
                checked={settings.enableNotifications}
                onChange={(v) => update({ enableNotifications: v })}
                label="Enable notifications"
                description="Receive alerts for new messages and events"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3.5">
            <div className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <Toggle
                checked={settings.notificationSound}
                onChange={(v) => update({ notificationSound: v })}
                label="Sound"
                description="Play a sound when notifications arrive"
              />
            </div>
          </div>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5" />
          Saved automatically
        </div>
      )}
    </div>
  );
}

// ── Data tab ──────────────────────────────────────────────────────────────────

function DataTab() {
  async function handleExport() {
    try {
      const res = await fetch('/api/data/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wautochat-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  function handleReset() {
    if (!confirm('Reset all settings to defaults?')) return;
    localStorage.removeItem('wautochat-settings');
    localStorage.removeItem('wautochat-theme');
    document.documentElement.dataset.theme = 'light';
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Data Management" />
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-slate-200 dark:border-zinc-700 divide-y divide-slate-100 dark:divide-gray-700">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">Export data</div>
            <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Download all data as a JSON file</div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>

        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-sm font-medium text-slate-800 dark:text-zinc-100">Reset settings</div>
            <div className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">Restore all preferences to their defaults</div>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI Providers', icon: BrainCircuit },
  { id: 'general', label: 'General', icon: Settings },
  { id: 'data', label: 'Data', icon: Database },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('ai');

  // Apply stored theme on mount
  useEffect(() => {
    try {
      const stored = (localStorage.getItem('wautochat-theme') as Theme) || 'light';
      const isDark =
        stored === 'dark' ||
        (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="flex flex-col -m-4 md:-m-6 lg:max-w-none min-h-screen bg-slate-50 dark:bg-zinc-900">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700">
        <div className="flex items-center px-5 h-14">
          <h1 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Settings</h1>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-slate-100 dark:border-zinc-700 px-4 gap-0.5 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === id
                  ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 p-5">
        <div className="mx-auto max-w-2xl">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'ai' && <AiProvidersTab />}
          {tab === 'general' && <GeneralTab />}
          {tab === 'data' && <DataTab />}
        </div>
      </div>
    </div>
  );
}
