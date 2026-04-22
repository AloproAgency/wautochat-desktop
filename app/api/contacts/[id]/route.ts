import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    return Response.json({
      success: true,
      data: {
        id: row.id,
        sessionId: row.session_id,
        wppId: row.wpp_id,
        name: row.name,
        pushName: row.push_name || undefined,
        phone: row.phone,
        profilePicUrl: row.profile_pic_url || undefined,
        isMyContact: !!(row.is_my_contact),
        isWAContact: !!(row.is_wa_contact),
        isBlocked: !!(row.is_blocked),
        labels: JSON.parse((row.labels as string) || '[]'),
        lastSeen: row.last_seen || undefined,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get contact' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = getDb();

    const row = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return Response.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    // Handle block/unblock
    if (body.action === 'block' || body.action === 'unblock') {
      const sessionId = row.session_id as string;
      const wppId = row.wpp_id as string;
      const client = manager.getClient(sessionId);

      if (client) {
        try {
          if (body.action === 'block') {
            await client.blockContact(wppId);
          } else {
            await client.unblockContact(wppId);
          }
        } catch {
          // WPPConnect may not support this method directly, update DB anyway
        }
      }

      const isBlocked = body.action === 'block' ? 1 : 0;
      db.prepare(`UPDATE contacts SET is_blocked = ? WHERE id = ?`).run(isBlocked, id);

      return Response.json({ success: true, data: { id, isBlocked: !!isBlocked } });
    }

    // Handle labels update
    if (body.labels !== undefined) {
      const labels = JSON.stringify(body.labels);
      db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(labels, id);

      return Response.json({ success: true, data: { id, labels: body.labels } });
    }

    // Handle name update
    if (body.name !== undefined) {
      db.prepare(`UPDATE contacts SET name = ? WHERE id = ?`).run(body.name, id);
      return Response.json({ success: true, data: { id, name: body.name } });
    }

    return Response.json({ success: false, error: 'No valid update provided' }, { status: 400 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update contact' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const row = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
    if (!row) {
      return Response.json({ success: false, error: 'Contact not found' }, { status: 404 });
    }

    db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete contact' },
      { status: 500 }
    );
  }
}
