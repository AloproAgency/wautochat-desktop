import { NextRequest } from 'next/server';
import { testAiProvider, PROVIDER_MODELS, type AiProvider } from '@/lib/ai-providers';

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey, model } = await request.json();
    if (!provider || !Object.keys(PROVIDER_MODELS).includes(provider)) {
      return Response.json(
        { success: false, error: 'Invalid provider' },
        { status: 400 }
      );
    }
    if (!apiKey) {
      return Response.json(
        { success: false, error: 'API key is required' },
        { status: 400 }
      );
    }
    const result = await testAiProvider(provider as AiProvider, apiKey, model);
    if (!result.ok) {
      return Response.json({ success: false, error: result.error });
    }
    return Response.json({ success: true, data: { sample: result.sample } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Test failed' },
      { status: 500 }
    );
  }
}
