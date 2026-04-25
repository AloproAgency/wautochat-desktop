import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

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
      return Response.json({ success: true, data: { synced: 0, message: 'No browser page available' } });
    }

    // Use Store.Label directly to get labels WITH their labelItemCollection
    const syncData = await page.evaluate(`
      (async () => {
        try {
          const results = [];

          // Use Store.Label which has labelItemCollection with chat associations
          if (window.Store && window.Store.Label) {
            const models = window.Store.Label.getModelsArray
              ? window.Store.Label.getModelsArray()
              : (window.Store.Label._models || []);

            for (const label of models) {
              const chatIds = [];

              // labelItemCollection contains the associated chats
              if (label.labelItemCollection) {
                const items = label.labelItemCollection.getModelsArray
                  ? label.labelItemCollection.getModelsArray()
                  : (label.labelItemCollection._models || []);

                for (const item of items) {
                  // Item id is the chat wppId
                  let chatId = '';
                  if (item.id && item.id._serialized) chatId = item.id._serialized;
                  else if (item.id) chatId = String(item.id);
                  else if (item.__x_id && item.__x_id._serialized) chatId = item.__x_id._serialized;
                  else if (item.__x_id) chatId = String(item.__x_id);

                  if (chatId) chatIds.push(chatId);
                }
              }

              results.push({
                id: String(label.__x_id || label.id || ''),
                name: String(label.__x_name || label.name || ''),
                hexColor: String(label.hexColor || ''),
                colorIndex: Number(label.__x_colorIndex || label.colorIndex || 0),
                count: Number(label.__x_count || label.count || 0),
                chatIds: chatIds.map(c => String(c)),
              });
            }
          }

          return results;
        } catch(e) {
          return [];
        }
      })()
    `) as { id: string; name: string; hexColor: string; colorIndex: number; count: number; chatIds: string[] }[] | null;

    const labels = syncData || [];

    console.log('[labels-sync] Labels:', labels.length);
    for (const l of labels) {
      console.log(`[labels-sync] "${l.name}" (id:${l.id}) -> ${l.chatIds.length} chats:`, JSON.stringify(l.chatIds));
    }

    if (labels.length === 0) {
      return Response.json({
        success: true,
        data: { synced: 0, associations: 0, message: 'No labels found' },
      });
    }

    const db = getDb();
    let synced = 0;
    let totalAssociations = 0;

    const WA_COLORS: Record<string, string> = {
      '0': '#00a0f2', '1': '#64C4FF', '2': '#FFD429', '3': '#FF9485',
      '4': '#DFAEF0', '5': '#55CCB3', '6': '#FFC5C7', '7': '#93CEAC',
      '8': '#9BA6FF', '9': '#075E54', '10': '#25D366', '11': '#34B7F1',
    };

    const transaction = db.transaction(() => {
      for (const l of labels) {
        const name = l.name;
        if (!name) continue;

        const color = l.hexColor || WA_COLORS[String(l.colorIndex)] || '#25D366';
        const count = l.chatIds.length || l.count || 0;

        // Upsert label — capture WhatsApp's id so we can mutate it later
        // (addOrRemoveLabels, deleteLabel) without re-syncing.
        const existing = db.prepare(
          `SELECT id FROM labels WHERE session_id = ? AND name = ?`
        ).get(sessionId, name) as { id: string } | undefined;

        if (!existing) {
          db.prepare(
            `INSERT INTO labels (id, session_id, name, color, count, wpp_id) VALUES (?, ?, ?, ?, ?, ?)`
          ).run(uuidv4(), sessionId, name, color, count, l.id || null);
          synced++;
        } else {
          db.prepare(
            `UPDATE labels SET color = ?, count = ?, wpp_id = ? WHERE id = ?`
          ).run(color, count, l.id || null, existing.id);
        }

        // Assign label to contacts matching the chatIds
        for (const chatWppId of l.chatIds) {
          if (!chatWppId || typeof chatWppId !== 'string' || chatWppId.length < 3) continue;
          totalAssociations++;

          try {
            // Search contacts by wppId, phone, or partial match
            const phone = chatWppId.replace(/@.*$/, '');
            const contacts = db.prepare(
              `SELECT id, labels FROM contacts WHERE session_id = ? AND (wpp_id = ? OR phone = ? OR wpp_id LIKE ?)`
            ).all(sessionId, chatWppId, phone, `${phone}@%`) as { id: string; labels: string }[];

            for (const contact of contacts) {
              const contactLabels: string[] = JSON.parse(contact.labels || '[]');
              if (!contactLabels.includes(name)) {
                contactLabels.push(name);
                db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
                  JSON.stringify(contactLabels),
                  contact.id
                );
              }
            }
          } catch (err) {
            console.error(`[labels-sync] Error assigning label "${name}" to ${chatWppId}:`, err);
          }
        }
      }
    });

    transaction();

    return Response.json({
      success: true,
      data: {
        synced,
        associations: totalAssociations,
        message: `${labels.length} labels updated, ${totalAssociations} associations found`,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync labels' },
      { status: 500 }
    );
  }
}
