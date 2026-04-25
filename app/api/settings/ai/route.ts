import { NextRequest } from 'next/server';
import {
  getAllProviderConfigs,
  saveProviderConfig,
  clearProviderConfig,
  getDefaultProviderName,
  setDefaultProviderName,
  PROVIDER_MODELS,
  type AiProvider,
} from '@/lib/ai-providers';

function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••';
}

export async function GET() {
  try {
    const all = getAllProviderConfigs();
    const defaultProvider = getDefaultProviderName();
    const providers: Record<string, { model: string; apiKeyMasked: string } | null> = {};
    for (const [p, config] of Object.entries(all)) {
      providers[p] = config ? { model: config.model, apiKeyMasked: maskKey(config.apiKey) } : null;
    }
    return Response.json({ success: true, data: { providers, defaultProvider } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read AI settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, apiKey, model, setDefaultOnly } = body as {
      provider: AiProvider;
      apiKey?: string;
      model?: string;
      setDefaultOnly?: boolean;
    };

    if (!provider || !Object.keys(PROVIDER_MODELS).includes(provider)) {
      return Response.json({ success: false, error: 'Invalid provider' }, { status: 400 });
    }

    // Just set the default pointer, no key update needed
    if (setDefaultOnly) {
      setDefaultProviderName(provider);
      return Response.json({ success: true });
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return Response.json(
        { success: false, error: 'API key required (min 8 chars)' },
        { status: 400 }
      );
    }

    const resolvedModel = model || PROVIDER_MODELS[provider][0].value;
    saveProviderConfig(provider, { apiKey: apiKey.trim(), model: resolvedModel });

    // Auto-set as default if none is currently set
    if (!getDefaultProviderName()) {
      setDefaultProviderName(provider);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save AI settings' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as AiProvider | null;
    if (provider && Object.keys(PROVIDER_MODELS).includes(provider)) {
      clearProviderConfig(provider);
    }
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to clear AI settings' },
      { status: 500 }
    );
  }
}
