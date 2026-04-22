import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    const db = getDb();
    const label = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!label) {
      return Response.json({ success: false, error: 'Label not found' }, { status: 404 });
    }

    const labelName = label.name as string;
    const sid = sessionId || (label.session_id as string);

    // Find contacts with this label, collect their wppIds
    const allContacts = db.prepare(
      `SELECT wpp_id, labels FROM contacts WHERE session_id = ?`
    ).all(sid) as { wpp_id: string; labels: string }[];

    const matchingWppIds = allContacts
      .filter((c) => {
        const labels: string[] = JSON.parse(c.labels || '[]');
        return labels.includes(labelName);
      })
      .map((c) => c.wpp_id);

    // Also derive @c.us versions from phone numbers
    const allWppIds = new Set<string>();
    for (const wppId of matchingWppIds) {
      allWppIds.add(wppId);
      // If @lid, also try phone@c.us
      if (wppId.includes('@lid')) {
        const phone = wppId.replace(/@.*$/, '');
        allWppIds.add(`${phone}@c.us`);
      }
    }

    if (allWppIds.size === 0) {
      return Response.json({ success: true, data: [] });
    }

    const ids = Array.from(allWppIds);
    const placeholders = ids.map(() => '?').join(',');
    const chats = db.prepare(
      `SELECT * FROM chats WHERE session_id = ? AND wpp_id IN (${placeholders})`
    ).all(sid, ...ids) as Record<string, unknown>[];

    const result = chats.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      wppId: row.wpp_id as string,
      name: (row.name as string) || (row.wpp_id as string),
      isGroup: !!(row.is_group),
      unreadCount: (row.unread_count as number) || 0,
      profilePicUrl: (row.profile_pic_url as string) || undefined,
      isArchived: !!(row.is_archived),
      isPinned: !!(row.is_pinned),
      isMuted: !!(row.is_muted),
      updatedAt: row.updated_at as string,
    }));

    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get label chats' },
      { status: 500 }
    );
  }
}
