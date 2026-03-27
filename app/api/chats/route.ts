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
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const updateStmt = db.prepare(
      `UPDATE chats SET name = CASE WHEN name = wpp_id THEN ? ELSE name END, unread_count = ?, updated_at = datetime('now') WHERE session_id = ? AND wpp_id = ?`
    );

    const transaction = db.transaction(() => {
      for (const chat of wppChats) {
        const c = chat as unknown as Record<string, unknown>;
        const wppId = (c.id as Record<string, unknown>)?._serialized as string || (c.id as string) || '';

        if (!wppId || wppId === 'status@broadcast') continue;

        const isGroup = !!(c.isGroup);
        const name = (c.contact as Record<string, unknown>)?.name as string
          || (c.contact as Record<string, unknown>)?.pushname as string
          || (c.name as string)
          || wppId;
        const unreadCount = (c.unreadCount as number) || 0;

        // Try insert (won't overwrite existing)
        const result = insertStmt.run(uuidv4(), sessionId, wppId, name, isGroup ? 1 : 0, unreadCount);
        if (result.changes === 0) {
          // Already exists, update name if it was just the wppId and update unread count
          updateStmt.run(name, unreadCount, sessionId, wppId);
        }
        synced++;
      }
    });

    transaction();

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
