import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
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

    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (!page) {
      return Response.json({ success: true, data: [] });
    }

    try {
      const statuses = await page.evaluate(`
        (async () => {
          try {
            if (typeof WPP === 'undefined' || !WPP.status) return [];

            const unread = await WPP.status.getUnreadStatuses();

            return unread.map(s => {
              const contact = s.contact || {};
              return {
                id: contact.id ? (contact.id._serialized || contact.id) : '',
                name: contact.pushname || contact.name || contact.shortName || '',
                profilePicUrl: contact.profilePicThumb ? (contact.profilePicThumb.eurl || '') : '',
                totalCount: s.totalCount || 1,
              };
            }).filter(s => s.id && s.id !== 'status@broadcast');
          } catch(e) {
            return [];
          }
        })()
      `);

      return Response.json({ success: true, data: statuses || [] });
    } catch {
      return Response.json({ success: true, data: [] });
    }
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get statuses' },
      { status: 500 }
    );
  }
}
