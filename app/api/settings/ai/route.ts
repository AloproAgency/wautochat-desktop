import { NextRequest } from 'next/server';
import {
  getAiSettings,
  saveAiSettings,
  clearAiSettings,
  PROVIDER_MODELS,
  type AiProvider,
  type AiSettings,
} from '@/lib/ai-providers';

export async function GET() {
  try {
    const settings = getAiSettings();
    if (!settings) {
      return Response.json({ success: true, data: null });
    }
    // Never send the full API key back to the browser — only a masked preview.
    const masked =
      settings.apiKey.length > 8
        ? `${settings.apiKey.slice(0, 4)}…${settings.apiKey.slice(-4)}`
        : '••••';
    return Response.json({
      success: true,
      data: {
        provider: settings.provider,
        model: settings.model,
        systemPrompt: settings.systemPrompt || '',
        apiKeyMasked: masked,
        configured: true,
      },
    });
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
    const { provider, apiKey, model, systemPrompt } = body as Partial<AiSettings>;

    if (!provider || !Object.keys(PROVIDER_MODELS).includes(provider)) {
      return Response.json(
        { success: false, error: 'Invalid provider. Must be one of: groq, openai, anthropic, gemini.' },
        { status: 400 }
      );
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return Response.json(
        { success: false, error: 'API key is required and must be a real key (min 8 chars).' },
        { status: 400 }
      );
    }

    const resolvedModel = model || PROVIDER_MODELS[provider as AiProvider][0].value;

    saveAiSettings({
      provider: provider as AiProvider,
      apiKey: apiKey.trim(),
      model: resolvedModel,
      systemPrompt: systemPrompt || '',
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save AI settings' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearAiSettings();
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to clear AI settings' },
      { status: 500 }
    );
  }
}
