import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare(`SELECT * FROM broadcasts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return Response.json({ success: false, error: 'Broadcast not found' }, { status: 404 });
    }

    return Response.json({
      success: true,
      data: {
        id: row.id,
        sessionId: row.session_id,
        name: row.name,
        recipients: JSON.parse((row.recipients as string) || '[]'),
        messageTemplate: row.message_template,
        messageType: row.message_type,
        status: row.status,
        sentCount: row.sent_count,
        failedCount: row.failed_count,
        totalCount: row.total_count,
        scheduledAt: row.scheduled_at || undefined,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get broadcast' },
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

    const row = db.prepare(`SELECT id FROM broadcasts WHERE id = ?`).get(id);
    if (!row) {
      return Response.json({ success: false, error: 'Broadcast not found' }, { status: 404 });
    }

    db.prepare(`DELETE FROM broadcasts WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete broadcast' },
      { status: 500 }
    );
  }
}
