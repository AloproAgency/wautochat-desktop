import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: unknown;

    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else {
      payload = await request.text();
    }

    const source = request.headers.get('x-webhook-source') || 'unknown';
    const event = request.headers.get('x-webhook-event') || 'unknown';

    // Log the webhook for debugging and future processing
    console.log(`[Webhook] Source: ${source}, Event: ${event}`, payload);

    // Store webhook event for future integrations
    // This can be extended to trigger flows, update data, etc.
    const db = getDb();

    // Check if there are any flows with webhook triggers
    const webhookFlows = db.prepare(
      `SELECT * FROM flows WHERE is_active = 1 AND trigger_config LIKE '%"type":"webhook"%'`
    ).all() as Record<string, unknown>[];

    if (webhookFlows.length > 0) {
      // Import flow engine dynamically to avoid circular imports
      const { executeFlow } = await import('@/lib/flow-engine');
      const manager = (await import('@/lib/wppconnect-manager')).default;

      for (const flowRow of webhookFlows) {
        const flow = {
          id: flowRow.id as string,
          sessionId: flowRow.session_id as string,
          name: flowRow.name as string,
          description: (flowRow.description as string) || undefined,
          isActive: true,
          trigger: JSON.parse((flowRow.trigger_config as string) || '{}'),
          nodes: JSON.parse((flowRow.nodes as string) || '[]'),
          edges: JSON.parse((flowRow.edges as string) || '[]'),
          variables: JSON.parse((flowRow.variables as string) || '{}'),
          createdAt: flowRow.created_at as string,
          updatedAt: flowRow.updated_at as string,
        };

        // Check if webhook source/event matches trigger config
        const triggerConfig = flow.trigger.config as Record<string, unknown>;
        const matchSource = !triggerConfig.source || triggerConfig.source === source;
        const matchEvent = !triggerConfig.event || triggerConfig.event === event;

        if (matchSource && matchEvent) {
          const session = manager.getSession(flow.sessionId);
          if (session) {
            const webhookMessage = {
              body: typeof payload === 'string' ? payload : JSON.stringify(payload),
              from: `webhook:${source}`,
              chatId: `webhook:${source}`,
              type: 'webhook',
              webhookPayload: payload,
              webhookSource: source,
              webhookEvent: event,
            };

            try {
              await executeFlow(flow, webhookMessage, session);
            } catch (err) {
              console.error(`[Webhook] Flow execution error for flow ${flow.id}:`, err);
            }
          }
        }
      }
    }

    return Response.json({
      success: true,
      data: {
        received: true,
        source,
        event,
        flowsTriggered: webhookFlows.length,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process webhook' },
      { status: 500 }
    );
  }
}
