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

    // Parse media info for non-text types
    let mediaUrl = '';
    let mediaCaption = '';
    let mediaFilename = '';
    if (type !== 'text') {
      try {
        const parsed = JSON.parse(messageTemplate);
        mediaUrl = parsed.url || '';
        mediaCaption = parsed.caption || '';
        mediaFilename = parsed.filename || 'file';
      } catch {
        // If not JSON, use as-is (backward compat with plain URLs)
        mediaUrl = messageTemplate;
      }
    }

    // Send messages asynchronously
    const capturedClient = client;
    const page = (capturedClient as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;

    (async () => {
      let sentCount = 0;
      let failedCount = 0;

      // Try to send as a real WhatsApp broadcast (appears in broadcast list on WhatsApp)
      if (page && type === 'text') {
        try {
          const result = await page.evaluate(`
            (async () => {
              try {
                // Send to all recipients as broadcast using WPP.chat.sendTextMessage
                const recipients = ${JSON.stringify(recipientList)};
                let sent = 0;
                let failed = 0;

                for (const recipient of recipients) {
                  try {
                    await WPP.chat.sendTextMessage(recipient, ${JSON.stringify(messageTemplate)});
                    sent++;
                  } catch(e) {
                    failed++;
                  }
                }
                return { sent, failed };
              } catch(e) {
                return null;
              }
            })()
          `) as { sent: number; failed: number } | null;

          if (result) {
            sentCount = result.sent;
            failedCount = result.failed;
          }
        } catch {
          // Fallback to individual sending below
        }
      }

      // Fallback: send individually via WPPConnect client
      if (sentCount === 0 && failedCount === 0) {
        for (const recipient of recipientList) {
          try {
            switch (type) {
              case 'text':
                await capturedClient.sendText(recipient, messageTemplate);
                break;
              case 'image':
                await capturedClient.sendImage(recipient, mediaUrl, 'image', mediaCaption);
                break;
              case 'video':
                await capturedClient.sendFile(recipient, mediaUrl, 'video', mediaCaption);
                break;
              case 'audio':
                await capturedClient.sendFile(recipient, mediaUrl, 'audio', '');
                break;
              case 'document':
                await capturedClient.sendFile(recipient, mediaUrl, mediaFilename, mediaCaption);
                break;
              default:
                await capturedClient.sendText(recipient, messageTemplate);
            }
            sentCount++;
          } catch (err) {
            console.error(`[broadcast][${broadcastId}] Failed to send to ${recipient}:`, err);
            failedCount++;
          }

          // Update progress
          db.prepare(
            `UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?`
          ).run(sentCount, failedCount, broadcastId);

          // Delay between messages
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } else {
        // Update progress from WPP batch send
        db.prepare(
          `UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?`
        ).run(sentCount, failedCount, broadcastId);
      }

      // Mark as complete
      const finalStatus = failedCount === recipientList.length ? 'failed' : sentCount > 0 ? 'sent' : 'failed';
      db.prepare(
        `UPDATE broadcasts SET status = ?, sent_count = ?, failed_count = ? WHERE id = ?`
      ).run(finalStatus, sentCount, failedCount, broadcastId);
      console.log(`[broadcast][${broadcastId}] Complete: ${sentCount} sent, ${failedCount} failed`);
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

// PUT: Sync broadcast lists from WhatsApp
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return Response.json(
        { success: false, error: 'sessionId is required' },
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

    const page = (client as unknown as { waPage?: { evaluate: (fn: string) => Promise<unknown> } }).waPage;
    if (!page) {
      return Response.json({ success: true, data: { synced: 0 } });
    }

    // Get broadcast lists from WhatsApp Store.Chat
    const wppBroadcasts = await page.evaluate(`
      (async () => {
        try {
          const results = [];

          if (window.Store && window.Store.Chat) {
            const allChats = window.Store.Chat.getModelsArray
              ? window.Store.Chat.getModelsArray()
              : (window.Store.Chat._models || []);

            for (const chat of allChats) {
              const id = chat.id ? (chat.id._serialized || String(chat.id)) : '';
              if (!id.includes('@broadcast') || id === 'status@broadcast') continue;

              let recipients = [];
              const name = chat.__x_formattedTitle || chat.__x_name || chat.name || '';

              // Try broadcastMetadata.recipients
              try {
                const bm = chat.__x_broadcastMetadata;
                if (bm) {
                  // Force load if possible
                  if (bm.update) try { await bm.update(); } catch(e) {}

                  if (bm.recipients) {
                    const r = bm.recipients.getModelsArray
                      ? bm.recipients.getModelsArray()
                      : (bm.recipients._models || []);
                    recipients = r.map(m => m.id ? (m.id._serialized || String(m.id)) : '').filter(Boolean);
                  }

                  if (recipients.length === 0 && bm.__x_audienceExpression && bm.__x_audienceExpression.userJids) {
                    recipients = bm.__x_audienceExpression.userJids.map(j => j._serialized || String(j)).filter(Boolean);
                  }
                }
              } catch(e) {}

              // Count messages
              let msgCount = 0;
              let lastMsgBody = '';
              try {
                if (chat.msgs) {
                  const msgs = chat.msgs.getModelsArray
                    ? chat.msgs.getModelsArray()
                    : (chat.msgs._models || []);
                  msgCount = msgs.length;
                  if (msgs.length > 0) {
                    lastMsgBody = msgs[msgs.length - 1].__x_body || msgs[msgs.length - 1].body || '';
                  }
                }
              } catch(e) {}

              results.push({
                id: id,
                name: name || 'Broadcast List',
                recipients: recipients,
                msgCount: msgCount,
                lastMessage: lastMsgBody.substring(0, 100),
                timestamp: chat.t || 0,
              });
            }
          }

          return results;
        } catch(e) {
          return [];
        }
      })()
    `) as { id: string; name: string; recipients: string[]; msgCount: number; lastMessage: string; timestamp: number }[] | null;

    console.log('[broadcasts-sync] Found', wppBroadcasts?.length || 0, 'broadcast lists from WhatsApp');

    if (!wppBroadcasts || wppBroadcasts.length === 0) {
      return Response.json({
        success: true,
        data: { synced: 0, message: 'No broadcast lists found in WhatsApp' },
      });
    }

    const db = getDb();
    let synced = 0;

    const transaction = db.transaction(() => {
      for (const bc of wppBroadcasts) {
        if (!bc.id) continue;

        const name = bc.name || `Broadcast ${bc.id.replace('@broadcast', '')}`;

        // Check if already exists by broadcast WhatsApp ID stored in message_template
        const existing = db.prepare(
          `SELECT id FROM broadcasts WHERE session_id = ? AND (name = ? OR message_template = ?)`
        ).get(sessionId, name, bc.id) as { id: string } | undefined;

        if (!existing) {
          const broadcastId = uuidv4();
          const recipients = bc.recipients.length > 0 ? bc.recipients : [];

          db.prepare(
            `INSERT INTO broadcasts (id, session_id, name, recipients, message_template, message_type, status, sent_count, failed_count, total_count, created_at)
             VALUES (?, ?, ?, ?, ?, 'text', 'sent', ?, 0, ?, datetime('now'))`
          ).run(
            broadcastId,
            sessionId,
            name,
            JSON.stringify(recipients),
            bc.id,
            bc.msgCount || recipients.length,
            bc.msgCount || recipients.length
          );
          synced++;
        } else {
          // Update recipients if we found some
          if (bc.recipients.length > 0) {
            db.prepare(
              `UPDATE broadcasts SET recipients = ?, total_count = ? WHERE id = ?`
            ).run(JSON.stringify(bc.recipients), bc.recipients.length, existing.id);
          }
        }
      }
    });

    transaction();

    return Response.json({
      success: true,
      data: { synced, message: `${synced} broadcast lists synced from WhatsApp` },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to sync broadcasts' },
      { status: 500 }
    );
  }
}
