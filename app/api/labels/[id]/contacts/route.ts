import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Contact } from '@/lib/types';

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

    // Find all contacts that have this label name in their labels JSON array
    const allContacts = db.prepare(
      `SELECT * FROM contacts WHERE session_id = ?`
    ).all(sid) as Record<string, unknown>[];

    const contacts: Contact[] = allContacts
      .filter((row) => {
        const labels: string[] = JSON.parse((row.labels as string) || '[]');
        return labels.includes(labelName);
      })
      .map((row) => ({
        id: row.id as string,
        sessionId: row.session_id as string,
        wppId: row.wpp_id as string,
        name: row.name as string,
        pushName: (row.push_name as string) || undefined,
        phone: row.phone as string,
        profilePicUrl: (row.profile_pic_url as string) || undefined,
        isMyContact: !!(row.is_my_contact),
        isWAContact: !!(row.is_wa_contact),
        isBlocked: !!(row.is_blocked),
        labels: JSON.parse((row.labels as string) || '[]'),
        lastSeen: (row.last_seen as string) || undefined,
        createdAt: row.created_at as string,
      }));

    return Response.json({ success: true, data: contacts });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get label contacts' },
      { status: 500 }
    );
  }
}
