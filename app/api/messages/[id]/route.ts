import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import manager from '@/lib/wppconnect-manager';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!content) {
      return Response.json(
        { success: false, error: 'content is required' },
        { status: 400 }
      );
    }

    const db = getDb();
    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!msg) {
      return Response.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    const client = manager.getClient(msg.session_id as string);
    if (!client) {
      return Response.json(
        { success: false, error: 'Session is not connected' },
        { status: 400 }
      );
    }

    const wppId = msg.wpp_id as string;
    if (wppId) {
      await client.editMessage(wppId, content);
    }

    db.prepare(`UPDATE messages SET body = ? WHERE id = ?`).run(content, id);

    return Response.json({
      success: true,
      data: { id, body: content, edited: true },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to edit message' },
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

    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (!msg) {
      return Response.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    const client = manager.getClient(msg.session_id as string);
    if (client) {
      const wppId = msg.wpp_id as string;
      if (wppId) {
        try {
          const chatWppId = db.prepare(`SELECT wpp_id FROM chats WHERE id = ?`).get(msg.chat_id as string) as { wpp_id: string } | undefined;
          if (chatWppId) {
            await client.deleteMessage(chatWppId.wpp_id, [wppId], true);
          }
        } catch {
          // Message may no longer be deletable on WhatsApp
        }
      }
    }

    db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);

    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete message' },
      { status: 500 }
    );
  }
}
