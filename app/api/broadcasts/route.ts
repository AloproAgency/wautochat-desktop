import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Broadcast } from '@/lib/types';

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
      `SELECT * FROM broadcasts WHERE session_id = ? ORDER BY created_at DESC`
    ).all(sessionId) as Record<string, unknown>[];

    const broadcasts: Broadcast[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      name: row.name as string,
      recipients: JSON.parse((row.recipients as string) || '[]'),
      messageTemplate: row.message_template as string,
      messageType: row.message_type as Broadcast['messageType'],
      status: row.status as Broadcast['status'],
      sentCount: row.sent_count as number,
      failedCount: row.failed_count as number,
      totalCount: row.total_count as number,
      scheduledAt: (row.scheduled_at as string) || undefined,
      createdAt: row.created_at as string,
    }));

    return Response.json({ success: true, data: broadcasts });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list broadcasts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, name, recipients, messageTemplate, messageType } = body;

    if (!sessionId || !name || !recipients || !messageTemplate) {
      return Response.json(
        { success: false, error: 'sessionId, name, recipients, and messageTemplate are required' },
        { status: 400 }
      );
    }

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const db = getDb();
    const broadcastId = uuidv4();
    const recipientList: string[] = recipients;
    const type = messageType || 'text';

    db.prepare(
      `INSERT INTO broadcasts (id, session_id, name, recipients, message_template, message_type, status, sent_count, failed_count, total_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'sending', 0, 0, ?, datetime('now'))`
    ).run(
      broadcastId,
      sessionId,
      name,
      JSON.stringify(recipientList),
      messageTemplate,
      type,
      recipientList.length
    );

    // Send messages asynchronously
    (async () => {
      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of recipientList) {
        try {
          switch (type) {
            case 'text':
              await client.sendText(recipient, messageTemplate);
              break;
            case 'image':
              await client.sendImage(recipient, messageTemplate, 'image', '');
              break;
            case 'video':
              await client.sendFile(recipient, messageTemplate, 'video', '');
              break;
            case 'audio':
              await client.sendFile(recipient, messageTemplate, 'audio', '');
              break;
            case 'document':
              await client.sendFile(recipient, messageTemplate, 'document', '');
              break;
            default:
              await client.sendText(recipient, messageTemplate);
          }
          sentCount++;
        } catch {
          failedCount++;
        }

        // Update progress in DB
        db.prepare(
          `UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?`
        ).run(sentCount, failedCount, broadcastId);

        // Small delay between messages to avoid being flagged
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // Mark as complete
      const finalStatus = failedCount === recipientList.length ? 'failed' : 'sent';
      db.prepare(
        `UPDATE broadcasts SET status = ?, sent_count = ?, failed_count = ? WHERE id = ?`
      ).run(finalStatus, sentCount, failedCount, broadcastId);
    })();

    const broadcast: Broadcast = {
      id: broadcastId,
      sessionId,
      name,
      recipients: recipientList,
      messageTemplate,
      messageType: type,
      status: 'sending',
      sentCount: 0,
      failedCount: 0,
      totalCount: recipientList.length,
      createdAt: new Date().toISOString(),
    };

    return Response.json({ success: true, data: broadcast }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create broadcast' },
      { status: 500 }
    );
  }
}
