import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

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
