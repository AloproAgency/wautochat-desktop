import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const chatId = request.nextUrl.searchParams.get('chatId');

    if (!sessionId || !chatId) {
      return Response.json(
        { success: false, error: 'sessionId and chatId are required' },
        { status: 400 }
      );
    }

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    // Use WPPConnect's internal page to check presence
    // waPage is the Puppeteer page instance
    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (!page) {
      return Response.json({ success: true, data: { isOnline: false, lastSeen: null } });
    }

    try {
      const presence = await page.evaluate(`
        (async () => {
          try {
            // Try WPP.contact.getStatus
            if (typeof WPP !== 'undefined' && WPP.contact) {
              const presence = await WPP.chat.getPresence('${chatId}');
              if (presence) {
                return {
                  isOnline: presence.isOnline || false,
                  lastSeen: presence.lastSeen || null,
                };
              }
            }
            return { isOnline: false, lastSeen: null };
          } catch(e) {
            return { isOnline: false, lastSeen: null };
          }
        })()
      `);

      return Response.json({ success: true, data: presence });
    } catch {
      return Response.json({ success: true, data: { isOnline: false, lastSeen: null } });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get presence' },
      { status: 500 }
    );
  }
}
