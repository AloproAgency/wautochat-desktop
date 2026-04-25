import { getDb } from '@/lib/db';

export type AiProvider = 'groq' | 'openai' | 'anthropic' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}

export interface AiCallOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Override model from settings for this specific call */
  model?: string;
  /** Override provider/key from settings for this specific call */
  providerOverride?: { provider: AiProvider; apiKey: string };
}

export interface AiCallResult {
  text: string;
  model: string;
  provider: AiProvider;
  tokensUsed?: number;
}

// --- Settings persistence (SQLite `app_settings` table) ---

const SETTINGS_KEY = 'ai';

export function getAiSettings(): AiSettings | null {
  // New per-provider storage: use default provider if set
  const defaultProvider = getDefaultProviderName();
  if (defaultProvider) {
    const config = getProviderConfig(defaultProvider);
    if (config) return { provider: defaultProvider, apiKey: config.apiKey, model: config.model };
  }
  // Try all providers, return the first configured one
  const providers: AiProvider[] = ['groq', 'openai', 'anthropic', 'gemini'];
  for (const p of providers) {
    const config = getProviderConfig(p);
    if (config) return { provider: p, apiKey: config.apiKey, model: config.model };
  }
  // Backward compat: fall back to old single-provider 'ai' key
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value) as AiSettings; } catch { return null; }
}

export function saveAiSettings(settings: AiSettings): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAiSettings(): void {
  const db = getDb();
  db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(SETTINGS_KEY);
}

// ── Per-provider storage (new multi-provider approach) ────────────────────────

export function getProviderConfig(provider: AiProvider): { apiKey: string; model: string } | null {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(`ai_provider_${provider}`) as { value: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export function saveProviderConfig(provider: AiProvider, config: { apiKey: string; model: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(`ai_provider_${provider}`, JSON.stringify(config));
}

export function clearProviderConfig(provider: AiProvider): void {
  const db = getDb();
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(`ai_provider_${provider}`);
  const defRow = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('ai_default_provider') as { value: string } | undefined;
  if (defRow?.value === provider) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('ai_default_provider');
  }
}

export function getAllProviderConfigs(): Record<AiProvider, { apiKey: string; model: string } | null> {
  const providers: AiProvider[] = ['groq', 'openai', 'anthropic', 'gemini'];
  return Object.fromEntries(
    providers.map((p) => [p, getProviderConfig(p)])
  ) as Record<AiProvider, { apiKey: string; model: string } | null>;
}

export function getDefaultProviderName(): AiProvider | null {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('ai_default_provider') as { value: string } | undefined;
  if (!row) return null;
  return row.value as AiProvider;
}

export function setDefaultProviderName(provider: AiProvider): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run('ai_default_provider', provider);
}

// --- Model catalog per provider (what the UI shows in the picker) ---

export const PROVIDER_MODELS: Record<AiProvider, { value: string; label: string }[]> = {
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (fast, default)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fastest)' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
  ],
  openai: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (cheap)' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fast, cheap)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  ],
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (fast, free)' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  groq: 'Groq (gratuit, très rapide)',
  openai: 'OpenAI (payant)',
  anthropic: 'Anthropic Claude (payant)',
  gemini: 'Google Gemini (free tier généreux)',
};

// --- Provider implementations ---

async function callGroq(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<AiCallResult> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model,
    provider: 'groq',
    tokensUsed: data.usage?.total_tokens,
  };
}

async function callOpenAI(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<AiCallResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`OpenAI API error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model,
    provider: 'openai',
    tokensUsed: data.usage?.total_tokens,
  };
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<AiCallResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Anthropic API error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    text: data.content?.[0]?.text ?? '',
    model,
    provider: 'anthropic',
    tokensUsed:
      (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
  };
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<AiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ??
    '';
  return {
    text,
    model,
    provider: 'gemini',
    tokensUsed: data.usageMetadata?.totalTokenCount,
  };
}

// --- Public API: callAi ---

/**
 * Call the configured AI provider with the given prompt.
 * Throws if no provider is configured or the API call fails.
 */
export async function callAi(options: AiCallOptions): Promise<AiCallResult> {
  const settings = options.providerOverride
    ? ({ provider: options.providerOverride.provider, apiKey: options.providerOverride.apiKey, model: options.model || '' } as AiSettings)
    : getAiSettings();

  if (!settings || !settings.provider || !settings.apiKey) {
    throw new Error('AI provider not configured — open Settings and add a provider + API key.');
  }

  const model = options.model || settings.model || PROVIDER_MODELS[settings.provider][0].value;
  const maxTokens = Math.max(1, Math.min(options.maxTokens ?? 500, 4000));
  const temperature = Math.max(0, Math.min(options.temperature ?? 0.7, 2));

  switch (settings.provider) {
    case 'groq':
      return callGroq(options.prompt, settings.apiKey, model, maxTokens, temperature);
    case 'openai':
      return callOpenAI(options.prompt, settings.apiKey, model, maxTokens, temperature);
    case 'anthropic':
      return callAnthropic(options.prompt, settings.apiKey, model, maxTokens, temperature);
    case 'gemini':
      return callGemini(options.prompt, settings.apiKey, model, maxTokens, temperature);
    default:
      throw new Error(`Unknown AI provider: ${settings.provider}`);
  }
}

/**
 * Quick check used by the Settings page "Test" button — sends a tiny prompt
 * and returns true if the provider responded without error.
 */
export async function testAiProvider(
  provider: AiProvider,
  apiKey: string,
  model?: string
): Promise<{ ok: true; sample: string } | { ok: false; error: string }> {
  try {
    const result = await callAi({
      prompt: 'Reply with exactly: "WAutoChat connection OK"',
      maxTokens: 32,
      temperature: 0,
      model: model || PROVIDER_MODELS[provider][0].value,
      providerOverride: { provider, apiKey },
    });
    return { ok: true, sample: result.text.trim().slice(0, 120) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
