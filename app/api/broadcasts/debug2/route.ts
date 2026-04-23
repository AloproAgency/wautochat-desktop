import { NextRequest } from 'next/server';
import manager from '@/lib/wppconnect-manager';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return Response.json({ error: 'sessionId required' });

  const client = manager.getClient(sessionId);
  if (!client) return Response.json({ error: 'not connected' });

  const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
  if (!page) return Response.json({ error: 'no page' });

  const debug = await page.evaluate(`
    (async () => {
      const info = {};

      // Check WPP.chat methods related to broadcast
      if (typeof WPP !== 'undefined' && WPP.chat) {
        info.chatMethods = Object.keys(WPP.chat).filter(k =>
          k.toLowerCase().includes('broadcast') ||
          k.toLowerCase().includes('send')
        );
      }

      // Check if sendBroadcast or similar exists
      if (WPP.chat.sendBroadcast) info.hasSendBroadcast = true;
      if (WPP.chat.createBroadcastList) info.hasCreateBroadcastList = true;

      // Check Store methods
      if (window.Store) {
        const methods = Object.keys(window.Store).filter(k =>
          k.toLowerCase().includes('broadcast') ||
          k.toLowerCase().includes('sendbroadcast')
        );
        info.storeBroadcastKeys = methods;

        // Check if there's a createBroadcast function
        if (window.Store.BroadcastActions) {
          info.broadcastActionsKeys = Object.keys(window.Store.BroadcastActions);
        }
        if (window.Store.createBroadcastList) info.hasStoreCreate = true;
      }

      // Check WPP top level
      if (typeof WPP !== 'undefined') {
        info.wppTopKeys = Object.keys(WPP).filter(k =>
          k.toLowerCase().includes('broadcast')
        );
      }

      return info;
    })()
  `);

  return Response.json({ success: true, data: debug });
}
