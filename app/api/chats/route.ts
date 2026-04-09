import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    // Get chats with their latest message (using subquery for reliability)
    const baseQuery = `
      SELECT c.*,
        lm.body as last_message_body,
        lm.type as last_message_type,
        lm.from_me as last_message_from_me,
        lm.timestamp as last_message_time,
        lm.sender_name as last_message_sender,
        (SELECT COUNT(*) FROM messages WHERE chat_id = c.id) as message_count
      FROM chats c
      LEFT JOIN (
        SELECT m1.* FROM messages m1
        INNER JOIN (
          SELECT chat_id, MAX(timestamp) as max_ts FROM messages GROUP BY chat_id
        ) m2 ON m1.chat_id = m2.chat_id AND m1.timestamp = m2.max_ts
      ) lm ON lm.chat_id = c.id
    `;

    let rows;
    if (sessionId) {
      rows = db.prepare(`${baseQuery} WHERE c.session_id = ? ORDER BY COALESCE(lm.timestamp, c.updated_at) DESC`).all(sessionId);
    } else {
      rows = db.prepare(`${baseQuery} ORDER BY COALESCE(lm.timestamp, c.updated_at) DESC`).all();
    }

    const chats = (rows as Record<string, unknown>[]).map((row) => {
      const lastBody = row.last_message_body as string | null;
      // Detect base64/media content and show friendly label
      let displayBody = lastBody || '';
      if (displayBody.length > 200 || displayBody.startsWith('/9j/') || displayBody.startsWith('data:')) {
        displayBody = 'Media';
      }

      return {
        id: row.id as string,
        sessionId: row.session_id as string,
        wppId: row.wpp_id as string,
        name: (row.name as string) || (row.wpp_id as string),
        isGroup: Boolean(row.is_group),
        unreadCount: (row.unread_count as number) || 0,
        messageCount: (row.message_count as number) || 0,
        lastMessage: lastBody ? {
          body: displayBody,
          type: (row.last_message_type as string) || 'text',
          fromMe: Boolean(row.last_message_from_me),
          timestamp: row.last_message_time as string,
          senderName: (row.last_message_sender as string) || undefined,
        } : undefined,
        profilePicUrl: (row.profile_pic_url as string) || undefined,
        isArchived: Boolean(row.is_archived),
        isPinned: Boolean(row.is_pinned),
        isMuted: Boolean(row.is_muted),
        updatedAt: row.updated_at as string,
      };
    });

    return Response.json({ success: true, data: chats });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list chats' },
      { status: 500 }
    );
  }
}

