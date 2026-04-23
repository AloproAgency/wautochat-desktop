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

      if (window.Store && window.Store.Chat) {
        const allChats = window.Store.Chat.getModelsArray
          ? window.Store.Chat.getModelsArray()
          : (window.Store.Chat._models || []);

        const broadcastChats = allChats.filter(c => {
          const id = c.id ? (c.id._serialized || String(c.id)) : '';
          return id.includes('@broadcast') && id !== 'status@broadcast';
        });

        if (broadcastChats.length > 0) {
          const bc = broadcastChats[0];
          const bm = bc.__x_broadcastMetadata;

          // Try to force load the metadata
          if (bm && bm.update) {
            try { await bm.update(); } catch(e) {}
          }
          if (bm && bm.queryBroadcastList) {
            try { await bm.queryBroadcastList(); } catch(e) {}
          }

          // After force load, check recipients again
          if (bm && bm.recipients) {
            const r = bm.recipients;
            if (r.getModelsArray) {
              info.recipientsAfterLoad = r.getModelsArray().map(m => m.id ? (m.id._serialized || String(m.id)) : '');
            } else if (r._models) {
              info.recipientsAfterLoad = r._models.map(m => m.id ? (m.id._serialized || String(m.id)) : '');
            }
          }

          // Check audienceExpression after load
          if (bm && bm.__x_audienceExpression && bm.__x_audienceExpression.userJids) {
            info.userJidsAfterLoad = bm.__x_audienceExpression.userJids.map(j => j._serialized || String(j));
          }

          // Try WPP.chat.getMessages to find recipients from actual messages
          try {
            const bcId = bc.id._serialized;
            const msgs = await WPP.chat.getMessages(bcId, { count: 10 });
            if (msgs && msgs.length > 0) {
              info.wppMsgCount = msgs.length;
              // Check each message for recipients field
              for (const msg of msgs) {
                const keys = Object.keys(msg);
                const recipientKeys = keys.filter(k => k.toLowerCase().includes('recipient') || k.toLowerCase().includes('broadcast'));
                info.msgRecipientKeys = recipientKeys;
                if (msg.recipients && msg.recipients.length > 0) {
                  info.foundRecipients = msg.recipients.map(r => r._serialized || String(r));
                  break;
                }
              }
              // Show first msg structure
              if (msgs.length > 0) {
                info.firstMsgSample = {
                  id: msgs[0].id ? (msgs[0].id._serialized || '') : '',
                  type: msgs[0].type || '',
                  from: msgs[0].from ? (msgs[0].from._serialized || '') : '',
                  to: msgs[0].to ? (msgs[0].to._serialized || '') : '',
                  body: (msgs[0].body || '').substring(0, 50),
                };
              }
            }
          } catch(e) { info.wppMsgError = e.message; }

          // Last resort: check Store.BroadcastList or similar
          const storeKeys = Object.keys(window.Store).filter(k =>
            k.toLowerCase().includes('broadcast')
          );
          info.broadcastStoreKeys = storeKeys;
          for (const key of storeKeys) {
            try {
              const store = window.Store[key];
              if (store && store.getModelsArray) {
                const models = store.getModelsArray();
                info['store_' + key] = models.length;
                if (models.length > 0) {
                  info['store_' + key + '_sample'] = Object.keys(models[0]).slice(0, 15);
                }
              }
            } catch(e) {}
          }
        }
      }

      return info;
    })()
  `);

  return Response.json({ success: true, data: debug });
}
