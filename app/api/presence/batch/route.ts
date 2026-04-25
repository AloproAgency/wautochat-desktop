import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

/**
 * Batch presence lookup. WhatsApp gates online state behind explicit
 * subscription, so we subscribe before reading. The result is a map keyed by
 * chatId so the UI can show a "really online" dot instead of the misleading
 * "has a WhatsApp account" check.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, chatIds } = body as { sessionId?: string; chatIds?: string[] };

    if (!sessionId || !Array.isArray(chatIds) || chatIds.length === 0) {
      return Response.json(
        { success: false, error: 'sessionId and chatIds[] are required' },
        { status: 400 }
      );
    }

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json({ success: true, data: {} });
    }

    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (!page) {
      return Response.json({ success: true, data: {} });
    }

    // Cap the batch size — subscribing to too many contacts at once is
    // expensive on WA Web and only the first ones get processed reliably.
    const ids = chatIds.slice(0, 200).filter((id) => typeof id === 'string' && id.length > 0);
    if (ids.length === 0) {
      return Response.json({ success: true, data: {} });
    }

    try {
      // Subscribe first (WhatsApp won't deliver presence info until you do),
      // then read getPresence per id. Both calls are best-effort.
      try {
        await (client as unknown as { subscribePresence: (ids: string | string[]) => Promise<number> })
          .subscribePresence(ids);
      } catch {
        // Some accounts don't support batch subscription — fall through.
      }

      const presenceJson = JSON.stringify(ids);
      const result = await page.evaluate(`
        (async () => {
          try {
            const ids = ${presenceJson};
            const out = {};
            if (typeof WPP === 'undefined' || !WPP.chat) return out;
            for (const id of ids) {
              try {
                const p = await WPP.chat.getPresence(id);
                if (p) {
                  out[id] = {
                    isOnline: !!p.isOnline,
                    lastSeen: p.lastSeen ? Number(p.lastSeen) : null,
                  };
                } else {
                  out[id] = { isOnline: false, lastSeen: null };
                }
              } catch (e) {
                out[id] = { isOnline: false, lastSeen: null };
              }
            }
            return out;
          } catch (e) {
            return {};
          }
        })()
      `);

      return Response.json({ success: true, data: result || {} });
    } catch {
      return Response.json({ success: true, data: {} });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch presence' },
      { status: 500 }
    );
  }
}