// POST: Sync all chats from WhatsApp into the database
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

    let client = manager.getClient(sessionId);
    if (!client) {
      try {
        await manager.reconnectSession(sessionId);
        client = manager.getClient(sessionId);
      } catch { /* ignore */ }
    }
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    // Fetch all chats from WhatsApp
    const wppChats = await client.getAllChats();
    const db = getDb();

    let synced = 0;

    const insertStmt = db.prepare(
      `INSERT OR IGNORE INTO chats (id, session_id, wpp_id, name, is_group, unread_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const updateStmt = db.prepare(
      `UPDATE chats SET name = ?, unread_count = ?, updated_at = ? WHERE session_id = ? AND wpp_id = ?`
    );

    // Also insert last message for preview
    const upsertLastMsg = db.prepare(
      `INSERT OR REPLACE INTO messages (id, session_id, chat_id, wpp_id, type, body, sender, sender_name, from_me, timestamp, status, is_forwarded)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'delivered', 0)`
    );

    // Sort wppChats by timestamp descending so we know the order
    const sortedChats = [...wppChats].sort((a, b) => {
      const aChat = a as unknown as Record<string, unknown>;
      const bChat = b as unknown as Record<string, unknown>;
      const aT = (aChat.t as number) || (aChat.timestamp as number) || 0;
      const bT = (bChat.t as number) || (bChat.timestamp as number) || 0;
      return bT - aT;
    });

    const transaction = db.transaction(() => {
      // Use rank to ensure unique timestamps even if chat.t is missing
      let rank = sortedChats.length;
      for (const chat of sortedChats) {
        const c = chat as unknown as Record<string, unknown>;
        const wppId = (c.id as Record<string, unknown>)?._serialized as string || (c.id as string) || '';

        if (!wppId || wppId === 'status@broadcast') continue;

        const isGroup = !!(c.isGroup);
        const name = (c.contact as Record<string, unknown>)?.name as string
          || (c.contact as Record<string, unknown>)?.pushname as string
          || (c.name as string)
          || wppId;
        const unreadCount = (c.unreadCount as number) || 0;

        // Get the real timestamp from WhatsApp
        const lastMsgTimestamp = (c.t as number) || (c.timestamp as number) || 0;
        let updatedAt: string;
        if (lastMsgTimestamp > 0) {
          updatedAt = new Date(lastMsgTimestamp * 1000).toISOString();
        } else {
          // No timestamp - use rank to maintain WhatsApp's original order
          updatedAt = new Date(Date.now() - rank * 1000).toISOString();
        }

        // Try insert first
        const chatUuid = uuidv4();
        const result = insertStmt.run(chatUuid, sessionId, wppId, name, isGroup ? 1 : 0, unreadCount, updatedAt);
        if (result.changes === 0) {
          // Already exists - always update name, unread and timestamp
          updateStmt.run(name, unreadCount, updatedAt, sessionId, wppId);
        }

        synced++;
        rank--;
      }
    });

    transaction();

    // Fetch last message previews from WhatsApp browser
    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (page) {
      try {
        const previews = await page.evaluate(`
          (async () => {
            try {
              if (!window.Store || !window.Store.Chat) return [];
              const chats = window.Store.Chat.getModelsArray
                ? window.Store.Chat.getModelsArray()
                : (window.Store.Chat._models || []);

              return chats.slice(0, 100).map(c => {
                const id = c.id ? (c.id._serialized || '') : '';
                let body = '';
                let fromMe = false;
                let type = 'text';

                // Get last message from msgs collection
                if (c.msgs && c.msgs._models && c.msgs._models.length > 0) {
                  const last = c.msgs._models[c.msgs._models.length - 1];
                  body = last.__x_body || last.body || '';
                  fromMe = !!(last.__x_isFromMe || last.fromMe);
                  type = last.__x_type || last.type || 'chat';
                  if (type === 'chat') type = 'text';
                }

                if (!body) return null;
                return { id, body: body.substring(0, 100), fromMe, type };
              }).filter(Boolean);
            } catch(e) { return []; }
          })()
        `) as { id: string; body: string; fromMe: boolean; type: string }[] | null;

        if (previews && previews.length > 0) {
          for (const preview of previews) {
            if (!preview.id || !preview.body) continue;
            const chatRow = db.prepare(
              `SELECT id FROM chats WHERE session_id = ? AND wpp_id = ?`
            ).get(sessionId, preview.id) as { id: string } | undefined;
            if (!chatRow) continue;

            // Only insert if no messages exist for this chat
            const msgExists = db.prepare(
              `SELECT id FROM messages WHERE chat_id = ? AND session_id = ? LIMIT 1`
            ).get(chatRow.id, sessionId);
            if (!msgExists) {
              upsertLastMsg.run(
                uuidv4(), sessionId, chatRow.id, '',
                preview.type, preview.body, preview.fromMe ? 'me' : preview.id,
                '', preview.fromMe ? 1 : 0,
                db.prepare(`SELECT updated_at FROM chats WHERE id = ?`).get(chatRow.id)
                  ? (db.prepare(`SELECT updated_at FROM chats WHERE id = ?`).get(chatRow.id) as { updated_at: string }).updated_at
                  : new Date().toISOString()
              );
            }
          }
        }
      } catch {
        // Preview fetch failed, not critical
      }
    }

    // Fetch profile pics in background for chats without one
    const chatsWithoutPic = db.prepare(
      `SELECT id, wpp_id FROM chats WHERE session_id = ? AND (profile_pic_url IS NULL OR profile_pic_url = '')`
    ).all(sessionId) as { id: string; wpp_id: string }[];

    if (chatsWithoutPic.length > 0 && client) {
      const capturedClient = client;
      const capturedDb = db;
      (async () => {
        const BATCH = 5;
        for (let i = 0; i < chatsWithoutPic.length; i += BATCH) {
          const batch = chatsWithoutPic.slice(i, i + BATCH);
          await Promise.allSettled(
            batch.map(async (row) => {
              try {
                const pic = await capturedClient.getProfilePicFromServer(row.wpp_id);
                const picAny = pic as unknown;
                let picUrl = '';
                if (typeof picAny === 'string' && picAny.startsWith('http')) picUrl = picAny;
                else if (picAny && typeof picAny === 'object') {
                  const picObj = picAny as Record<string, unknown>;
                  picUrl = (picObj.eurl as string) || (picObj.imgFull as string) || '';
                }
                if (picUrl) {
                  capturedDb.prepare(`UPDATE chats SET profile_pic_url = ? WHERE id = ?`).run(picUrl, row.id);
                }
              } catch { /* privacy or no pic */ }
            })
          );
        }
      })();
    }

    return Response.json({
      success: true,
      data: { synced, message: `${synced} chats synced` },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync chats' },
      { status: 500 }
    );
  }
}
