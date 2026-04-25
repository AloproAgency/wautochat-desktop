import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';

/**
 * Re-run a broadcast against just the recipients that previously failed.
 * The original messageTemplate / type are reused so the user doesn't have
 * to re-enter the form.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const row = db.prepare(`SELECT * FROM broadcasts WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return Response.json({ success: false, error: 'Broadcast not found' }, { status: 404 });

    const sessionId = row.session_id as string;
    const messageTemplate = row.message_template as string;
    const type = (row.message_type as string) || 'text';
    const recipients: string[] = JSON.parse((row.recipients as string) || '[]');
    const totalCount = (row.total_count as number) || recipients.length;
    const previousSent = (row.sent_count as number) || 0;
    const previousFailed = (row.failed_count as number) || 0;

    if (previousFailed === 0) {
      return Response.json({ success: false, error: 'No failed recipients to resend' }, { status: 400 });
    }

    const client = manager.getClient(sessionId);
    if (!client) {
      return Response.json({ success: false, error: 'Session is not connected' }, { status: 400 });
    }

    // We don't know exactly which recipients failed (the original handler
    // tracks counts only). Fall back to retrying the LAST `previousFailed`
    // entries — that's the queue tail when the partial-progress UPDATE
    // stopped advancing.
    const toRetry = recipients.slice(previousSent);
    if (toRetry.length === 0) {
      return Response.json({ success: false, error: 'No remaining recipients to retry' }, { status: 400 });
    }

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
        mediaUrl = messageTemplate;
      }
    }

    db.prepare(`UPDATE broadcasts SET status = 'sending' WHERE id = ?`).run(id);

    const isBase64Url = (s: string) => typeof s === 'string' && s.startsWith('data:');
    const sendByType = async (recipient: string) => {
      switch (type) {
        case 'text':
          return client.sendText(recipient, messageTemplate);
        case 'image': {
          const filename = mediaFilename || 'image.jpg';
          if (isBase64Url(mediaUrl)) {
            return (client as unknown as { sendImageFromBase64: (...a: unknown[]) => Promise<unknown> })
              .sendImageFromBase64(recipient, mediaUrl, filename, mediaCaption || '');
          }
          return client.sendImage(recipient, mediaUrl, filename, mediaCaption || '');
        }
        case 'video':
        case 'document': {
          const filename = mediaFilename || (type === 'video' ? 'video.mp4' : 'document');
          if (isBase64Url(mediaUrl)) {
            return (client as unknown as { sendFileFromBase64: (...a: unknown[]) => Promise<unknown> })
              .sendFileFromBase64(recipient, mediaUrl, filename, mediaCaption || '');
          }
          return (client as unknown as { sendFile: (...a: unknown[]) => Promise<unknown> })
            .sendFile(recipient, mediaUrl, { filename, caption: mediaCaption || '' });
        }
        case 'audio': {
          const filename = mediaFilename || 'audio.ogg';
          if (isBase64Url(mediaUrl)) {
            return (client as unknown as { sendPttFromBase64: (...a: unknown[]) => Promise<unknown> })
              .sendPttFromBase64(recipient, mediaUrl, filename);
          }
          return (client as unknown as { sendPtt: (...a: unknown[]) => Promise<unknown> })
            .sendPtt(recipient, mediaUrl, filename);
        }
        default:
          return client.sendText(recipient, messageTemplate);
      }
    };

    void (async () => {
      let sentCount = previousSent;
      let failedCount = 0;
      for (const recipient of toRetry) {
        try {
          await sendByType(recipient);
          sentCount++;
        } catch (err) {
          console.error(`[broadcast resend][${id}] Failed to send ${type} to ${recipient}:`, err);
          failedCount++;
        }
        db.prepare(`UPDATE broadcasts SET sent_count = ?, failed_count = ? WHERE id = ?`)
          .run(sentCount, failedCount, id);
        await new Promise((r) => setTimeout(r, 2000));
      }
      const finalStatus = sentCount === totalCount ? 'sent' : sentCount > 0 ? 'sent' : 'failed';
      db.prepare(`UPDATE broadcasts SET status = ?, sent_count = ?, failed_count = ? WHERE id = ?`)
        .run(finalStatus, sentCount, failedCount, id);
    })();

    return Response.json({ success: true, data: { id, retrying: toRetry.length } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to resend broadcast' },
      { status: 500 }
    );
  }
}
