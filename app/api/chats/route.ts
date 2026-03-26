import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    let rows;
    if (sessionId) {
      rows = db.prepare(
        `SELECT c.*, m.body as last_message_body, m.type as last_message_type, m.from_me as last_message_from_me, m.timestamp as last_message_time
         FROM chats c
         LEFT JOIN messages m ON m.id = c.last_message_id
         WHERE c.session_id = ?
         ORDER BY c.updated_at DESC`
      ).all(sessionId);
    } else {
      rows = db.prepare(
        `SELECT c.*, m.body as last_message_body, m.type as last_message_type, m.from_me as last_message_from_me, m.timestamp as last_message_time
         FROM chats c
         LEFT JOIN messages m ON m.id = c.last_message_id
         ORDER BY c.updated_at DESC`
      ).all();
    }

    const chats = (rows as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      wppId: row.wpp_id as string,
      name: (row.name as string) || (row.wpp_id as string),
      isGroup: Boolean(row.is_group),
      unreadCount: (row.unread_count as number) || 0,
      lastMessage: row.last_message_body ? {
        body: row.last_message_body as string,
        type: row.last_message_type as string,
        fromMe: Boolean(row.last_message_from_me),
        timestamp: row.last_message_time as string,
      } : undefined,
      profilePicUrl: (row.profile_pic_url as string) || undefined,
      isArchived: Boolean(row.is_archived),
      isPinned: Boolean(row.is_pinned),
      isMuted: Boolean(row.is_muted),
      updatedAt: row.updated_at as string,
    }));

    return Response.json({ success: true, data: chats });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list chats' },
      { status: 500 }
    );
  }
}
