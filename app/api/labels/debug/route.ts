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

      // Check WPP.labels methods
      if (typeof WPP !== 'undefined' && WPP.labels) {
        info.wppLabelMethods = Object.keys(WPP.labels);

        // Get first label and inspect its full structure
        try {
          const labels = await WPP.labels.getAllLabels();
          info.labelCount = labels ? labels.length : 0;
          if (labels && labels.length > 0) {
            const first = labels[0];
            info.firstLabelKeys = Object.keys(first);
            info.firstLabel = {
              id: first.id,
              name: first.name,
              color: first.color,
              hexColor: first.hexColor,
              colorIndex: first.colorIndex,
              count: first.count,
            };

            // Check if label has items/chats/collection
            if (first.labelItemCollection) {
              const items = first.labelItemCollection.getModelsArray
                ? first.labelItemCollection.getModelsArray()
                : (first.labelItemCollection._models || []);
              info.firstLabelItems = items.length;
              if (items.length > 0) {
                info.firstItemKeys = Object.keys(items[0]);
                info.firstItem = JSON.parse(JSON.stringify(items[0], (key, val) => {
                  if (key === 'parent' || key === 'collection') return undefined;
                  return val;
                }));
              }
            }
          }
        } catch(e) { info.labelError = e.message; }

        // Try getChatsByLabelId with first label
        try {
          const labels = await WPP.labels.getAllLabels();
          if (labels && labels.length > 0) {
            for (const method of ['getChatsByLabelId', 'getLabelById', 'getChatsForLabel']) {
              if (WPP.labels[method]) {
                try {
                  const result = await WPP.labels[method](labels[0].id);
                  info['result_' + method] = {
                    type: typeof result,
                    isArray: Array.isArray(result),
                    length: result ? (result.length || Object.keys(result).length) : 0,
                    keys: result ? Object.keys(result).slice(0, 15) : [],
                  };
                } catch(e) { info['error_' + method] = e.message; }
              }
            }
          }
        } catch(e) {}
      }

      // Check Store
      if (window.Store) {
        const labelStores = Object.keys(window.Store).filter(k =>
          k.toLowerCase().includes('label')
        );
        info.storeLabels = labelStores;

        for (const key of labelStores) {
          try {
            const store = window.Store[key];
            const models = store.getModelsArray ? store.getModelsArray() : (store._models || []);
            info['store_' + key + '_count'] = Array.isArray(models) ? models.length : 'not array';
            if (Array.isArray(models) && models.length > 0) {
              info['store_' + key + '_keys'] = Object.keys(models[0]).slice(0, 20);
            }
          } catch(e) {}
        }
      }

      return info;
    })()
  `);

  return Response.json({ success: true, data: debug });
}
