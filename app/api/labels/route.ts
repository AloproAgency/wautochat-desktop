import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Label } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM labels WHERE session_id = ? ORDER BY name ASC`
    ).all(sessionId) as Record<string, unknown>[];

    const labels: Label[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      name: row.name as string,
      color: row.color as string,
      count: row.count as number,
    }));

    return Response.json({ success: true, data: labels });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list labels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, name, color } = body;

    if (!sessionId || !name) {
      return Response.json(
        { success: false, error: 'sessionId and name are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!session) {
      return Response.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if label with same name already exists
    const existing = db.prepare(
      `SELECT id FROM labels WHERE session_id = ? AND name = ?`
    ).get(sessionId, name);
    if (existing) {
      return Response.json(
        { success: false, error: 'Label with this name already exists' },
        { status: 409 }
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO labels (id, session_id, name, color, count) VALUES (?, ?, ?, ?, 0)`
    ).run(id, sessionId, name, color || '#25D366');

    const label: Label = {
      id,
      sessionId,
      name,
      color: color || '#25D366',
      count: 0,
    };

    return Response.json({ success: true, data: label }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create label' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, color, chatId, sessionId, action } = body;

    if (!id) {
      return Response.json(
        { success: false, error: 'Label id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return Response.json(
        { success: false, error: 'Label not found' },
        { status: 404 }
      );
    }

    // If assigning/removing label from chat
    if (chatId && sessionId && action) {
      const labelName = existing.name as string;

      if (action === 'assign') {
        // Find contacts in the chat and add label
        const chatRow = db.prepare(
          `SELECT wpp_id FROM chats WHERE id = ? AND session_id = ?`
        ).get(chatId, sessionId) as { wpp_id: string } | undefined;

        if (chatRow) {
          const contacts = db.prepare(
            `SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`
          ).all(sessionId, chatRow.wpp_id) as { id: string; labels: string }[];

          for (const contact of contacts) {
            const labels: string[] = JSON.parse(contact.labels || '[]');
            if (!labels.includes(labelName)) {
              labels.push(labelName);
              db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
                JSON.stringify(labels),
                contact.id
              );
              db.prepare(`UPDATE labels SET count = count + 1 WHERE id = ?`).run(id);
            }
          }
        }
      } else if (action === 'remove') {
        const chatRow = db.prepare(
          `SELECT wpp_id FROM chats WHERE id = ? AND session_id = ?`
        ).get(chatId, sessionId) as { wpp_id: string } | undefined;

        if (chatRow) {
          const contacts = db.prepare(
            `SELECT id, labels FROM contacts WHERE session_id = ? AND wpp_id = ?`
          ).all(sessionId, chatRow.wpp_id) as { id: string; labels: string }[];

          for (const contact of contacts) {
            const labels: string[] = JSON.parse(contact.labels || '[]');
            const idx = labels.indexOf(labelName);
            if (idx !== -1) {
              labels.splice(idx, 1);
              db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
                JSON.stringify(labels),
                contact.id
              );
              db.prepare(`UPDATE labels SET count = MAX(count - 1, 0) WHERE id = ?`).run(id);
            }
          }
        }
      }

      const updated = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown>;
      return Response.json({
        success: true,
        data: {
          id: updated.id as string,
          sessionId: updated.session_id as string,
          name: updated.name as string,
          color: updated.color as string,
          count: updated.count as number,
        },
      });
    }

    // Update label properties
    if (name) {
      db.prepare(`UPDATE labels SET name = ? WHERE id = ?`).run(name, id);
    }
    if (color) {
      db.prepare(`UPDATE labels SET color = ? WHERE id = ?`).run(color, id);
    }

    const updated = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown>;
    const label: Label = {
      id: updated.id as string,
      sessionId: updated.session_id as string,
      name: updated.name as string,
      color: updated.color as string,
      count: updated.count as number,
    };

    return Response.json({ success: true, data: label });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update label' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return Response.json(
        { success: false, error: 'Label id is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const existing = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return Response.json(
        { success: false, error: 'Label not found' },
        { status: 404 }
      );
    }

    const labelName = existing.name as string;
    const sessionIdVal = existing.session_id as string;

    // Remove label from all contacts that have it
    const contacts = db.prepare(
      `SELECT id, labels FROM contacts WHERE session_id = ?`
    ).all(sessionIdVal) as { id: string; labels: string }[];

    for (const contact of contacts) {
      const labels: string[] = JSON.parse(contact.labels || '[]');
      const idx = labels.indexOf(labelName);
      if (idx !== -1) {
        labels.splice(idx, 1);
        db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(
          JSON.stringify(labels),
          contact.id
        );
      }
    }

    db.prepare(`DELETE FROM labels WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete label' },
      { status: 500 }
    );
  }
}
