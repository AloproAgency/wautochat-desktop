import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import type { Label } from '@/lib/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json({ success: false, error: 'Label not found' }, { status: 404 });
    }

    return Response.json({
      success: true,
      data: {
        id: row.id as string,
        sessionId: row.session_id as string,
        name: row.name as string,
        color: row.color as string,
        count: row.count as number,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get label' },
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
    const { name, color } = body;

    const db = getDb();
    const existing = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      return Response.json({ success: false, error: 'Label not found' }, { status: 404 });
    }

    if (name) {
      // Rename label in all contacts that have the old name
      const oldName = existing.name as string;
      const sessionId = existing.session_id as string;
      const contacts = db.prepare(
        `SELECT id, labels FROM contacts WHERE session_id = ?`
      ).all(sessionId) as { id: string; labels: string }[];

      for (const contact of contacts) {
        const labels: string[] = JSON.parse(contact.labels || '[]');
        const idx = labels.indexOf(oldName);
        if (idx !== -1) {
          labels[idx] = name;
          db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(JSON.stringify(labels), contact.id);
        }
      }

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const existing = db.prepare(`SELECT * FROM labels WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return Response.json({ success: false, error: 'Label not found' }, { status: 404 });
    }

    const labelName = existing.name as string;
    const sessionId = existing.session_id as string;

    // Remove label from all contacts
    const contacts = db.prepare(
      `SELECT id, labels FROM contacts WHERE session_id = ?`
    ).all(sessionId) as { id: string; labels: string }[];

    for (const contact of contacts) {
      const labels: string[] = JSON.parse(contact.labels || '[]');
      const idx = labels.indexOf(labelName);
      if (idx !== -1) {
        labels.splice(idx, 1);
        db.prepare(`UPDATE contacts SET labels = ? WHERE id = ?`).run(JSON.stringify(labels), contact.id);
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
