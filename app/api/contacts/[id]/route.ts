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

      if (!client) {
        return Response.json(
          { success: false, error: 'Session is not connected' },
          { status: 400 }
        );
      }

      try {
        if (body.action === 'block') {
          await client.blockContact(wppId);
        } else {
          await client.unblockContact(wppId);
        }
      } catch (err) {
        // Don't update DB if WhatsApp rejected the call — otherwise the UI
        // claims "blocked" while the contact can still send messages.
        return Response.json(
          { success: false, error: err instanceof Error ? err.message : 'WhatsApp rejected the block' },
          { status: 502 }
        );
      }

      const isBlocked = body.action === 'block' ? 1 : 0;
      db.prepare(`UPDATE contacts SET is_blocked = ? WHERE id = ?`).run(isBlocked, id);

      return Response.json({ success: true, data: { id, isBlocked: !!isBlocked } });
    }

    // Handle labels update — diff against current state and push add/remove
    // to WhatsApp so the labels show up on the phone too.
    if (body.labels !== undefined) {
      const sessionId = row.session_id as string;
      const wppId = row.wpp_id as string;
      const previous: string[] = JSON.parse((row.labels as string) || '[]');
      const next: string[] = Array.isArray(body.labels) ? body.labels.map(String) : [];

      const toAdd = next.filter((n) => !previous.includes(n));
      const toRemove = previous.filter((p) => !next.includes(p));

      if ((toAdd.length || toRemove.length) && wppId) {
        const client = manager.getClient(sessionId);
        if (client) {
          // Resolve label names → WhatsApp wpp_id (only labels we know).
          const placeholders = [...toAdd, ...toRemove].map(() => '?').join(',');
          const labelRows = placeholders
            ? db.prepare(
                `SELECT name, wpp_id FROM labels WHERE session_id = ? AND wpp_id IS NOT NULL AND name IN (${placeholders})`
              ).all(sessionId, ...toAdd, ...toRemove) as { name: string; wpp_id: string }[]
            : [];
          const wppByName = new Map(labelRows.map((r) => [r.name, r.wpp_id]));
          const ops: { labelId: string; type: 'add' | 'remove' }[] = [];
          for (const n of toAdd) {
            const w = wppByName.get(n);
            if (w) ops.push({ labelId: w, type: 'add' });
          }
          for (const n of toRemove) {
            const w = wppByName.get(n);
            if (w) ops.push({ labelId: w, type: 'remove' });
          }
          if (ops.length) {
            try {
              await (client as unknown as {
                addOrRemoveLabels: (chatId: string | string[], opts: { labelId: string; type: 'add' | 'remove' }[]) => Promise<void>;
              }).addOrRemoveLabels(wppId, ops);
            } catch (err) {
              console.error(`[contacts PUT] WhatsApp label sync failed for ${wppId}:`, err);
            }
          }
        }
      }

      const labels = JSON.stringify(next);
      db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(labels, id);

      return Response.json({ success: true, data: { id, labels: next } });
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
