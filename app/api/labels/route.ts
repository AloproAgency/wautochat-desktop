import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Label } from '@/lib/types';

// Map our hex color to a WhatsApp colorIndex. WA accepts only its 12 preset
// colors; anything else falls back to green (10).
const WA_COLOR_TO_INDEX: Record<string, number> = {
  '#00a0f2': 0, '#64C4FF': 1, '#FFD429': 2, '#FF9485': 3,
  '#DFAEF0': 4, '#55CCB3': 5, '#FFC5C7': 6, '#93CEAC': 7,
  '#9BA6FF': 8, '#075E54': 9, '#25D366': 10, '#34B7F1': 11,
};

// After client.addNewLabel(name) we don't get the new id back — fetch the
// full label list and find the freshly created one by name. Returns null
// when WhatsApp doesn't return a usable id.
async function fetchLabelWppId(client: ReturnType<typeof manager.getClient>, name: string): Promise<string | null> {
  if (!client) return null;
  try {
    const labels = await (client as unknown as { getAllLabels: () => Promise<Array<{ id: string | number; name: string }>> }).getAllLabels();
    if (!Array.isArray(labels)) return null;
    const match = labels.find((l) => String(l.name) === name);
    return match ? String(match.id) : null;
  } catch {
    return null;
  }
}

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

    const finalColor = color || '#25D366';
    const id = uuidv4();

    // Push to WhatsApp first — if it fails we still want to create the label
    // locally so the user has somewhere to manage it (with a hint to retry).
    let wppId: string | null = null;
    let wppPushError: string | null = null;
    const client = manager.getClient(sessionId);
    if (client) {
      try {
        const colorIndex = WA_COLOR_TO_INDEX[finalColor.toLowerCase()] ?? WA_COLOR_TO_INDEX[finalColor.toUpperCase()] ?? 10;
        // wppconnect typing says options is a string but the runtime accepts
        // either a hex string or an object — pass the documented hex form.
        await (client as unknown as { addNewLabel: (n: string, opts?: unknown) => Promise<void> })
          .addNewLabel(name, { labelColor: colorIndex } as unknown as string);
        wppId = await fetchLabelWppId(client, name);
      } catch (err) {
        wppPushError = err instanceof Error ? err.message : 'Failed to push label to WhatsApp';
        console.error('[labels POST] WhatsApp push failed:', wppPushError);
      }
    } else {
      wppPushError = 'Session not connected — label saved locally only';
    }

    db.prepare(
      `INSERT INTO labels (id, session_id, name, color, count, wpp_id) VALUES (?, ?, ?, ?, 0, ?)`
    ).run(id, sessionId, name, finalColor, wppId);

    const label: Label = {
      id,
      sessionId,
      name,
      color: finalColor,
      count: 0,
    };

    return Response.json({
      success: true,
      data: label,
      ...(wppPushError ? { warning: wppPushError } : {}),
    }, { status: 201 });
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
      const labelWppId = (existing.wpp_id as string) || null;

      const chatRow = db.prepare(
        `SELECT wpp_id FROM chats WHERE id = ? AND session_id = ?`
      ).get(chatId, sessionId) as { wpp_id: string } | undefined;

      // Push the change to WhatsApp first so the label appears on phone too.
      if (chatRow && labelWppId) {
        const client = manager.getClient(sessionId);
        if (client) {
          try {
            await (client as unknown as {
              addOrRemoveLabels: (chatIds: string | string[], opts: { labelId: string; type: 'add' | 'remove' }[]) => Promise<void>;
            }).addOrRemoveLabels(chatRow.wpp_id, [
              { labelId: labelWppId, type: action === 'assign' ? 'add' : 'remove' },
            ]);
          } catch (err) {
            console.error(`[labels PUT] WhatsApp ${action} failed for chat ${chatRow.wpp_id}:`, err);
          }
        }
      }

      if (action === 'assign' && chatRow) {
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
      } else if (action === 'remove' && chatRow) {
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
    const labelWppId = (existing.wpp_id as string) || null;

    // Push delete to WhatsApp so the label disappears on the phone.
    if (labelWppId) {
      const client = manager.getClient(sessionIdVal);
      if (client) {
        try {
          await (client as unknown as { deleteLabel: (id: string | string[]) => Promise<void> }).deleteLabel(labelWppId);
        } catch (err) {
          console.error('[labels DELETE] WhatsApp delete failed:', err);
        }
      }
    }

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
