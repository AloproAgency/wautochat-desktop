import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import manager from '@/lib/wppconnect-manager';
import type { Message } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chatId = searchParams.get('chatId');
    const sessionId = searchParams.get('sessionId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!chatId || !sessionId) {
      return Response.json(
        { success: false, error: 'chatId and sessionId are required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM messages WHERE chat_id = ? AND session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(chatId, sessionId, limit, offset) as Record<string, unknown>[];

    const messages: Message[] = rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      chatId: row.chat_id as string,
      wppId: row.wpp_id as string,
      type: row.type as Message['type'],
      body: row.body as string,
      sender: row.sender as string,
      senderName: (row.sender_name as string) || undefined,
      fromMe: !!(row.from_me),
      timestamp: row.timestamp as string,
      status: row.status as Message['status'],
      quotedMsgId: (row.quoted_msg_id as string) || undefined,
      mediaUrl: (row.media_url as string) || undefined,
      mediaType: (row.media_type as string) || undefined,
      caption: (row.caption as string) || undefined,
      isForwarded: !!(row.is_forwarded),
      labels: JSON.parse((row.labels as string) || '[]'),
    }));

    return Response.json({ success: true, data: messages });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to list messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, chatId, type, content, options } = body;

    if (!sessionId || !chatId || !type) {
      return Response.json(
        { success: false, error: 'sessionId, chatId, and type are required' },
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

    const opts = options || {};
    let result: Record<string, unknown>;

    switch (type) {
      case 'text': {
        result = await client.sendText(chatId, content || '', opts) as unknown as Record<string, unknown>;
        break;
      }

      case 'image': {
        const caption = opts.caption || content?.caption || '';
        const url = content?.url || content || '';
        result = await client.sendImage(chatId, url, 'image', caption) as unknown as Record<string, unknown>;
        break;
      }

      case 'video': {
        const videoCaption = opts.caption || content?.caption || '';
        const videoUrl = content?.url || content || '';
        result = await client.sendFile(chatId, videoUrl, 'video', videoCaption) as unknown as Record<string, unknown>;
        break;
      }

      case 'audio': {
        const audioUrl = content?.url || content || '';
        result = await client.sendFile(chatId, audioUrl, 'audio', '') as unknown as Record<string, unknown>;
        break;
      }

      case 'ptt': {
        const pttUrl = content?.url || content || '';
        result = await client.sendPtt(chatId, pttUrl) as unknown as Record<string, unknown>;
        break;
      }

      case 'document': {
        const docUrl = content?.url || content || '';
        const docName = content?.fileName || opts.fileName || 'document';
        const docCaption = opts.caption || content?.caption || '';
        result = await client.sendFile(chatId, docUrl, docName, docCaption) as unknown as Record<string, unknown>;
        break;
      }

      case 'sticker': {
        const stickerUrl = content?.url || content || '';
        result = await client.sendImageAsSticker(chatId, stickerUrl) as unknown as Record<string, unknown>;
        break;
      }

      case 'contact': {
        const contactId = content?.contactId || content || '';
        result = await client.sendContactVcard(chatId, contactId, '') as unknown as Record<string, unknown>;
        break;
      }

      case 'location': {
        const lat = content?.latitude || content?.lat || '0';
        const lng = content?.longitude || content?.lng || '0';
        const locTitle = content?.title || '';
        result = await client.sendLocation(chatId, lat, lng, locTitle) as unknown as Record<string, unknown>;
        break;
      }

      case 'link': {
        const linkUrl = content?.url || content || '';
        const linkText = content?.text || content?.description || linkUrl;
        result = await client.sendText(chatId, `${linkText}\n${linkUrl}`) as unknown as Record<string, unknown>;
        break;
      }

      case 'list': {
        result = await client.sendListMessage(chatId, {
          buttonText: content?.buttonText || 'Options',
          description: content?.description || '',
          title: content?.title || '',
          footer: content?.footer || '',
          sections: (content?.sections || []).map((s: Record<string, unknown>) => ({
            title: s.title || '',
            rows: ((s.rows as Array<Record<string, unknown>>) || []).map((r) => ({
              title: r.title || '',
              description: r.description || '',
              rowId: r.rowId || r.id || '',
            })),
          })),
        }) as unknown as Record<string, unknown>;
        break;
      }

      case 'poll': {
        const pollName = content?.name || content?.question || '';
        const pollChoices = content?.choices || content?.options || [];
        const selectableCount = content?.allowMultiple ? pollChoices.length : 1;
        result = await client.sendPollMessage(chatId, pollName, pollChoices, {
          selectableCount,
        }) as unknown as Record<string, unknown>;
        break;
      }

      case 'reaction': {
        const reactionMsgId = content?.messageId || '';
        const emoji = content?.emoji || content?.reaction || '';
        await client.sendReactionToMessage(reactionMsgId, emoji);
        result = { id: reactionMsgId, reaction: emoji };
        break;
      }

      default:
        return Response.json(
          { success: false, error: `Unsupported message type: ${type}` },
          { status: 400 }
        );
    }

    // Store sent message in DB
    const db = getDb();

    // Ensure chat exists
    let chatRow = db.prepare(
      `SELECT id FROM chats WHERE session_id = ? AND wpp_id = ?`
    ).get(sessionId, chatId) as { id: string } | undefined;

    if (!chatRow) {
      const newChatId = uuidv4();
      db.prepare(
        `INSERT INTO chats (id, session_id, wpp_id, name, is_group, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      ).run(newChatId, sessionId, chatId, chatId, chatId.includes('@g.us') ? 1 : 0);
      chatRow = { id: newChatId };
    }

    const msgId = uuidv4();
    const wppMsgId = (result.id as Record<string, unknown>)?._serialized as string || (result.id as string) || '';
    const msgBody = typeof content === 'string' ? content : (content?.text || content?.caption || content?.url || '');

    db.prepare(
      `INSERT INTO messages (id, session_id, chat_id, wpp_id, type, body, sender, from_me, timestamp, status)
       VALUES (?, ?, ?, ?, ?, ?, 'me', 1, datetime('now'), 'sent')`
    ).run(msgId, sessionId, chatRow.id, wppMsgId, type, msgBody);

    db.prepare(
      `UPDATE chats SET last_message_id = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(msgId, chatRow.id);

    return Response.json({
      success: true,
      data: {
        id: msgId,
        wppId: wppMsgId,
        type,
        chatId: chatRow.id,
        status: 'sent',
      },
    }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    );
  }
}
